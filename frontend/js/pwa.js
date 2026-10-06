// Bicho Master Pro - Gerenciamento de PWA e Limpeza de Service Worker
(function() {
  // Desregistra qualquer Service Worker ativo imediatamente
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (let reg of registrations) {
        reg.unregister().then(() => {
          console.log('[PWA] Service Worker desregistrado com sucesso.');
        });
      }
    });
  }

  // Limpa todos os caches locais para evitar telas presas ou scripts corrompidos
  if ('caches' in window) {
    caches.keys().then((keys) => {
      for (let k of keys) {
        caches.delete(k);
      }
    });
  }

  // Suporte a instalação PWA sem Service Worker interceptor
  let deferredPrompt = window._deferredPWAInstallPrompt || null;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window._deferredPWAInstallPrompt = e;
  });

  window.triggerPWAInstall = async function() {
    const activePrompt = deferredPrompt || window._deferredPWAInstallPrompt;
    if (activePrompt) {
      try {
        activePrompt.prompt();
      } catch (err) {}
      deferredPrompt = null;
      window._deferredPWAInstallPrompt = null;
      return;
    }
    if (isIOS) {
      const modal = document.getElementById('ios-install-modal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }
      return;
    }
    const modalGeneric = document.getElementById('generic-install-modal');
    if (modalGeneric) {
      modalGeneric.classList.remove('hidden');
      modalGeneric.classList.add('flex');
    }
  };

  window.closeIOSInstallModal = function() {
    const modal = document.getElementById('ios-install-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  };

  window.closeGenericInstallModal = function() {
    const modal = document.getElementById('generic-install-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  };

  window.dismissPWABanner = function() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) {
      banner.classList.add('hidden');
      banner.classList.remove('flex');
    }
  };
})();
