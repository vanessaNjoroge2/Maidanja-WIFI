// ═══════════════════════════════════════════════════════════════════════════
// Navbar & Navigation Management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize navbar on page load
 * Detects if user is logged in and sets up navigation items accordingly
 */
function initNavbar() {
  const isLoggedIn = api.isLoggedIn();
  const user = api.getUser();
  
  // Set navbar title dynamically
  updateNavbarTitle();
  
  // Update navbar items based on auth state
  const navItems = document.getElementById('nav-items');
  if (!navItems) return;
  
  if (isLoggedIn && user) {
    // Show logout button and user info
    navItems.innerHTML = `
      <div class="flex items-center gap-4">
        <span class="text-sm text-gray-400 hidden sm:inline">Welcome, ${user.name || 'User'}</span>
        <button onclick="api.logout()" class="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium transition-all">
          Logout
        </button>
      </div>
    `;
  } else {
    // Show login link
    navItems.innerHTML = `
      <a href="/login.html" class="px-4 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-sm font-medium transition-all">
        Login
      </a>
    `;
  }
  
  // Setup mobile menu toggle
  setupMobileMenu();
}

/**
 * Update navbar title based on current page
 */
function updateNavbarTitle() {
  const pageTitle = document.querySelector('.navbar-title');
  if (!pageTitle) return;
  
  let title = document.title.trim();
  
  // Extract meaningful part of title (before separator)
  if (title.includes('|')) {
    // Format: "Page | Maidanja WiFi" or "Maidanja WiFi | Page"
    const parts = title.split('|').map(p => p.trim());
    title = parts[0] === 'Maidanja WiFi' ? parts[1] || parts[0] : parts[0];
  } else if (title.includes('-')) {
    // Format: "Page - Maidanja WiFi"
    const parts = title.split('-').map(p => p.trim());
    title = parts[0] === 'Maidanja WiFi' ? parts[1] || parts[0] : parts[0];
  }
  
  pageTitle.textContent = title || 'Maidanja WiFi';
}

/**
 * Setup mobile menu toggle functionality
 */
function setupMobileMenu() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const navItems = document.getElementById('nav-items');
  
  if (!menuBtn || !navItems) return;
  
  menuBtn.addEventListener('click', () => {
    navItems.classList.toggle('hidden');
  });
  
  // Close menu when clicking on items
  const links = navItems.querySelectorAll('a, button');
  links.forEach(link => {
    link.addEventListener('click', () => {
      navItems.classList.add('hidden');
    });
  });
}

/**
 * Navigate back to previous page using browser history
 * Falls back to homepage if no history available
 */
function goBack() {
  // Try browser history first
  if (window.history.length > 1) {
    window.history.back();
  } else {
    // Fallback to index page
    window.location.href = '/index.html';
  }
}

/**
 * Navigate to a specific page
 * @param {string} path - The path to navigate to
 */
function navigateTo(path) {
  window.location.href = path;
}

/**
 * Check if current page should show back button
 * Returns false for login and index pages (entry points)
 */
function shouldShowBackButton() {
  const pathname = window.location.pathname;
  const noBackPages = ['/login.html', '/index.html', '/checkout-success.html'];
  return !noBackPages.some(page => pathname.endsWith(page));
}

/**
 * Update navbar visibility based on page
 */
function updateNavbarVisibility() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  
  const pathname = window.location.pathname;
  const hideNavbarPages = ['/login.html'];
  
  if (hideNavbarPages.some(page => pathname.endsWith(page))) {
    navbar.style.display = 'none';
  }
}

// Initialize navbar when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  updateNavbarVisibility();
});

// Also update title when page fully loads
window.addEventListener('load', () => {
  updateNavbarTitle();
});

// Re-initialize navbar when user logs in/out
const originalLogout = api.logout;
api.logout = function() {
  originalLogout.call(this);
  setTimeout(() => initNavbar(), 100);
};
