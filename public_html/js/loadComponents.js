async function loadComponent(id, file) {
  const res = await fetch(file);
  const html = await res.text();
  document.getElementById(id).innerHTML = html;
}

loadComponent("site-header", "/components/header.html").then(() => {
  const hamburger = document.getElementById('hamburger');
  const drawer = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('drawerOverlay');
  const closeBtn = document.getElementById('drawerClose');

  if (hamburger && drawer && overlay && closeBtn) {
    const openDrawer = () => {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
      hamburger.classList.add('open');
      hamburger.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    };

    const closeDrawer = () => {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    };

    hamburger.addEventListener('click', () => {
      drawer.classList.contains('open') ? closeDrawer() : openDrawer();
    });

    overlay.addEventListener('click', closeDrawer);
    closeBtn.addEventListener('click', closeDrawer);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDrawer();
    });

    document.querySelectorAll('[data-accordion]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.accordion;
        const sub = document.getElementById(id);
        const open = sub.classList.contains('open');

        document.querySelectorAll('.m-sub').forEach(s => s.classList.remove('open'));
        document.querySelectorAll('[data-accordion]').forEach(b => b.classList.remove('expanded'));

        if (!open) {
          sub.classList.add('open');
          btn.classList.add('expanded');
        }
      });
    });
  }
});
