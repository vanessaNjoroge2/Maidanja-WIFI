// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user from DB to ensure they still exist and are active
    const result = await pool.query(
      'SELECT id, phone_number, name, role, is_active, token_version FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found.',
      });
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated.',
      });
    }

    // ── Verify token version (check for logout invalidation)
    if (decoded.tokenVersion !== user.token_version) {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = auth;
