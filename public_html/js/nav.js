/**
 * Russell Digital — Nav Behaviour
 * nav.js
 *
 * Called automatically after header.html is injected by loadComponent.js
 */

function initNav() {
  const header    = document.getElementById('site-header');
  const hamburger = document.getElementById('nav-hamburger');
  const mobileNav = document.getElementById('nav-mobile');

  if (!header || !hamburger || !mobileNav) return;

  /* ── Scroll: frosted glass after 20px ── */
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── Mobile menu ── */
  const openMobile = () => {
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    mobileNav.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  const closeMobile = () => {
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    mobileNav.classList.remove('open');
    document.body.style.overflow = '';
  };

  hamburger.addEventListener('click', () =>
    mobileNav.classList.contains('open') ? closeMobile() : openMobile()
  );

  /* ── Mobile accordion submenus ── */
  document.querySelectorAll('[data-mobile-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id      = btn.dataset.mobileToggle;
      const submenu = document.getElementById(id);
      if (!submenu) return;

      const isOpen = submenu.classList.contains('open');

      document.querySelectorAll('.nav-mobile-submenu.open').forEach(sm => {
        sm.classList.remove('open');
        const b = document.querySelector(`[data-mobile-toggle="${sm.id}"]`);
        if (b) { const a = b.querySelector('.mobile-arrow'); if (a) a.style.transform = ''; }
      });

      if (!isOpen) {
        submenu.classList.add('open');
        const arrow = btn.querySelector('.mobile-arrow');
        if (arrow) arrow.style.transform = 'rotate(180deg)';
      }
    });
  });

  /* ── Close on outside click or resize ── */
  document.addEventListener('click', e => {
    if (mobileNav.classList.contains('open') &&
        !mobileNav.contains(e.target) &&
        !hamburger.contains(e.target)) closeMobile();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) closeMobile();
  });

  /* ── Close when a mobile link is tapped ── */
  mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobile));

  /* ── Active link highlight ── */
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link[href], .nav-mobile-link[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (href && href !== '/' && path.startsWith(href)) link.classList.add('active');
  });
}