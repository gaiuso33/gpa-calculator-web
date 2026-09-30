/* GPA Calculator Pro — PWA glue (Jira #20)
   Registers the service worker, shows an Install button when the browser
   offers one, and explains "Add to Home Screen" on iOS Safari. */
'use strict';

(function () {
  /* ── Service worker ── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.error('SW registration failed:', err));
    });
  }

  const btn = document.getElementById('install-btn');
  if (!btn) return;

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone()) return;                                  // already installed: nothing to offer

  /* ── Chrome / Edge / Android: native install prompt ── */
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();                                        // keep the event; show our own button
    deferred = e;
    btn.hidden = false;
  });

  btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      btn.hidden = true;
    } else if (typeof UI !== 'undefined') {
      UI.toast('In Safari: tap Share → Add to Home Screen', 'info');
    }
  });

  window.addEventListener('appinstalled', () => {
    btn.hidden = true;
    deferred = null;
    if (typeof UI !== 'undefined') UI.toast('GPA Pro installed!', 'success');
  });

  /* ── iOS Safari has no install event: show the button with instructions ── */
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
  if (isIOS) btn.hidden = false;
})();
