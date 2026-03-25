  // ── Hamburger → drawer ──────────────────────────────────────
  const hamburger     = document.getElementById('hamburger');
  const mobileDrawer  = document.getElementById('mobileDrawer');
  const drawerClose   = document.getElementById('drawerClose');
  const drawerOverlay = document.getElementById('drawerOverlay');
 
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
  drawerClose.addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);
  mobileDrawer.querySelectorAll('a').forEach(l => l.addEventListener('click', closeDrawer));
 
  // ── Mobile accordion ────────────────────────────────────────
  document.querySelectorAll('[data-accordion]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sub    = document.getElementById(btn.dataset.accordion);
      const isOpen = sub.classList.toggle('open');
      btn.classList.toggle('expanded', isOpen);
    });
  });
