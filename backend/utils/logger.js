// backend/utils/logger.js
const pino = require('pino');

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: ['phone', 'phone_number', 'password', 'token', 'password_hash', 'mpesa_receipt_number'],
    censor: (value, path) => {
      if (typeof value === 'string' && value.length > 6) {
        return value.slice(0, 3) + '****' + value.slice(-2);
      }
      return '[REDACTED]';
    }
  },
  transport: process.env.NODE_ENV === 'production' ? undefined : {
    target: 'pino-pretty',
    options: {
      colorize: true,
      levelFirst: true,
      singleLine: false,
    }
  }
});

module.exports = logger;
