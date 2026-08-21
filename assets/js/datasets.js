(() => {
  'use strict';

  document.querySelectorAll('[data-gallery]').forEach((gallery) => {
    const viewport = gallery.querySelector('[data-gallery-viewport]');
    const previous = gallery.querySelector('[data-gallery-prev]');
    const next = gallery.querySelector('[data-gallery-next]');
    if (!viewport) return;
    const move = (direction) => {
      const card = viewport.querySelector('.dataset-gallery-card');
      const distance = (card?.getBoundingClientRect().width || viewport.clientWidth * .78) + 14;
      viewport.scrollBy({ left: distance * direction, behavior: 'smooth' });
    };
    previous?.addEventListener('click', () => move(-1));
    next?.addEventListener('click', () => move(1));
  });

  const dialog = document.querySelector('[data-image-dialog]');
  const dialogImage = dialog?.querySelector('img');
  document.querySelectorAll('[data-lightbox-src]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!dialog || !dialogImage) return;
      dialogImage.src = button.dataset.lightboxSrc;
      dialogImage.alt = button.dataset.lightboxAlt || '';
      dialog.showModal();
    });
  });
  dialog?.querySelector('[data-dialog-close]')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  document.querySelectorAll('[data-copy-citation]').forEach((button) => {
    button.addEventListener('click', async () => {
      const citation = button.closest('.citation-box')?.querySelector('code')?.textContent?.trim();
      if (!citation) return;
      try {
        await navigator.clipboard.writeText(citation);
        button.textContent = 'Copied';
        button.classList.add('copied');
        window.setTimeout(() => {
          button.textContent = 'Copy BibTeX';
          button.classList.remove('copied');
        }, 1800);
      } catch {
        button.textContent = 'Select text to copy';
      }
    });
  });

  const sectionLinks = [...document.querySelectorAll('[data-section-link]')];
  const sections = sectionLinks
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);
  if (sectionLinks.length && sections.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        sectionLinks.forEach((link) => {
          link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`);
        });
      });
    }, { rootMargin: '-30% 0px -62%', threshold: 0 });
    sections.forEach((section) => observer.observe(section));
  }
})();
