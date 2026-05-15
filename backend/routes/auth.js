// backend/routes/auth.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool    = require('../config/database');
const auth    = require('../middleware/auth');

const router  = express.Router();

// ── Helper ───────────────────────────────────────────────────────────────────
const signToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET || 'fallback_secret_for_dev_only', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// ── Helper: Normalize phone number ────────────────────────────────────────
const normalizePhoneNumber = (phone) => {
  // Remove spaces, dashes, parentheses, and +
  let normalized = phone.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  // If starts with 07, replace with 254
  if (normalized.startsWith('07')) normalized = '254' + normalized.slice(1);
  // Validate format: 254 + 9 digits
  if (!/^254\d{9}$/.test(normalized)) return null;
  return normalized;
};

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post(
  '/register',
  [
    body('phone_number')
      .notEmpty().withMessage('Phone number is required')
      .custom(val => {
        const normalized = normalizePhoneNumber(val);
        if (!normalized) throw new Error('Phone must be a valid Kenyan number (e.g., 254712345678 or 0712345678)');
        return true;
      }),
    body('password')
      .notEmpty().withMessage('Password is required')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('name').optional().trim().isLength({ max: 100 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', error: errors.array() });
      }

      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(req.body.phone_number);
      if (!normalizedPhone) {
        return res.status(400).json({ success: false, message: 'Invalid phone number format' });
      }

      const { password, name } = req.body;

      // Check duplicate
      const existing = await pool.query(
        'SELECT id FROM users WHERE phone_number = $1',
        [normalizedPhone]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'Phone number already registered.' });
      }

      const password_hash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        `INSERT INTO users (phone_number, name, password_hash, role)
         VALUES ($1, $2, $3, 'user')
         RETURNING id, phone_number, name, role, created_at`,
        [normalizedPhone, name || null, password_hash]
      );

      const user  = result.rows[0];
      console.log(`✅ New user registered: ${user.phone_number} (ID: ${user.id})`);
      
      const token = signToken(user.id);

      res.status(201).json({
        success: true,
        message: 'Registration successful.',
        data: { token, user },
      });
    } catch (err) {
      console.error('❌ Registration error:', err.message);
      next(err);
    }
  }
);

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post(
  '/login',
  [
    body('phone_number')
      .notEmpty().withMessage('Phone number is required')
      .custom(val => {
        const normalized = normalizePhoneNumber(val);
        if (!normalized) throw new Error('Phone must be a valid Kenyan number (e.g., 254712345678 or 0712345678)');
        return true;
      }),
    body('password')
      .notEmpty().withMessage('Password is required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', error: errors.array() });
      }

      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(req.body.phone_number);
      if (!normalizedPhone) {
        return res.status(401).json({ success: false, message: 'Invalid phone number or password.' });
      }

      const { password } = req.body;

      const result = await pool.query(
        'SELECT id, phone_number, name, role, password_hash, is_active FROM users WHERE phone_number = $1',
        [normalizedPhone]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ success: false, message: 'Invalid phone number or password.' });
      }

      const user = result.rows[0];
      if (!user.is_active) {
        return res.status(403).json({ success: false, message: 'Account is deactivated.' });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid phone number or password.' });
      }

      // Update last login
      await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
      
      console.log(`✅ User login successful: ${user.phone_number}`);

      const token = signToken(user.id);
      const { password_hash, ...safeUser } = user;

      res.json({
        success: true,
        message: 'Login successful.',
        data: { token, user: safeUser },
      });
    } catch (err) {
      console.error('❌ Login error:', err.message);
      next(err);
    }
  }
);

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  res.json({
    success: true,
    data: { user: req.user },
  });
});

module.exports = router;
