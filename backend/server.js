// backend/server.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const packageRoutes = require('./routes/packages');
const paymentRoutes = require('./routes/payments');
const { router: sessionRoutes, expireSessions } = require('./routes/sessions');
const adminRoutes = require('./routes/admin');
const hotspotRoutes = require('./routes/hotspot');
const mikrotikService = require('./services/mikrotikService');

const app = express();

// ✅ FIX: prevent double server start (important for nodemon issues)
if (global.__serverStarted) {
  console.log("⚠️ Server already running, skipping duplicate start");
} else {
  global.__serverStarted = true;
}

// ── CONFIG ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

// ── SECURITY ───────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── LOGGING ────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── CORS ───────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── BODY PARSERS ───────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── SERVE FRONTEND STATIC FILES ────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API ROUTES ─────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/hotspot', hotspotRoutes);
app.use('/api/admin', adminRoutes);

// ── HEALTH CHECK ───────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Maidanja WiFi API is running',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

// ── ERROR HANDLER ──────────────────────────────────────
app.use(errorHandler);

// ── SESSION CLEANUP & HOTSPOT MANAGEMENT ──────────────
setInterval(async () => {
  try {
    // Expire old sessions
    expireSessions();
    // Expire hotspot sessions
    await mikrotikService.expireSessionsScheduled();
  } catch (err) {
    console.error("Session cleanup error:", err.message);
  }
}, 60 * 1000); // Run every 60 seconds

// ── START SERVER (SAFE VERSION) ────────────────────────
const server = app.listen(PORT, async () => {
  console.log(`\n🚀 Maidanja WiFi API running on http://localhost:${PORT}`);
  console.log(`🔌 Environment: ${process.env.NODE_ENV || 'development'}\n`);
  
  // Initialize MikroTik service
  await mikrotikService.connectToMikroTik();
  console.log(`📡 Hotspot Mode: ${mikrotikService.getMode()}\n`);
});

// ✅ FIX: handle EADDRINUSE gracefully
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Kill existing Node process.`);
  } else {
    console.error(err);
  }
});

module.exports = app;