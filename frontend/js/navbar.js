// ═══════════════════════════════════════════════════════════════════════════
// Navbar & Navigation Management — Maidanja WiFi
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize navbar on page load.
 * Strips Tailwind's hidden/sm:flex classes from #nav-items so our CSS
 * controls visibility instead (avoids class conflicts).
 */
function initNavbar() {
  const isLoggedIn = api.isLoggedIn();
  const user = api.getUser();

  // Set navbar title dynamically from page <title>
  updateNavbarTitle();

  const navItems = document.getElementById('nav-items');
  if (!navItems) return;

  // ── CRITICAL FIX: Remove Tailwind classes that fight our CSS ──────────────
  // Without this, 'hidden' keeps the mobile menu invisible regardless of
  // the .active class being toggled.
  navItems.classList.remove('hidden', 'sm:flex', 'flex');

  // ── Populate nav links based on auth state ──────────────────────────────
  if (isLoggedIn && user) {
    navItems.innerHTML = `
      <a href="/packages.html" class="nav-link">Packages</a>
      <a href="/dashboard.html" class="nav-link">Dashboard</a>
      <span class="nav-welcome">Hi, ${(user.name || user.phone_number || 'User').split(' ')[0]}</span>
      <button onclick="api.logout()" class="btn-logout" style="cursor:pointer;">
        Logout
      </button>
    `;
  } else {
    navItems.innerHTML = `
      <a href="/packages.html" class="nav-link">Packages</a>
      <a href="/login.html" class="btn-login nav-link">Login</a>
      <a href="/packages.html" class="btn-primary-gradient nav-link" style="padding: 8px 16px; border-radius: 8px; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; min-height: 44px; white-space: nowrap;">
        Connect Now
      </a>
    `;
  }

  // Setup mobile menu toggle
  setupMobileMenu();
}

/**
 * Update navbar title text from the page <title> element.
 */
function updateNavbarTitle() {
  const pageTitle = document.querySelector('.navbar-title');
  if (!pageTitle) return;

  let title = document.title.trim();

  if (title.includes('|')) {
    const parts = title.split('|').map(p => p.trim());
    title = parts[0] === 'Maidanja WiFi' ? (parts[1] || parts[0]) : parts[0];
  } else if (title.includes('-')) {
    const parts = title.split('-').map(p => p.trim());
    title = parts[0] === 'Maidanja WiFi' ? (parts[1] || parts[0]) : parts[0];
  }

  pageTitle.textContent = title || 'Maidanja WiFi';
}

/**
 * Wire up the hamburger button toggle.
 * Adds click-outside and link-click close behaviors.
 */
function setupMobileMenu() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const navItems = document.getElementById('nav-items');

  if (!menuBtn || !navItems) return;

  // Toggle menu on hamburger click
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = navItems.classList.toggle('active');
    menuBtn.classList.toggle('active', isOpen);
    menuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  // Close menu when any nav link/button is clicked
  navItems.querySelectorAll('a, button').forEach(link => {
    link.addEventListener('click', closeMenu);
  });

  // Close menu on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#navbar')) {
      closeMenu();
    }
  });

  // Close menu on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  function closeMenu() {
    navItems.classList.remove('active');
    menuBtn.classList.remove('active');
    menuBtn.setAttribute('aria-expanded', 'false');
  }
}

/**
 * Navigate back using browser history, fallback to index.
 */
function goBack() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = '/index.html';
  }
}

/**
 * Navigate to a specific path.
 * @param {string} path
 */
function navigateTo(path) {
  window.location.href = path;
}

/**
 * Hide navbar on pages where it's not needed (e.g. login).
 */
function updateNavbarVisibility() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  const pathname = window.location.pathname;
  const hideNavbarPages = ['/login.html'];

  if (hideNavbarPages.some(page => pathname.endsWith(page))) {
    navbar.style.display = 'none';
    // Remove body padding so login page fills from top
    document.body.style.paddingTop = '0';
  }
}

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  updateNavbarVisibility();
});

// Re-read title after full page load (some pages set it dynamically)
window.addEventListener('load', () => {
  updateNavbarTitle();
});

// Patch api.logout to also re-init the navbar
if (typeof api !== 'undefined') {
  const _origLogout = api.logout.bind(api);
  api.logout = function () {
    _origLogout();
    // Give the redirect a moment, but if still on page, refresh navbar
    setTimeout(() => initNavbar(), 100);
  };
}
