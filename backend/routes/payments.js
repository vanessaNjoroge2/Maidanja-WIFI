// backend/routes/payments.js
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const pool = require('../config/database');
const auth = require('../middleware/auth');
const mpesa = require('../services/mpesa.service');

const router = express.Router();

// ── POST /api/payments/initiate ──────────────────────────────────────────────
router.post(
  '/initiate',
  auth,
  [
    body('package_id').isUUID().withMessage('Valid package_id required'),
    body('phone_number')
      .matches(/^2547\d{8}$/)
      .withMessage('Phone must be in format 2547XXXXXXXX'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', error: errors.array() });
      }

      const { package_id, phone_number } = req.body;
      const userId = req.user.id;

      // 1. Fetch package details
      const pkgResult = await pool.query(
        'SELECT id, name, price_kes FROM packages WHERE id = $1 AND is_active = TRUE',
        [package_id]
      );
      if (pkgResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Package not found or inactive.' });
      }
      const pkg = pkgResult.rows[0];

      // 2. Create a pending payment record
      const paymentResult = await pool.query(
        `INSERT INTO payments (user_id, package_id, phone_number, amount_kes, status)
         VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
        [userId, package_id, phone_number, pkg.price_kes]
      );
      const paymentId = paymentResult.rows[0].id;

      // 3. Initiate STK Push
      let stkResponse;
      try {
        // Pass user's phone as AccountReference and descriptive transaction description
        stkResponse = await mpesa.stkPush(
          phone_number,
          pkg.price_kes,
          phone_number,  // AccountReference = user's phone
          `Maidanja WiFi - ${pkg.name}`  // TransactionDesc = "Maidanja WiFi - [Package Name]"
        );
      } catch (mpesaErr) {
        // Mark payment as failed
        const errorMessage = mpesaErr.message || 'Unknown M-Pesa error';
        console.error('❌ Payment initiation failed for user', userId, ':', errorMessage);

        await pool.query(
          `UPDATE payments SET status = 'failed', failure_reason = $1 WHERE id = $2`,
          [errorMessage, paymentId]
        );

        // Return actual error message to frontend for better debugging
        return res.status(502).json({
          success: false,
          message: errorMessage,
          error_details: mpesaErr.message,
        });
      }

      // 4. Store the CheckoutRequestID
      await pool.query(
        `UPDATE payments
         SET mpesa_checkout_request_id = $1, mpesa_merchant_request_id = $2
         WHERE id = $3`,
        [stkResponse.CheckoutRequestID, stkResponse.MerchantRequestID, paymentId]
      );

      res.status(201).json({
        success: true,
        message: 'STK push sent. Enter M-Pesa PIN on your phone.',
        data: {
          payment_id: paymentId,
          checkout_request_id: stkResponse.CheckoutRequestID,
          merchant_request_id: stkResponse.MerchantRequestID,
          response_description: stkResponse.ResponseDescription,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/payments/status/:checkoutRequestId ──────────────────────────────
router.get('/status/:checkoutRequestId', auth, async (req, res, next) => {
  try {
    const { checkoutRequestId } = req.params;

    // First check DB
    const dbResult = await pool.query(
      `SELECT p.id, p.status, p.mpesa_receipt_number, p.amount_kes, p.failure_reason,
              p.created_at, s.id AS session_id
       FROM payments p
       LEFT JOIN sessions s ON s.payment_id = p.id
       WHERE p.mpesa_checkout_request_id = $1 AND p.user_id = $2`,
      [checkoutRequestId, req.user.id]
    );

    if (dbResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment not found.' });
    }

    const payment = dbResult.rows[0];

    // If already settled by callback, return from DB (no need to hit Daraja)
    if (payment.status === 'completed' || payment.status === 'failed') {
      return res.json({ success: true, data: { payment } });
    }

    // Only query Daraja as a fallback — wait at least 15 seconds after creation
    // to give the callback time to arrive and avoid 429 rate limiting
    const ageMs = Date.now() - new Date(payment.created_at).getTime();
    if (ageMs > 15000) {
      try {
        const darajaStatus = await mpesa.querySTKStatus(checkoutRequestId);

        // ResultCode 0 = success
        if (darajaStatus.ResultCode === '0' || darajaStatus.ResultCode === 0) {
          await pool.query(
            `UPDATE payments SET status = 'completed' WHERE mpesa_checkout_request_id = $1`,
            [checkoutRequestId]
          );
          payment.status = 'completed';
        } else if (darajaStatus.ResultCode !== undefined && darajaStatus.ResultCode !== null) {
          // Only mark as failed for definitive failure codes from Daraja
          // ResultCode 1032 = Request cancelled by user
          // ResultCode 1037 = Timeout waiting for user input
          // ResultCode 1 = Insufficient funds
          // ResultCode 2001 = Wrong PIN
          const failureCodes = [1, 1032, 1037, 2001, 1001, 1019, 9999, 17];
          const code = parseInt(darajaStatus.ResultCode);
          if (failureCodes.includes(code)) {
            await pool.query(
              `UPDATE payments SET status = 'failed', failure_reason = $1
               WHERE mpesa_checkout_request_id = $2`,
              [darajaStatus.ResultDesc, checkoutRequestId]
            );
            payment.status = 'failed';
            payment.failure_reason = darajaStatus.ResultDesc;
          }
          // For unknown non-zero codes, keep as pending and wait for callback
        }
      } catch (queryErr) {
        // Daraja query may fail (429 rate limit, timeout, etc.) — just return DB state
        console.log('⏳ Daraja query unavailable, relying on callback:', queryErr.message);
      }
    }

    res.json({ success: true, data: { payment } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/payments/callback  (Safaricom webhook — no auth) ───────────────
router.post('/callback', async (req, res, next) => {
  try {
    const body = req.body?.Body?.stkCallback;
    if (!body) {
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const checkoutRequestId = body.CheckoutRequestID;
    const resultCode = body.ResultCode;
    const resultDesc = body.ResultDesc;

    if (resultCode !== 0) {
      // Payment failed — update DB
      await pool.query(
        `UPDATE payments SET status = 'failed', failure_reason = $1
         WHERE mpesa_checkout_request_id = $2`,
        [resultDesc, checkoutRequestId]
      );
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    // Extract metadata
    const items = body.CallbackMetadata?.Item || [];
    const getMeta = (name) => items.find((i) => i.Name === name)?.Value;

    const receiptNumber = getMeta('MpesaReceiptNumber');
    const transDate = getMeta('TransactionDate')?.toString();
    const amount = getMeta('Amount');

    // Mark payment completed
    await pool.query(
      `UPDATE payments
       SET status = 'completed',
           mpesa_receipt_number = $1,
           mpesa_transaction_date = $2,
           amount_kes = COALESCE($3, amount_kes)
       WHERE mpesa_checkout_request_id = $4`,
      [receiptNumber, transDate, amount, checkoutRequestId]
    );

    // Fetch payment to create session
    const payResult = await pool.query(
      `SELECT p.id, p.user_id, p.package_id, pkg.duration_hours
       FROM payments p
       JOIN packages pkg ON p.package_id = pkg.id
       WHERE p.mpesa_checkout_request_id = $1`,
      [checkoutRequestId]
    );

    if (payResult.rows.length > 0) {
      const pay = payResult.rows[0];
      const expiresAt = new Date(Date.now() + pay.duration_hours * 3600 * 1000);

      await pool.query(
        `INSERT INTO sessions (user_id, package_id, payment_id, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [pay.user_id, pay.package_id, pay.id, expiresAt.toISOString()]
      );
    }

    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('[M-Pesa Callback Error]', err.message);
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
});

module.exports = router;
