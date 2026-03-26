    const burger  = document.getElementById('burger');
    const drawer  = document.getElementById('drawer');

    burger.addEventListener('click', () => {
      const open = drawer.classList.toggle('open');
      burger.classList.toggle('open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });

    document.querySelectorAll('.drawer-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const sub = document.getElementById(btn.dataset.target);
        const opening = !sub.classList.contains('open');

        document.querySelectorAll('.drawer-sub.open').forEach(s => s.classList.remove('open'));
        document.querySelectorAll('.drawer-toggle.open').forEach(b => b.classList.remove('open'));

        if (opening) {
          sub.classList.add('open');
          btn.classList.add('open');
        }
      });
    });

    drawer.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        drawer.classList.remove('open');
        burger.classList.remove('open');
        document.body.style.overflow = '';
      });
    });