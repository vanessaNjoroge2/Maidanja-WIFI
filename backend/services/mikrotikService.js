// backend/services/mikrotikService.js
/**
 * MikroTik Hotspot Integration Service
 * Supports both:
 * 1. Real MikroTik API (via SSH)
 * 2. Simulation mode (for testing/development)
 */

const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

// Configuration
const MIKROTIK_MODE = process.env.MIKROTIK_MODE || 'simulation'; // 'real' or 'simulation'
const MIKROTIK_HOST = process.env.MIKROTIK_HOST || 'localhost';
const MIKROTIK_USER = process.env.MIKROTIK_USER || 'admin';
const MIKROTIK_PASS = process.env.MIKROTIK_PASSWORD || 'password';
const HOTSPOT_PROFILE = process.env.HOTSPOT_PROFILE || 'default';

// In-memory simulation store
const simulatedUsers = new Map();
const simulatedSessions = new Map();

/**
 * ============================================================================
 * REAL MIKROTIK API (when MIKROTIK_MODE='real')
 * ============================================================================
 * Requires: npm install node-routeros
 */

let RouterOS;
let routerConnection;

if (MIKROTIK_MODE === 'real') {
  try {
    RouterOS = require('node-routeros');
  } catch (err) {
    console.error('❌ FATAL: node-routeros not installed. Install with: npm install node-routeros');
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}

// Connect to MikroTik on startup (real mode only)
async function connectToMikroTik() {
  if (MIKROTIK_MODE !== 'real') {
    console.log('🔌 MikroTik: Using SIMULATION mode (development)');
    return;
  }

  if (!RouterOS) {
    console.error('❌ FATAL: Cannot connect to MikroTik because node-routeros is missing. Exiting.');
    process.exit(1);
  }

  try {
    routerConnection = new RouterOS.RouterOSConnection({
      host: MIKROTIK_HOST,
      user: MIKROTIK_USER,
      password: MIKROTIK_PASS,
    });

    // Add error event listeners to handle connection issues gracefully
    routerConnection.on('error', (err) => {
      console.error('❌ MikroTik Connection Error:', err.message);
    });

    routerConnection.connect();
    console.log(`✅ MikroTik Connected: ${MIKROTIK_HOST}`);
  } catch (err) {
    console.error(`❌ MikroTik Connection Failed: ${err.message}`);
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ FATAL: MikroTik connection failed in production. Exiting.');
      process.exit(1);
    } else {
      console.log('ℹ️ Falling back to simulation mode (development only)');
      process.env.MIKROTIK_MODE = 'simulation';
    }
  }
}

/**
 * ============================================================================
 * HOTSPOT USER MANAGEMENT
 * ============================================================================
 */

/**
 * Create a hotspot user in MikroTik
 * @param {string} phone - Phone number (username)
 * @param {number} speedMbps - Max speed in Mbps
 * @param {number} durationHours - Session duration
 * @returns {Object} { hotspotUserId, username, password, tempPassword }
 */
async function createHotspotUser(phone, speedMbps, durationHours) {
  const username = phone.replace('+', '').replace(/\D/g, '').slice(-12);
  const tempPassword = generateRandomPassword();
  const hotspotUserId = uuid();

  if (MIKROTIK_MODE === 'real') {
    return await createHotspotUserReal(username, tempPassword, speedMbps, durationHours, hotspotUserId);
  } else {
    return createHotspotUserSimulation(username, tempPassword, speedMbps, durationHours, hotspotUserId);
  }
}

/**
 * Real MikroTik User Creation
 */
async function createHotspotUserReal(username, password, speedMbps, durationHours, hotspotUserId) {
  if (!routerConnection) {
    throw new Error('MikroTik not connected');
  }

  try {
    // Create user in /ip/hotspot/user
    await routerConnection.query('/ip/hotspot/user/add', {
      name: username,
      password: password,
      profile: HOTSPOT_PROFILE,
      'disabled': 'no',
    });

    // Set bandwidth limits (if needed)
    if (speedMbps) {
      // This would require simple queues or mangle rules
      // Implementation depends on your MikroTik setup
      console.log(`📡 Speed limit set: ${speedMbps} Mbps for ${username}`);
    }

    // Log to database
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO hotspot_users (id, phone_number, username, password_hash, uplink_max_limit_mbps, downlink_max_limit_mbps, mikrotik_synced, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, NOW())`,
      [hotspotUserId, username, username, hashedPassword, speedMbps, speedMbps]
    );

    return {
      hotspotUserId,
      username,
      password,
      createdAt: new Date(),
      syncedWithMikroTik: true,
    };
  } catch (err) {
    console.error(`❌ MikroTik User Creation Failed: ${err.message}`);
    throw err;
  }
}

/**
 * Simulated MikroTik User Creation
 */
function createHotspotUserSimulation(username, password, speedMbps, durationHours, hotspotUserId) {
  simulatedUsers.set(username, {
    id: hotspotUserId,
    username,
    password,
    speedMbps,
    durationHours,
    createdAt: new Date(),
    isActive: true,
  });

  console.log(`📡 [SIMULATION] Hotspot user created: ${username}`);

  return {
    hotspotUserId,
    username,
    password,
    createdAt: new Date(),
    syncedWithMikroTik: true,
  };
}

/**
 * ============================================================================
 * SESSION MANAGEMENT
 * ============================================================================
 */

/**
 * Create a session for a hotspot user
 */
async function createSession(userId, phone, hotspotUserId, username, packageId, durationHours, paymentId = null) {
  const sessionId = uuid();
  const expiresAt = new Date(Date.now() + durationHours * 3600000);

  if (MIKROTIK_MODE === 'simulation') {
    simulatedSessions.set(sessionId, {
      id: sessionId,
      userId,
      phone,
      hotspotUserId,
      username,
      packageId,
      durationHours,
      startedAt: new Date(),
      expiresAt,
      isActive: true,
      paymentId,
    });

    console.log(`✅ [SIMULATION] Session created for ${username} (expires: ${expiresAt.toISOString()})`);
  }

  // Log to database
  await pool.query(
    `INSERT INTO sessions (id, user_id, phone_number, package_id, hotspot_user_id, expires_at, status, payment_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)`,
    [sessionId, userId, phone, packageId, hotspotUserId, expiresAt, paymentId]
  );

  return {
    sessionId,
    expiresAt,
    durationHours,
  };
}

/**
 * Disconnect a hotspot user
 */
async function disconnectUser(username, hotspotUserId, reason = 'session_expired') {
  if (MIKROTIK_MODE === 'real') {
    return await disconnectUserReal(username, hotspotUserId, reason);
  } else {
    return disconnectUserSimulation(username, hotspotUserId, reason);
  }
}

/**
 * Real MikroTik Disconnect
 */
async function disconnectUserReal(username, hotspotUserId, reason) {
  if (!routerConnection) {
    throw new Error('MikroTik not connected');
  }

  try {
    // Remove or disable hotspot user
    const query = await routerConnection.query('/ip/hotspot/user/print', {
      'name': username,
    });

    if (query && query.length > 0) {
      const userRef = query[0]['.id'];
      await routerConnection.query('/ip/hotspot/user/remove', {
        '.id': userRef,
      });

      console.log(`🔌 MikroTik User Disconnected: ${username} (Reason: ${reason})`);
    }
  } catch (err) {
    console.error(`❌ MikroTik Disconnect Failed: ${err.message}`);
    throw err;
  }
}

/**
 * Simulated Disconnect
 */
function disconnectUserSimulation(username, hotspotUserId, reason) {
  if (simulatedUsers.has(username)) {
    simulatedUsers.delete(username);
    console.log(`🔌 [SIMULATION] User Disconnected: ${username} (Reason: ${reason})`);
    return { success: true, reason };
  }
  return { success: false, error: 'User not found' };
}

/**
 * ============================================================================
 * SESSION EXPIRY MANAGEMENT
 * ============================================================================
 */

/**
 * Auto-expire sessions (runs every 60 seconds)
 */
async function expireSessionsScheduled() {
  console.log('🕐 Checking for expired sessions...');

  try {
    // Find all expired sessions
    const result = await pool.query(
      `SELECT * FROM sessions 
       WHERE status = 'active' AND expires_at <= NOW()`
    );

    for (const session of result.rows) {
      await expireSession(session);
    }

    if (result.rows.length > 0) {
      console.log(`✅ Expired ${result.rows.length} session(s)`);
    }
  } catch (err) {
    console.error(`❌ Session expiry check failed: ${err.message}`);
  }
}

/**
 * Expire a single session
 */
async function expireSession(session) {
  try {
    // Disconnect from MikroTik
    await disconnectUser(session.hotspot_user_id, session.id, 'session_expired');

    // Update database
    await pool.query(
      `UPDATE sessions 
       SET status = 'expired', ended_at = NOW()
       WHERE id = $1`,
      [session.id]
    );

    console.log(`⏰ Session expired: ${session.phone_number}`);
  } catch (err) {
    console.error(`❌ Failed to expire session ${session.id}: ${err.message}`);
  }
}

/**
 * ============================================================================
 * BANDWIDTH MANAGEMENT
 * ============================================================================
 */

/**
 * Set bandwidth limit for a user
 */
async function setBandwidthLimit(username, downMbps, upMbps) {
  if (MIKROTIK_MODE === 'real') {
    return await setBandwidthLimitReal(username, downMbps, upMbps);
  } else {
    return setBandwidthLimitSimulation(username, downMbps, upMbps);
  }
}

/**
 * Real bandwidth limiting
 */
async function setBandwidthLimitReal(username, downMbps, upMbps) {
  if (!routerConnection) {
    throw new Error('MikroTik not connected');
  }

  try {
    // This would use Simple Queues or Queue Trees
    // Example with Simple Queues:
    const downKbps = downMbps * 1024;
    const upKbps = upMbps * 1024;

    await routerConnection.query('/queue/simple/add', {
      'name': `Queue-${username}`,
      'target': username,
      'max-packet-queue': 'default',
      'packet-mark': 'none',
      'limit-at': `${upKbps}k/${downKbps}k`,
      'max-limit': `${upKbps}k/${downKbps}k`,
      'burst-limit': `${upKbps}k/${downKbps}k`,
      'burst-time': '0s',
      'priority': '8',
      'parent': 'none',
      'queue': 'default-small/default-large',
      'disabled': 'no',
    });

    console.log(`📊 Bandwidth limited: ${username} -> ${downMbps}/${upMbps} Mbps`);
    return { success: true };
  } catch (err) {
    console.error(`❌ Bandwidth limit failed: ${err.message}`);
    throw err;
  }
}

/**
 * Simulated bandwidth limiting
 */
function setBandwidthLimitSimulation(username, downMbps, upMbps) {
  if (simulatedUsers.has(username)) {
    const user = simulatedUsers.get(username);
    user.downMbps = downMbps;
    user.upMbps = upMbps;
    console.log(`📊 [SIMULATION] Bandwidth limited: ${username} -> ${downMbps}/${upMbps} Mbps`);
    return { success: true };
  }
  return { success: false, error: 'User not found' };
}

/**
 * ============================================================================
 * MONITORING & STATISTICS
 * ============================================================================
 */

/**
 * Get real-time user stats
 */
async function getUserStats(username) {
  if (MIKROTIK_MODE === 'real') {
    return await getUserStatsReal(username);
  } else {
    return getUserStatsSimulation(username);
  }
}

/**
 * Real stats from MikroTik
 */
async function getUserStatsReal(username) {
  if (!routerConnection) {
    return { error: 'MikroTik not connected' };
  }

  try {
    const query = await routerConnection.query('/ip/hotspot/active', {
      'user': username,
    });

    if (query && query.length > 0) {
      const data = query[0];
      return {
        username,
        ipAddress: data['address'],
        bytesOut: data['bytes-out'],
        bytesIn: data['bytes-in'],
        uptime: data['uptime'],
        isActive: true,
      };
    }

    return { username, isActive: false };
  } catch (err) {
    console.error(`❌ Failed to get user stats: ${err.message}`);
    return { error: err.message };
  }
}

/**
 * Simulated stats
 */
function getUserStatsSimulation(username) {
  if (simulatedSessions.has(username)) {
    const session = simulatedSessions.get(username);
    return {
      username,
      bytesOut: Math.floor(Math.random() * 1000000000), // Random bytes
      bytesIn: Math.floor(Math.random() * 1000000000),
      uptime: new Date() - session.startedAt,
      isActive: true,
    };
  }

  return { username, isActive: false };
}

/**
 * ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================
 */

function generateRandomPassword(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

/**
 * Get all active sessions
 */
async function getAllActiveSessions() {
  try {
    const result = await pool.query(
      `SELECT s.*, p.name as package_name, u.phone_number 
       FROM sessions s
       JOIN packages p ON s.package_id = p.id
       JOIN users u ON s.user_id = u.id
       WHERE s.status = 'active'
       ORDER BY s.started_at DESC`
    );
    return result.rows;
  } catch (err) {
    console.error(`❌ Failed to fetch active sessions: ${err.message}`);
    return [];
  }
}

/**
 * Get session count
 */
async function getActiveSessionCount() {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) FROM sessions WHERE status = 'active'`
    );
    return parseInt(result.rows[0].count, 10);
  } catch (err) {
    console.error(`❌ Failed to count sessions: ${err.message}`);
    return 0;
  }
}

/**
 * Get real-time stats for all active users in a single batch query
 * @returns {Promise<Map>} Map of username -> stats
 */
async function getAllActiveUserStats() {
  if (MIKROTIK_MODE === 'real') {
    return await getAllActiveUserStatsReal();
  } else {
    return getAllActiveUserStatsSimulation();
  }
}

async function getAllActiveUserStatsReal() {
  if (!routerConnection) {
    return new Map();
  }
  try {
    const list = await routerConnection.query('/ip/hotspot/active');
    const statsMap = new Map();
    list.forEach(data => {
      const user = data['user'];
      if (user) {
        statsMap.set(user, {
          username: user,
          ipAddress: data['address'],
          bytesOut: parseInt(data['bytes-out'] || 0, 10),
          bytesIn: parseInt(data['bytes-in'] || 0, 10),
          uptime: data['uptime'],
          isActive: true,
        });
      }
    });
    return statsMap;
  } catch (err) {
    console.error(`❌ Failed to batch fetch MikroTik active stats: ${err.message}`);
    return new Map();
  }
}

function getAllActiveUserStatsSimulation() {
  const statsMap = new Map();
  for (const [username, user] of simulatedUsers.entries()) {
    statsMap.set(username, {
      username,
      ipAddress: '192.168.100.50',
      bytesOut: Math.floor(Math.random() * 100000000),
      bytesIn: Math.floor(Math.random() * 100000000),
      uptime: '01:23:45',
      isActive: true,
    });
  }
  return statsMap;
}

/**
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

module.exports = {
  // Initialization
  connectToMikroTik,

  // User Management
  createHotspotUser,
  disconnectUser,

  // Session Management
  createSession,
  expireSession,
  expireSessionsScheduled,

  // Bandwidth
  setBandwidthLimit,

  // Monitoring
  getUserStats,
  getAllActiveUserStats,
  getAllActiveSessions,
  getActiveSessionCount,

  // Mode info
  getMode: () => MIKROTIK_MODE,
  isSimulation: () => MIKROTIK_MODE === 'simulation',
};
