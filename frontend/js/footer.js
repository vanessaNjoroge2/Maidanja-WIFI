// ══════════════════════════════════════════════════════════════
// MAIDANJA WIFI — SHARED FOOTER COMPONENT
// Injects the redesigned footer into every page
// ══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const FOOTER_HTML = `
  <footer class="maidanja-footer" id="maidanja-footer">
    <div class="footer-inner">
      <div class="footer-columns">

        <!-- Column 1: Brand -->
        <div class="footer-col footer-col--brand">
          <a href="/index.html" class="footer-brand-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
              <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
              <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/>
            </svg>
            <span class="footer-brand-name">Maidanja WiFi</span>
          </a>
          <p class="footer-tagline">Fast, Reliable, Affordable Internet</p>
          <p class="footer-description">
            Providing fast, flexible and affordable WiFi hotspot services
            across Thika. Connect instantly using M-Pesa — no contracts,
            no hidden fees.
          </p>
          <div class="footer-socials">
            <a href="https://facebook.com" target="_blank" rel="noopener" class="footer-social-btn" title="Facebook">
              <svg viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
            </a>
            <a href="https://x.com" target="_blank" rel="noopener" class="footer-social-btn" title="X (Twitter)">
              <svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://instagram.com" target="_blank" rel="noopener" class="footer-social-btn" title="Instagram">
              <svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/></svg>
            </a>
            <a href="https://wa.me/254706407084" target="_blank" rel="noopener" class="footer-social-btn" title="WhatsApp">
              <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
            </a>
          </div>
        </div>

        <!-- Column 2: Quick Links -->
        <div class="footer-col footer-col--links">
          <h4 class="footer-heading">Quick Links</h4>
          <ul class="footer-links">
            <li><a href="/index.html">Home</a></li>
            <li><a href="/packages.html">View Packages</a></li>
            <li><a href="/dashboard.html">Dashboard</a></li>
            <li><a href="/login.html">Login</a></li>
            <li><a href="#maidanja-footer">Contact Us</a></li>
          </ul>
        </div>

        <!-- Column 3: Contact -->
        <div class="footer-col footer-col--contact">
          <h4 class="footer-heading">Get In Touch</h4>
          <ul class="footer-contact-list">
            <li class="footer-contact-item">
              <span class="footer-contact-icon">
                <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
              </span>
              <a href="tel:0706407084">0706407084</a>
            </li>
            <li class="footer-contact-item">
              <span class="footer-contact-icon">
                <svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              </span>
              <a href="mailto:maidanja31@gmail.com">maidanja31@gmail.com</a>
            </li>
            <li class="footer-contact-item">
              <span class="footer-contact-icon">
                <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </span>
              <span>Thika, Kenya</span>
            </li>
            <li class="footer-contact-item">
              <span class="footer-contact-icon">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </span>
              <span>Available 24/7</span>
            </li>
          </ul>
        </div>

        <!-- Column 4: CTA -->
        <div class="footer-col footer-col--cta">
          <h4 class="footer-heading">Get Connected</h4>
          <p class="footer-cta-text">
            Want to bring Maidanja WiFi to your area?
            We offer full installation within 72 hours.
          </p>
          <a href="tel:0706407084" class="footer-cta-btn">
            <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
            Request Installation
          </a>
          <p class="footer-help-text">Need help? Call us anytime</p>
        </div>

      </div>

      <!-- Divider -->
      <div class="footer-divider"></div>
    </div>

    <!-- Copyright Bar -->
    <div class="footer-bottom">
      <span class="footer-copyright">&copy; 2026 Maidanja WiFi. All rights reserved.</span>
      <span class="footer-mpesa-badge">
        <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Powered by M-Pesa
      </span>
    </div>
  </footer>`;

  // Inject: Replace all existing <footer> elements, or append before </body>
  function injectFooter() {
    const existingFooters = document.querySelectorAll('footer');
    if (existingFooters.length > 0) {
      // Replace the LAST footer (in case there are duplicate nav footers)
      const lastFooter = existingFooters[existingFooters.length - 1];
      const wrapper = document.createElement('div');
      wrapper.innerHTML = FOOTER_HTML.trim();
      const newFooter = wrapper.firstElementChild;
      lastFooter.parentNode.replaceChild(newFooter, lastFooter);

      // Remove any other footers that remain
      document.querySelectorAll('footer:not(.maidanja-footer)').forEach(f => f.remove());
    } else {
      // No existing footer — append to body
      document.body.insertAdjacentHTML('beforeend', FOOTER_HTML);
    }
  }

  // Load CSS if not already loaded
  function loadCSS() {
    if (!document.querySelector('link[href*="footer.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/css/footer.css';
      document.head.appendChild(link);
    }
  }

  // Execute
  loadCSS();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectFooter);
  } else {
    injectFooter();
  }
})();
