// backend/routes/sessions.js
const express = require('express');
const pool    = require('../config/database');
const auth    = require('../middleware/auth');

const router = express.Router();

// ── GET /api/sessions/active ─────────────────────────────────────────────────
router.get('/active', auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
         s.id,
         s.started_at,
         s.expires_at,
         s.data_used_mb,
         s.ip_address,
         EXTRACT(EPOCH FROM (s.expires_at - NOW())) AS seconds_remaining,
         p.name      AS package_name,
         p.speed_mbps,
         p.duration_hours,
         py.mpesa_receipt_number,
         py.amount_kes
       FROM sessions s
       JOIN packages p  ON s.package_id = p.id
       JOIN payments py ON s.payment_id = py.id
       WHERE s.user_id = $1
         AND s.status  = 'active'
         AND s.expires_at > NOW()
       ORDER BY s.started_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, data: { session: null } });
    }

    res.json({ success: true, data: { session: result.rows[0] } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/sessions/history ────────────────────────────────────────────────
router.get('/history', auth, async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(50, parseInt(req.query.limit || '10'));
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT
         s.id,
         s.started_at,
         s.expires_at,
         s.status,
         s.data_used_mb,
         p.name    AS package_name,
         p.duration_hours,
         p.speed_mbps,
         py.amount_kes,
         py.mpesa_receipt_number,
         py.created_at AS payment_date
       FROM sessions s
       JOIN packages p  ON s.package_id = p.id
       JOIN payments py ON s.payment_id = py.id
       WHERE s.user_id = $1
       ORDER BY s.started_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM sessions WHERE user_id = $1',
      [req.user.id]
    );

    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: {
        sessions:   result.rows,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/sessions/weekly-spending ────────────────────────────────────────
// Returns daily spending totals for the last 7 days (for the dashboard chart)
router.get('/weekly-spending', auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
         TO_CHAR(py.created_at::date, 'Dy') AS day_name,
         py.created_at::date AS day_date,
         COALESCE(SUM(py.amount_kes), 0) AS total_spent
       FROM payments py
       WHERE py.user_id = $1
         AND py.status = 'completed'
         AND py.created_at >= NOW() - INTERVAL '7 days'
       GROUP BY py.created_at::date, TO_CHAR(py.created_at::date, 'Dy')
       ORDER BY py.created_at::date ASC`,
      [req.user.id]
    );

    // Build a full 7-day array (fill missing days with 0)
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const found = result.rows.find(r => r.day_date.toISOString().slice(0, 10) === dateStr);
      days.push({
        day: dayName,
        date: dateStr,
        total: found ? parseFloat(found.total_spent) : 0,
      });
    }

    res.json({ success: true, data: { spending: days } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/sessions/start ─────────────────────────────────────────────────
// Called manually if callback was delayed — finds the completed payment & creates session
router.post('/start', auth, async (req, res, next) => {
  try {
    const { payment_id } = req.body;

    // Validate payment belongs to user and is completed
    const payResult = await pool.query(
      `SELECT p.id, p.package_id, pkg.duration_hours
       FROM payments p
       JOIN packages pkg ON p.package_id = pkg.id
       WHERE p.id = $1 AND p.user_id = $2 AND p.status = 'completed'`,
      [payment_id, req.user.id]
    );

    if (payResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Completed payment not found.' });
    }

    const pay = payResult.rows[0];

    // Check session doesn't already exist for this payment
    const existing = await pool.query(
      'SELECT id FROM sessions WHERE payment_id = $1',
      [pay.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Session already exists for this payment.' });
    }

    const expiresAt = new Date(Date.now() + pay.duration_hours * 3600 * 1000);
    const sessionResult = await pool.query(
      `INSERT INTO sessions (user_id, package_id, payment_id, expires_at, ip_address)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, pay.package_id, pay.id, expiresAt.toISOString(), req.ip]
    );

    res.status(201).json({ success: true, data: { session: sessionResult.rows[0] } });
  } catch (err) {
    next(err);
  }
});

// Auto-expire sessions (cron-like — called on demand or via setInterval)
const expireSessions = async () => {
  try {
    await pool.query(
      `UPDATE sessions SET status = 'expired'
       WHERE status = 'active' AND expires_at < NOW()`
    );
  } catch (err) {
    console.error('[Session Expiry]', err.message);
  }
};

module.exports = { router, expireSessions };
