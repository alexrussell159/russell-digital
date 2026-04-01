/**
 * Russell Digital — Component Loader
 * Fetches header.html and footer.html and injects them into the page.
 * Also initialises scroll-reveal, nav scroll behaviour, and mobile drawer.
 *
 * Usage: <script src="loadComponent.js" defer></script>
 * Requires: <div id="rd-header"></div> and <div id="rd-footer"></div>
 */

(async function () {
  'use strict';

  /* ── Fetch & inject ──────────────────────────────────────── */
  async function loadComponent(id, path) {
    const el = document.getElementById(id);
    if (!el) return;
    try {
      const res  = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      el.innerHTML = await res.text();
    } catch (err) {
      console.warn(`[RD] Could not load ${path}:`, err);
    }
  }

  

  /* Load both in parallel */
  await Promise.all([
    loadComponent('rd-header', '/components/header.html'),
    loadComponent('rd-footer', '/components/footer.html'),
  ]);

  /* ── Highlight current page nav link ────────────────────── */
  const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-link[href], .m-link[href]').forEach(link => {
    const linkPath = link.getAttribute('href').replace(/\/$/, '') || '/';
    if (linkPath === currentPath) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });

  /* ── Nav scroll effect ───────────────────────────────────── */
  const navWrap = document.querySelector('.nav-wrap');
  if (navWrap) {
    const onScroll = () => {
      navWrap.classList.toggle('scrolled', window.scrollY > 24);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // run once on load
  }

  /* ── Mobile drawer ───────────────────────────────────────── */
  const hamburger     = document.getElementById('hamburger');
  const mobileDrawer  = document.getElementById('mobileDrawer');
  const drawerClose   = document.getElementById('drawerClose');
  const drawerOverlay = document.getElementById('drawerOverlay');

  if (hamburger && mobileDrawer) {
    function openDrawer() {
      mobileDrawer.classList.add('open');
      mobileDrawer.setAttribute('aria-hidden', 'false');
      hamburger.classList.add('open');
      hamburger.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
      mobileDrawer.classList.remove('open');
      mobileDrawer.setAttribute('aria-hidden', 'true');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    hamburger.addEventListener('click', openDrawer);
    drawerClose?.addEventListener('click', closeDrawer);
    drawerOverlay?.addEventListener('click', closeDrawer);

    document.querySelectorAll('#mobileDrawer a').forEach(l =>
      l.addEventListener('click', closeDrawer)
    );

    /* Close on Escape */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeDrawer();
    });
  }

  /* ── Mobile accordion ────────────────────────────────────── */
  document.querySelectorAll('[data-accordion]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panelId = btn.dataset.accordion;
      const panel   = document.getElementById(panelId);
      if (!panel) return;
      const isOpen = panel.classList.toggle('open');
      btn.classList.toggle('expanded', isOpen);
      btn.setAttribute('aria-expanded', String(isOpen));
    });
  });

  /* ── Scroll reveal ───────────────────────────────────────── */
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  /* Observe all .reveal elements — re-run after components load */
  function observeReveal() {
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }
  observeReveal();

  /* ── Smooth-scroll for anchor links ─────────────────────── */
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

})();

document.querySelectorAll('.m-link[data-accordion]').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.accordion;
    const panel = document.getElementById(id);
    btn.classList.toggle('expanded');
    panel.classList.toggle('open');
  });
});