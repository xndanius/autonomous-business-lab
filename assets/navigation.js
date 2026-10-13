(function () {
  'use strict';
  var header = document.querySelector('.nav');
  var toggle = header && header.querySelector('.menu-toggle');
  var menu = header && header.querySelector('#main-menu');
  if (!toggle || !menu) return;
  header.classList.add('has-menu');
  toggle.hidden = false;
  function close(restoreFocus) {
    toggle.setAttribute('aria-expanded', 'false');
    header.classList.remove('menu-open');
    if (restoreFocus) toggle.focus();
  }
  toggle.addEventListener('click', function () {
    var open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    header.classList.toggle('menu-open', open);
  });
  menu.addEventListener('click', function (event) { if (event.target.closest('a')) close(false); });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') close(true);
  });
  document.addEventListener('click', function (event) { if (!header.contains(event.target)) close(false); });
})();
