// backend/routes/admin.js
const express   = require('express');
const { param, validationResult } = require('express-validator');
const pool      = require('../config/database');
const auth      = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const mikrotikService = require('../services/mikrotikService');

const router = express.Router();

// ── Validation middleware for common checks ──────────────
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }
  next();
};

// All admin routes require JWT + admin role
router.use(auth, adminOnly);

// ── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const [users, sessions, revenue, todayRevenue] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users WHERE role = $1', ['user']),
      pool.query("SELECT COUNT(*) FROM sessions WHERE status = 'active' AND expires_at > NOW()"),
      pool.query("SELECT COALESCE(SUM(amount_kes),0) AS total FROM payments WHERE status = 'completed'"),
      pool.query(`SELECT COALESCE(SUM(amount_kes),0) AS total FROM payments
                  WHERE status = 'completed' AND created_at >= CURRENT_DATE`),
    ]);

    res.json({
      success: true,
      data: {
        total_users:       parseInt(users.rows[0].count),
        active_sessions:   parseInt(sessions.rows[0].count),
        total_revenue_kes: parseFloat(revenue.rows[0].total),
        today_revenue_kes: parseFloat(todayRevenue.rows[0].total),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/sessions ──────────────────────────────────────────────────
router.get('/sessions', async (req, res, next) => {
  try {
    const { status } = req.query;
    const page  = Math.max(1, parseInt(req.query.page, 10)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const params = [];
    let where = '';

    if (status) {
      params.push(status);
      where = `WHERE s.status = $${params.length}`;
    }

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT
         s.id, s.status, s.started_at, s.expires_at, s.data_used_mb, s.ip_address,
         u.phone_number, u.name,
         p.name AS package_name, p.speed_mbps,
         py.amount_kes, py.mpesa_receipt_number
       FROM sessions s
       JOIN users u    ON s.user_id   = u.id
       JOIN packages p ON s.package_id = p.id
       JOIN payments py ON s.payment_id = py.id
       ${where}
       ORDER BY s.started_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM sessions s ${where}`,
      status ? [status] : []
    );

    res.json({
      success: true,
      data: {
        sessions:   result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', async (req, res, next) => {
  try {
    const { search } = req.query;
    const page  = Math.max(1, parseInt(req.query.page, 10)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const params = [];
    let where = '';

    if (search) {
      params.push(`%${search}%`);
      where = `WHERE u.phone_number ILIKE $1 OR u.name ILIKE $1`;
    }

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT
         u.id, u.phone_number, u.name, u.role, u.is_active, u.created_at, u.last_login_at,
         COUNT(DISTINCT s.id)  AS total_sessions,
         COALESCE(SUM(py.amount_kes) FILTER (WHERE py.status = 'completed'), 0) AS total_spent
       FROM users u
       LEFT JOIN sessions s  ON s.user_id = u.id
       LEFT JOIN payments py ON py.user_id = u.id
       ${where}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, data: { users: result.rows } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/transactions ──────────────────────────────────────────────
router.get('/transactions', async (req, res, next) => {
  try {
    const { status } = req.query;
    const page  = Math.max(1, parseInt(req.query.page, 10)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const params = [];
    let where = '';

    if (status) {
      params.push(status);
      where = `WHERE py.status = $${params.length}`;
    }

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT
         py.id, py.status, py.amount_kes, py.phone_number,
         py.mpesa_receipt_number, py.created_at,
         u.name, u.phone_number AS user_phone,
         p.name AS package_name
       FROM payments py
       JOIN users u    ON py.user_id    = u.id
       JOIN packages p ON py.package_id = p.id
       ${where}
       ORDER BY py.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, data: { transactions: result.rows } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/disconnect/:sessionId ────────────────────────────────────
router.post('/disconnect/:sessionId',
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  validateRequest,
  async (req, res, next) => {
  try {
    // Get session details
    const sessionResult = await pool.query(
      `SELECT * FROM sessions WHERE id = $1`,
      [req.params.sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    const session = sessionResult.rows[0];

    // Disconnect from MikroTik
    if (session.status === 'active') {
      await mikrotikService.disconnectUser(
        session.hotspot_user_id,
        session.id,
        'admin_forced_disconnect'
      );
    }

    // Update session status
    const result = await pool.query(
      `UPDATE sessions SET status = 'disconnected', ended_at = NOW()
       WHERE id = $1 RETURNING id, status`,
      [req.params.sessionId]
    );

    res.json({
      success: true,
      message: 'User disconnected successfully.',
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/hotspot/sessions ──────────────────────────────────────────
router.get('/hotspot/sessions', async (req, res, next) => {
  try {
    const { status = 'active' } = req.query;
    const page  = Math.max(1, parseInt(req.query.page, 10)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const sessionsResult = await pool.query(
      `SELECT
         s.id, s.status, s.started_at, s.expires_at,
         s.hotspot_user_id, s.bytes_downloaded, s.bytes_uploaded,
         u.phone_number, u.name,
         p.name AS package_name, p.speed_mbps,
         py.amount_kes
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       JOIN packages p ON s.package_id = p.id
       JOIN payments py ON py.id = (
         SELECT id FROM payments 
         WHERE user_id = s.user_id AND package_id = s.package_id 
         AND status = 'completed' 
         ORDER BY updated_at DESC LIMIT 1
       )
       WHERE s.status = $1
       ORDER BY s.started_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM sessions WHERE status = $1`,
      [status]
    );

    // Fetch all active stats from MikroTik in a single batch query
    const statsMap = await mikrotikService.getAllActiveUserStats();

    const enhancedSessions = sessionsResult.rows.map((session) => {
      const stats = statsMap.get(session.hotspot_user_id) || { isActive: false };
      const expiresAt = new Date(session.expires_at);
      const timeRemaining = Math.max(0, expiresAt - new Date());

      return {
        ...session,
        timeRemaining: Math.floor(timeRemaining / 1000), // seconds
        hotstatus: stats.isActive ? 'online' : 'offline',
        bytesIn: stats.bytesIn || 0,
        bytesOut: stats.bytesOut || 0,
      };
    });

    res.json({
      success: true,
      data: {
        sessions: enhancedSessions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count),
        },
        hotspotMode: mikrotikService.getMode(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/hotspot/stats ────────────────────────────────────────────
router.get('/hotspot/stats', async (req, res, next) => {
  try {
    const activeSessions = await mikrotikService.getActiveSessionCount();

    // Get hourly stats
    const hourlyResult = await pool.query(
      `SELECT 
         COUNT(*) as sessions_count,
         SUM(bytes_downloaded + bytes_uploaded) as total_bytes,
         AVG(bytes_downloaded + bytes_uploaded) as avg_bytes
       FROM sessions 
       WHERE status IN ('active', 'expired', 'disconnected')
       AND started_at >= NOW() - INTERVAL '1 hour'`
    );

    // Get daily stats
    const dailyResult = await pool.query(
      `SELECT 
         COUNT(*) as sessions_count,
         SUM(bytes_downloaded + bytes_uploaded) as total_bytes,
         COUNT(DISTINCT user_id) as unique_users
       FROM sessions 
       WHERE status IN ('active', 'expired', 'disconnected')
       AND started_at >= CURRENT_DATE`
    );

    const hourly = hourlyResult.rows[0];
    const daily = dailyResult.rows[0];

    res.json({
      success: true,
      data: {
        realtime: {
          activeSessions,
          mode: mikrotikService.getMode(),
        },
        lastHour: {
          sessionsCount: parseInt(hourly.sessions_count || 0),
          totalDataGB: parseFloat((hourly.total_bytes || 0) / 1024 / 1024 / 1024).toFixed(2),
          avgDataMB: parseFloat((hourly.avg_bytes || 0) / 1024 / 1024).toFixed(2),
        },
        today: {
          sessionsCount: parseInt(daily.sessions_count || 0),
          uniqueUsers: parseInt(daily.unique_users || 0),
          totalDataGB: parseFloat((daily.total_bytes || 0) / 1024 / 1024 / 1024).toFixed(2),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/hotspot/health ────────────────────────────────────────────
router.get('/hotspot/health', async (req, res, next) => {
  try {
    const activeSessions = await mikrotikService.getActiveSessionCount();
    const allSessions = await mikrotikService.getAllActiveSessions();

    // Calculate system health metrics
    const maxConcurrentSessions = parseInt(process.env.MAX_CONCURRENT_SESSIONS || 1000);
    const healthPercent = (activeSessions / maxConcurrentSessions) * 100;

    let healthStatus = 'healthy';
    if (healthPercent > 90) healthStatus = 'critical';
    else if (healthPercent > 75) healthStatus = 'warning';

    res.json({
      success: true,
      data: {
        status: healthStatus,
        activeSessions,
        maxCapacity: maxConcurrentSessions,
        capacityPercent: parseFloat(healthPercent.toFixed(1)),
        mode: mikrotikService.getMode(),
        uptime: process.uptime(),
        memoryUsage: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        },
        timestamp: new Date(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/hotspot/disconnect/:userId ──────────────────────────────
router.post('/hotspot/disconnect/:userId',
  param('userId').isUUID().withMessage('Invalid user ID format'),
  validateRequest,
  async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Get active session for this user
    const sessionResult = await pool.query(
      `SELECT * FROM sessions 
       WHERE user_id = $1 AND status = 'active'
       LIMIT 1`,
      [userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active session found for this user',
      });
    }

    const session = sessionResult.rows[0];

    // Disconnect from MikroTik
    await mikrotikService.disconnectUser(
      session.hotspot_user_id,
      session.id,
      'admin_force_disconnect'
    );

    // Update session
    await pool.query(
      `UPDATE sessions 
       SET status = 'disconnected', ended_at = NOW()
       WHERE id = $1`,
      [session.id]
    );

    res.json({
      success: true,
      message: 'User disconnected successfully',
      data: {
        sessionId: session.id,
        userId: userId,
        disconnectedAt: new Date(),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
