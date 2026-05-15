// ── API base URL resolution ────────────────────────────────────────────────
//  localhost (dev server on port 3000)  → /api  (proxied by vite/serve)
//  localhost (any other port, e.g. live-server 5500) → Render backend directly
//  Vercel (maidanja-wifi.vercel.app or any custom domain) → Render backend
const RENDER_BACKEND = 'https://maidanja-wifi.onrender.com/api';

const API_BASE = (() => {
  const { hostname, port } = window.location;
  
  // Check if we are on a local development environment (localhost or local network IP)
  const isLocal = hostname === 'localhost' || 
                  hostname === '127.0.0.1' || 
                  hostname.startsWith('192.168.') || 
                  hostname.startsWith('10.') || 
                  /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

  if (isLocal) {
    // If the frontend is served on port 3000 (Express static), use relative path
    // If served on any other port (like Live Server on 5000), use absolute local URL to backend on 3000
    return port === '3000' ? '/api' : `http://${hostname}:3000/api`;
  }
  
  // Production (Vercel, custom domain, etc.) → always use Render backend
  return RENDER_BACKEND;
})();

const api = {
  // ── Auth helpers ──────────────────────────────────────────────────────────
  getToken() { return localStorage.getItem('maidanja_token'); },
  getUser() { return JSON.parse(localStorage.getItem('maidanja_user') || 'null'); },
  setSession(token, user) {
    localStorage.setItem('maidanja_token', token);
    localStorage.setItem('maidanja_user', JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem('maidanja_token');
    localStorage.removeItem('maidanja_user');
    localStorage.removeItem('maidanja_payment');
    localStorage.removeItem('maidanja_package');
  },
  isLoggedIn() { return !!this.getToken(); },

  // ── Core fetch wrapper ────────────────────────────────────────────────────
  async request(method, endpoint, body = null, requireAuth = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (requireAuth) {
      const token = this.getToken();
      if (!token) { window.location.href = '/login.html'; return; }
      headers['Authorization'] = `Bearer ${token}`;
    }
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, opts);
      const data = await res.json();

      if (res.status === 401) {
        this.clearSession();
        window.location.href = '/login.html';
        return Promise.reject(new Error('Unauthorized')); // Explicitly reject
      }

      if (!data.success) {
        // Extract detailed validation errors if available
        let errorMsg = data.message || 'Request failed';
        if (data.error && Array.isArray(data.error) && data.error.length > 0) {
          errorMsg = data.error.map(e => e.message || e.msg || e).join('. ');
        }
        throw new Error(errorMsg);
      }

      // Ensure data has the correct structure
      if (!data.data) {
        console.warn('API response missing data field:', data);
        throw new Error('Invalid API response format');
      }

      return data;
    } catch (err) {
      console.error(`API Error [${method} ${endpoint}]:`, err);
      throw err;
    }
  },

  get(endpoint, auth = true) { return this.request('GET', endpoint, null, auth); },
  post(endpoint, body, auth = true) { return this.request('POST', endpoint, body, auth); },
  put(endpoint, body, auth = true) { return this.request('PUT', endpoint, body, auth); },
  logout() {
    this.clearSession();
    window.location.href = '/login.html';
  }
};

// ── Navigation helpers ────────────────────────────────────────────────────────
function goBack() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = '/index.html';
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function showError(msg, containerId = 'error-banner') {
  const el = document.getElementById(containerId);
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  else { alert(msg); }
}

function showSuccess(msg, containerId = 'success-banner') {
  const el = document.getElementById(containerId);
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function formatKES(amount) {
  return `KES ${parseFloat(amount).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatCountdown(secondsRemaining) {
  if (secondsRemaining <= 0) return '00:00:00';
  const h = Math.floor(secondsRemaining / 3600);
  const m = Math.floor((secondsRemaining % 3600) / 60);
  const s = Math.floor(secondsRemaining % 60);
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}
