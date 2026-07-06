document.querySelectorAll('[data-legal-date]').forEach(el => {
  el.textContent = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
});
