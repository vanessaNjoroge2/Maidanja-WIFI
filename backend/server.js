// backend/server.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const packageRoutes = require('./routes/packages');
const paymentRoutes = require('./routes/payments');
const { router: sessionRoutes, expireSessions } = require('./routes/sessions');
const adminRoutes = require('./routes/admin');
const hotspotRoutes = require('./routes/hotspot');
const mikrotikService = require('./services/mikrotikService');

const app = express();

// ✅ FIX: prevent double server start
if (global.__serverStarted) {
  console.log("⚠️ Server already running, skipping duplicate start");
} else {
  global.__serverStarted = true;
}

// ── CONFIG ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

// ══════════════════════════════════════════════════════════
// ✅ MOVED TO TOP: Startup Environment Validation
// Must run BEFORE app.listen — server should never start
// with missing or invalid environment variables.
// ══════════════════════════════════════════════════════════
const requiredEnvVars = [
  'JWT_SECRET',
  'DATABASE_URL',
  'MPESA_CONSUMER_KEY',
  'MPESA_CONSUMER_SECRET',
  'MPESA_SHORTCODE',
];
for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    console.error(`FATAL: Required environment variable '${key}' is not set. Exiting.`);
    process.exit(1);
  }
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters long. Exiting.');
  process.exit(1);
}
if (!['development', 'production', 'test'].includes(process.env.NODE_ENV)) {
  console.error('FATAL: NODE_ENV must be "development", "production", or "test". Exiting.');
  process.exit(1);
}

// ── SECURITY: CORS ─────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim());

if (allowedOrigins.length === 0 || allowedOrigins[0] === '') {
  console.error('❌ CRITICAL: CORS_ORIGIN is not set in .env or is empty.');
  process.exit(1);
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests (no origin) and whitelisted origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin '${origin}' is not allowed`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ── SECURITY: RATE LIMITING ────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    return req.body?.phone_number
      ? `phone:${req.body.phone_number}`
      : `ip:${req.ip}`;
  },
  message: { success: false, message: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Payment initiation limit reached. Please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/payments/initiate', paymentLimiter);

// ── SECURITY: HELMET HEADERS ───────────────────────────────
app.use(helmet({
  // ✅ Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com"],
      styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com",
                    "https://fonts.gstatic.com"],
      fontSrc:     ["'self'", "https://fonts.gstatic.com"],
      imgSrc:      ["'self'", "data:", "https:"],
      connectSrc:  ["'self'", "https://maidanja-wifi.onrender.com"],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
      baseUri:     ["'self'"],
      formAction:  ["'self'"],
    },
  },

  // ✅ Referrer Policy
  // Only sends origin (no path/query) on cross-origin requests
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin",
  },

  crossOriginEmbedderPolicy: false,
}));

// ✅ Permissions Policy (Helmet doesn't include this yet — added manually)
// Disables browser features your app doesn't need
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    [
      'camera=()',           // No camera access
      'microphone=()',       // No microphone access
      'geolocation=()',      // No GPS access
      'payment=()',          // No Payment Request API
      'usb=()',              // No USB access
      'interest-cohort=()', // Opt out of FLoC tracking
    ].join(', ')
  );
  next();
});

// ── LOGGING ────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── BODY PARSING ───────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── SECURITY: Guard admin.html ─────────────────────────────
const auth = require('./middleware/auth');
const adminOnly = require('./middleware/adminOnly');
app.get('/admin.html', auth, adminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// ── STATIC FILES ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API ROUTES ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/hotspot', hotspotRoutes);
app.use('/api/admin', adminRoutes);

// ── HEALTH CHECK ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Maidanja WiFi API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── ERROR HANDLER ──────────────────────────────────────────
app.use(errorHandler);

// ── SESSION CLEANUP & HOTSPOT MANAGEMENT ──────────────────
setInterval(async () => {
  try {
    expireSessions();
    await mikrotikService.expireSessionsScheduled();
  } catch (err) {
    console.error("Session cleanup error:", err.message);
  }
}, 60 * 1000);

// ── START SERVER ───────────────────────────────────────────
const server = app.listen(PORT, async () => {
  console.log(`\n🚀 Maidanja WiFi API running on http://localhost:${PORT}`);
  console.log(`🔌 Environment: ${process.env.NODE_ENV}\n`);

  await mikrotikService.connectToMikroTik();
  console.log(`📡 Hotspot Mode: ${mikrotikService.getMode()}\n`);
});

// ✅ Handle port conflict gracefully
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Kill existing Node process.`);
  } else {
    console.error(err);
  }
});

module.exports = app;