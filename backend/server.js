// backend/server.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const packageRoutes = require('./routes/packages');
const paymentRoutes = require('./routes/payments');
const { router: sessionRoutes, expireSessions } = require('./routes/sessions');
const adminRoutes = require('./routes/admin');
const hotspotRoutes = require('./routes/hotspot');
const mikrotikService = require('./services/mikrotikService');
const pool = require('./config/database');

const app = express();

// Enable trust proxy for reverse proxy environments (Render, Vercel, ngrok)
app.set('trust proxy', 1);

// Prevent double server start
if (global.__serverStarted) {
  console.log('⚠️ Server already running, skipping duplicate start');
} else {
  global.__serverStarted = true;
}

// ── CONFIG ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

// ── ENVIRONMENT VALIDATION ────────────────────────
const requiredEnvVars = [
  'JWT_SECRET',
  'DATABASE_URL',
  'MPESA_CONSUMER_KEY',
  'MPESA_CONSUMER_SECRET',
  'MPESA_SHORTCODE',
  'MPESA_PASSKEY',
  'MPESA_CALLBACK_URL',
  'MPESA_CALLBACK_SECRET',
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

// ── CORS ─────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
if (!allowedOrigins.length) {
  console.error('❌ CRITICAL: CORS_ORIGIN is not set or empty.');
  process.exit(1);
}
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. server-to-server, curl)
    if (!origin) return callback(null, true);
    // Wildcard allows all origins
    if (allowedOrigins.includes('*')) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin '${origin}' is not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
// Handle preflight OPTIONS requests globally before any other middleware
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// ── RATE LIMITING ───────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    if (req.body?.phone_number) {
      return `phone:${req.body.phone_number}`;
    }
    return ipKeyGenerator(req);
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

// ── SECURITY HEADERS (Helmet) ────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://maidanja-wifi.onrender.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,
}));

// Permissions Policy
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'interest-cohort=()',
  ].join(', '));
  next();
});

// Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Admin guard
const auth = require('./middleware/auth');
const adminOnly = require('./middleware/adminOnly');
app.get('/admin.html', auth, adminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// Static files
app.use(express.static(path.join(__dirname, '../frontend')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/hotspot', hotspotRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Maidanja WiFi API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Error handler
app.use(errorHandler);

// Session cleanup & hotspot management
setInterval(async () => {
  try {
    expireSessions();
    await mikrotikService.expireSessionsScheduled();
  } catch (err) {
    console.error('Session cleanup error:', err.message);
  }
}, 60 * 1000);

// ── SERVER START ──────────────────────────────────────
const server = app.listen(PORT, async () => {
  console.log(`🚀 Maidanja WiFi Server running on port ${PORT}`);
  console.log(`🔌 Current Environment Mode: ${process.env.NODE_ENV || 'development'}`);
  
  // Connect to database & run migrations/seeding
  try {
    const res = await pool.query('SELECT NOW()');
    console.log(`💾 PostgreSQL Connected: ${res.rows[0].now}`);
    const initializeDatabase = require('./config/initDb');
    await initializeDatabase();
  } catch (err) {
    console.error('❌ Database Connection Failed:', err.message);
  }

  // Connect to MikroTik Router
  await mikrotikService.connectToMikroTik();
});

// ── EXCEPTION & REJECTION HANDLERS ────────────────────
process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION! Shutting down...', err.name, err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('💥 UNHANDLED REJECTION! Shutting down...', err.name, err.message, err.stack);
  process.exit(1);
});

// ── GRACEFUL SHUTDOWN ─────────────────────────────────
const gracefulShutdown = () => {
  console.log('👋 SIGTERM/SIGINT received. Shutting down gracefully...');
  server.close(async () => {
    console.log('🚪 Express server closed.');
    try {
      await pool.end();
      console.log('💾 Database pool closed.');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during database pool close:', err.message);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = app;
