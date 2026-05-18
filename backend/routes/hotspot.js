// backend/routes/hotspot.js
/**
 * Hotspot Authentication & Session Management
 * Handles WiFi credentials after M-Pesa payment
 */

const express = require('express');
const { v4: uuid } = require('uuid');
const pool = require('../config/database');
const auth = require('../middleware/auth');
const mikrotikService = require('../services/mikrotikService');

const router = express.Router();

/**
 * POST /api/hotspot/login
 * Authenticate user to hotspot after payment
 * Returns temporary WiFi credentials
 */
router.post('/login', auth, async (req, res, next) => {
  try {
    const { packageId } = req.body;
    const userId = req.user.id;
    const phone = req.user.phone_number;

    // Validate payment exists for this user
    const paymentResult = await pool.query(
      `SELECT p.*, pkg.speed_mbps, pkg.duration_hours
       FROM payments p
       JOIN packages pkg ON p.package_id = pkg.id
       WHERE p.user_id = $1 AND p.package_id = $2 AND p.status = 'completed'
       ORDER BY p.completed_at DESC LIMIT 1`,
      [userId, packageId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid payment found for this package',
      });
    }

    const payment = paymentResult.rows[0];

    // Check for active session (only 1 per user)
    const activeSessionResult = await pool.query(
      `SELECT * FROM sessions 
       WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );

    if (activeSessionResult.rows.length > 0) {
      const existingSession = activeSessionResult.rows[0];
      return res.status(409).json({
        success: false,
        message: 'You already have an active session',
        existingSession: {
          expiresAt: existingSession.expires_at,
          hotspotUsername: existingSession.hotspot_user_id,
        },
      });
    }

    // Create hotspot user in MikroTik
    const hotspotUser = await mikrotikService.createHotspotUser(
      phone,
      payment.speed_mbps,
      payment.duration_hours
    );

    // Set bandwidth limits
    if (payment.speed_mbps) {
      await mikrotikService.setBandwidthLimit(
        hotspotUser.username,
        payment.speed_mbps, // Download
        payment.speed_mbps / 2 // Upload (half of download)
      );
    }

    // Create session
    const session = await mikrotikService.createSession(
      userId,
      phone,
      hotspotUser.hotspotUserId,
      hotspotUser.username,
      packageId,
      payment.duration_hours
    );

    // Return WiFi credentials
    res.json({
      success: true,
      message: 'Hotspot credentials generated',
      data: {
        sessionId: session.sessionId,
        hotspot: {
          username: hotspotUser.username,
          password: hotspotUser.password,
          ssid: process.env.HOTSPOT_SSID || 'Maidanja',
          address: process.env.HOTSPOT_ADDRESS || '192.168.100.1',
        },
        session: {
          expiresAt: session.expiresAt,
          durationHours: session.durationHours,
          package: {
            name: payment.name,
            speed: `${payment.speed_mbps} Mbps`,
            duration: formatDuration(payment.duration_hours),
          },
        },
        instructions: {
          step1: 'Connect to WiFi network',
          step2: 'Open browser to any website',
          step3: 'Login with provided credentials',
          step4: 'Enjoy high-speed internet',
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/hotspot/status
 * Get current hotspot session status
 */
router.get('/status', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const sessionResult = await pool.query(
      `SELECT s.*, p.name as package_name, p.speed_mbps
       FROM sessions s
       JOIN packages p ON s.package_id = p.id
       WHERE s.user_id = $1 AND s.status = 'active'
       LIMIT 1`,
      [userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.json({
        success: true,
        data: { session: null, message: 'No active session' },
      });
    }

    const session = sessionResult.rows[0];
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    const timeRemaining = Math.max(0, expiresAt - now);
    const percentRemaining = (timeRemaining / (session.duration_hours * 3600000)) * 100;

    // Get real-time stats from MikroTik
    const stats = await mikrotikService.getUserStats(session.hotspot_user_id);

    res.json({
      success: true,
      data: {
        session: {
          id: session.id,
          packageName: session.package_name,
          speed: `${session.speed_mbps} Mbps`,
          status: session.status,
          startedAt: session.started_at,
          expiresAt: session.expires_at,
          timeRemaining,
          percentRemaining,
          hotspotStatus: stats.isActive ? 'online' : 'offline',
          bytesDownloaded: stats.bytesIn || 0,
          bytesUploaded: stats.bytesOut || 0,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/hotspot/disconnect
 * Manually disconnect user
 */
router.post('/disconnect', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const sessionResult = await pool.query(
      `SELECT * FROM sessions 
       WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active session to disconnect',
      });
    }

    const session = sessionResult.rows[0];

    // Disconnect from MikroTik
    await mikrotikService.disconnectUser(
      session.hotspot_user_id,
      session.id,
      'manual_disconnect'
    );

    // Update session status
    await pool.query(
      `UPDATE sessions 
       SET status = 'disconnected', ended_at = NOW()
       WHERE id = $1`,
      [session.id]
    );

    res.json({
      success: true,
      message: 'Session disconnected successfully',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/hotspot/health
 * Check hotspot system health
 */
router.get('/health', auth, async (req, res, next) => {
  try {
    const mode = mikrotikService.getMode();
    const activeSessions = await mikrotikService.getActiveSessionCount();

    // Get stats from last hour
    const statsResult = await pool.query(
      `SELECT 
        COUNT(*) as total_sessions,
        SUM(EXTRACT(EPOCH FROM (ended_at - started_at))) as total_session_time,
        AVG(bytes_downloaded + bytes_uploaded) as avg_data_used
       FROM sessions 
       WHERE started_at > NOW() - INTERVAL '1 hour' AND status IN ('expired', 'disconnected')`
    );

    const stats = statsResult.rows[0];

    res.json({
      success: true,
      data: {
        status: 'operational',
        mode: mode,
        activeSessions,
        statsLastHour: {
          totalSessions: parseInt(stats.total_sessions || 0),
          totalSessionTime: Math.floor((stats.total_session_time || 0) / 60), // minutes
          avgDataUsed: Math.floor((stats.avg_data_used || 0) / 1024 / 1024), // MB
        },
        timestamp: new Date(),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================
 */

function formatDuration(hours) {
  if (hours < 24) return `${hours} Hour${hours > 1 ? 's' : ''}`;
  if (hours < 168) return `${Math.floor(hours / 24)} Day${Math.floor(hours / 24) > 1 ? 's' : ''}`;
  return `${Math.floor(hours / 168)} Week${Math.floor(hours / 168) > 1 ? 's' : ''}`;
}

module.exports = router;
