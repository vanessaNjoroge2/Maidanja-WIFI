// backend/routes/packages.js
const express = require('express');
const pool    = require('../config/database');
const auth    = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// ── GET /api/packages ────────────────────────────────────────────────────────
// Public — no auth required
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, duration_hours, price_kes, speed_mbps, description, sort_order
       FROM packages
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, price_kes ASC`
    );
    res.json({ success: true, data: { packages: result.rows } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/packages/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, duration_hours, price_kes, speed_mbps, description
       FROM packages WHERE id = $1 AND is_active = TRUE`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Package not found.' });
    }
    res.json({ success: true, data: { package: result.rows[0] } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/packages  (Admin only) ─────────────────────────────────────────
router.post(
  '/',
  auth, adminOnly,
  [
    body('name').notEmpty(),
    body('duration_hours').isInt({ min: 1 }),
    body('price_kes').isFloat({ min: 1 }),
    body('speed_mbps').isInt({ min: 1 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', error: errors.array() });
      }
      const { name, duration_hours, price_kes, speed_mbps, description, sort_order } = req.body;
      const result = await pool.query(
        `INSERT INTO packages (name, duration_hours, price_kes, speed_mbps, description, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [name, duration_hours, price_kes, speed_mbps, description || null, sort_order || 0]
      );
      res.status(201).json({ success: true, data: { package: result.rows[0] } });
    } catch (err) {
      next(err);
    }
  }
);

// ── PUT /api/packages/:id (Admin only) ───────────────────────────────────────
router.put('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const { name, duration_hours, price_kes, speed_mbps, description, is_active, sort_order } = req.body;
    const result = await pool.query(
      `UPDATE packages SET
         name = COALESCE($1, name),
         duration_hours = COALESCE($2, duration_hours),
         price_kes = COALESCE($3, price_kes),
         speed_mbps = COALESCE($4, speed_mbps),
         description = COALESCE($5, description),
         is_active = COALESCE($6, is_active),
         sort_order = COALESCE($7, sort_order)
       WHERE id = $8 RETURNING *`,
      [name, duration_hours, price_kes, speed_mbps, description, is_active, sort_order, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Package not found.' });
    }
    res.json({ success: true, data: { package: result.rows[0] } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
