// Bicho Master Pro / Radar 5x5 Pro - Gerenciamento de PWA e Limpeza de Service Worker
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

  // Verificação e Ocultação Imediata para quem já baixou/instalou
  function checkAndHideIfInstalled() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         window.matchMedia('(display-mode: window-controls-overlay)').matches ||
                         window.navigator.standalone === true ||
                         localStorage.getItem('pwa_installed') === 'true';

    if (isStandalone) {
      try { localStorage.setItem('pwa_installed', 'true'); } catch (e) {}
      document.documentElement.classList.add('app-is-installed');
      
      const elementsToHide = [
        'home-card-install-app',
        'auth-gate-install-box',
        'btn-drawer-install',
        'pwa-install-banner'
      ];
      elementsToHide.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.display = 'none';
          el.classList.add('hidden');
        }
      });
    }
  }

  checkAndHideIfInstalled();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndHideIfInstalled);
  } else {
    setTimeout(checkAndHideIfInstalled, 100);
    setTimeout(checkAndHideIfInstalled, 500);
  }

  // Evento disparado pelo navegador quando a instalação é concluída
  window.addEventListener('appinstalled', (evt) => {
    console.log('[PWA] Sucesso: aplicativo foi instalado pelo usuário!');
    try { localStorage.setItem('pwa_installed', 'true'); } catch (e) {}
    checkAndHideIfInstalled();
  });

  // Suporte a instalação PWA
  let deferredPrompt = window._deferredPWAInstallPrompt || null;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

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
        const choice = await activePrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          try { localStorage.setItem('pwa_installed', 'true'); } catch (e) {}
          checkAndHideIfInstalled();
        }
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
