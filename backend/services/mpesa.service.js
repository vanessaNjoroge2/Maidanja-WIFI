// backend/services/mpesa.service.js
const axios = require('axios');

// ---- Constants --------------------------------------------------------
const SANDBOX_BASE = 'https://sandbox.safaricom.co.ke';
const PROD_BASE = 'https://api.safaricom.co.ke';

const getBaseUrl = () =>
  process.env.MPESA_ENVIRONMENT === 'production' ? PROD_BASE : SANDBOX_BASE;

// ---- Token Cache -------------------------------------------------------
let cachedToken = null;
let tokenExpiry = 0;

/**
 * Validates that all required M-Pesa environment variables are set.
 * Logs warnings if any are missing.
 */
const validateEnv = () => {
  const required = [
    'MPESA_CONSUMER_KEY',
    'MPESA_CONSUMER_SECRET',
    'MPESA_SHORTCODE',
    'MPESA_PASSKEY',
    'MPESA_CALLBACK_URL',
    'MPESA_ENVIRONMENT',
  ];

  const missing = required.filter(key => !process.env[key] || process.env[key].includes('your_'));

  if (missing.length > 0) {
    console.warn(`⚠️  Missing or placeholder M-Pesa config: ${missing.join(', ')}`);
    console.warn('   Update these in your .env file before payments will work.');
  }
};

/**
 * Fetches (or returns cached) M-Pesa OAuth access token.
 * Includes retry logic for token fetch failures.
 */
const getAccessToken = async (retryCount = 0) => {
  const maxRetries = 2;

  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;

  if (!key || !secret) {
    throw new Error('Missing MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET in .env');
  }

  const creds = Buffer.from(`${key}:${secret}`).toString('base64');

  try {
    console.log(`🔐 Fetching M-Pesa access token (${getBaseUrl()})...`);

    const response = await axios.get(
      `${getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { Authorization: `Basic ${creds}` },
        timeout: 10000,
      }
    );

    cachedToken = response.data.access_token;
    tokenExpiry = Date.now() + (parseInt(response.data.expires_in) - 60) * 1000;

    console.log('✅ Access token retrieved successfully');
    return cachedToken;
  } catch (err) {
    console.error('❌ Token fetch failed:', {
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data,
      message: err.message,
    });

    // Retry if network error and retries remaining
    if (retryCount < maxRetries && (!err.response || err.response.status >= 500)) {
      console.log(`⚠️  Retrying token fetch (attempt ${retryCount + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
      return getAccessToken(retryCount + 1);
    }

    throw new Error(
      `Failed to get M-Pesa access token: ${err.response?.data?.error || err.message}`
    );
  }
};

/**
 * Generates the M-Pesa password and timestamp.
 */
const getPassword = () => {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;

  if (!shortcode || !passkey) {
    throw new Error('Missing MPESA_SHORTCODE or MPESA_PASSKEY in .env');
  }

  // Safaricom requires timestamp in East African Time (EAT), which is UTC+3
  const eatOffset = 3 * 60 * 60 * 1000;
  const timestamp = new Date(Date.now() + eatOffset)
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  return { password, timestamp };
};

/**
 * Initiates an STK Push request to the user's phone.
 * @param {string} phone - Phone number in format 254XXXXXXXXX
 * @param {number} amount - Amount in KES (integer)
 * @param {string} accountRef - Account reference (user's phone number)
 * @param {string} description - Transaction description (e.g. "Maidanja WiFi - 1 Day Unlimited Package")
 * @returns {object} Daraja API response
 */
const stkPush = async (phone, amount, accountRef, description) => {
  try {
    console.log(`📱 Initiating STK Push for ${phone} (KES ${amount})`);

    const token = await getAccessToken();
    const { password, timestamp } = getPassword();
    const shortcode = process.env.MPESA_SHORTCODE;
    const callbackUrl = process.env.MPESA_CALLBACK_URL;

    if (!callbackUrl || callbackUrl.includes('yourdomain')) {
      throw new Error(
        'MPESA_CALLBACK_URL is not properly configured. ' +
        'Set it to a valid ngrok URL or public domain in .env'
      );
    }

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount),   // M-Pesa requires integer
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: accountRef,              // User's phone number
      TransactionDesc: description,             // Package description
    };

    console.log('📤 Sending STK Push payload:', {
      phone,
      amount,
      accountRef,
      description,
      callbackUrl,
    });

    const response = await axios.post(
      `${getBaseUrl()}/mpesa/stkpush/v1/processrequest`,
      payload,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      }
    );

    console.log('✅ STK Push sent successfully:', {
      CheckoutRequestID: response.data.CheckoutRequestID,
      ResponseCode: response.data.ResponseCode,
      ResponseDescription: response.data.ResponseDescription,
    });

    // Return full response so caller can access all fields
    return response.data;
  } catch (err) {
    console.error('❌ STK Push failed:', {
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data,
      message: err.message,
    });

    // Provide user-friendly error messages based on error type
    let userMessage = err.message;
    if (err.response?.data?.errorMessage) {
      userMessage = err.response.data.errorMessage;
    } else if (err.response?.status === 401) {
      userMessage = 'M-Pesa authentication failed. Check your API credentials.';
    } else if (err.response?.status === 400) {
      userMessage = 'Invalid payment request. Check package ID and phone number.';
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      userMessage = 'Cannot reach M-Pesa service. Check your internet connection.';
    }

    throw new Error(userMessage);
  }
};

/**
 * Queries the status of an STK Push transaction.
 * @param {string} checkoutRequestId
 * @returns {object} Daraja API query response
 */
const querySTKStatus = async (checkoutRequestId) => {
  try {
    const token = await getAccessToken();
    const { password, timestamp } = getPassword();
    const shortcode = process.env.MPESA_SHORTCODE;

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };

    const response = await axios.post(
      `${getBaseUrl()}/mpesa/stkpushquery/v1/query`,
      payload,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      }
    );

    return response.data;
  } catch (err) {
    console.error('❌ STK Status query failed:', err.message);
    throw err;
  }
};

// Validate environment on module load
validateEnv();

module.exports = { getAccessToken, stkPush, querySTKStatus, validateEnv };
