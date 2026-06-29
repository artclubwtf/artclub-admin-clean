// assets/hero-logo.js
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.hero-logo-section').forEach((sectionEl) => {
    const navLogo = document.querySelector(sectionEl.dataset.navSelector);
    const offset = Number.parseInt(sectionEl.dataset.offset, 10) || 0;

    if (!navLogo) return;

    const update = () => {
      if (sectionEl.getBoundingClientRect().bottom > offset) {
        navLogo.classList.add('hidden');
      } else {
        navLogo.classList.remove('hidden');
      }
    };

    window.addEventListener('scroll', update, { passive: true });
    update();
  });
});
