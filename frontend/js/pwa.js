// Bicho Master Pro - Gerenciamento de PWA e Instalacao Mobile v3.2
(function() {
  let deferredPrompt = window._deferredPWAInstallPrompt || null;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isInAppBrowser = /FBAN|FBAV|Instagram|WhatsApp|Line|FB_IAB/i.test(navigator.userAgent);

  // 1. Registro do Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js?v=3.2', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] Service Worker registrado no escopo:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Erro ao registrar Service Worker:', err);
        });
    });
  }

  // 2. Estado de instalacao: esconde chamadas para instalar SOMENTE se ja estiver dentro do app instalado
  function updateUIForInstalledState() {
    if (!isStandalone) return;

    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'none';

    const headerBtn = document.getElementById('btn-header-install');
    if (headerBtn) headerBtn.style.display = 'none';

    const homeCard = document.getElementById('home-card-install-app');
    if (homeCard) homeCard.style.display = 'none';

    const authBox = document.getElementById('auth-gate-install-box');
    if (authBox) authBox.style.display = 'none';

    const drawerBtn = document.getElementById('btn-drawer-install');
    if (drawerBtn) {
      drawerBtn.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="text-sm">📱</span>
          <span>App Instalado</span>
        </div>
        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Ativo</span>
      `;
      drawerBtn.classList.remove('cursor-pointer');
      drawerBtn.disabled = true;
    }
  }

  // 3. Captura do prompt nativo de instalacao (Android / Chrome / Edge)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window._deferredPWAInstallPrompt = e;
    console.log('[PWA] Evento beforeinstallprompt capturado com sucesso!');

    if (isStandalone) {
      updateUIForInstalledState();
      return;
    }

    const dismissedTime = localStorage.getItem('bicho_pwa_dismissed');
    const now = Date.now();
    if (!dismissedTime || (now - parseInt(dismissedTime, 10)) > 24 * 60 * 60 * 1000) {
      setTimeout(() => {
        const banner = document.getElementById('pwa-install-banner');
        if (banner && !isStandalone) {
          banner.classList.remove('hidden');
          banner.classList.add('flex');
        }
      }, 2500);
    }
  });

  // 4. Executa a acao de instalar
  window.triggerPWAInstall = async function() {
    localStorage.removeItem('bicho_pwa_dismissed');

    const activePrompt = deferredPrompt || window._deferredPWAInstallPrompt;

    // Se o navegador disparou o deferredPrompt nativo (Android Chrome/Edge/Samsung)
    if (activePrompt) {
      try {
        activePrompt.prompt();
        const choice = await activePrompt.userChoice;
        console.log('[PWA] Resposta do usuario:', choice.outcome);
        if (choice.outcome === 'accepted') {
          if (typeof showToast === 'function') {
            showToast('Aplicativo instalado com sucesso!', 'success');
          }
          dismissPWABanner();
          updateUIForInstalledState();
        }
      } catch (err) {
        console.warn('[PWA] Erro ao disparar prompt nativo:', err);
      }
      deferredPrompt = null;
      window._deferredPWAInstallPrompt = null;
      return;
    }

    // Se o app ja estiver instalado no dispositivo
    if (isStandalone) {
      if (typeof showToast === 'function') {
        showToast('O Bicho Master ja esta instalado e ativo no seu dispositivo!', 'info');
      }
      return;
    }

    // Se for iPhone / iPad (Safari)
    if (isIOS) {
      const modal = document.getElementById('ios-install-modal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }
      return;
    }

    // Se estiver navegando dentro do WebView do WhatsApp / Instagram
    const inAppWarn = document.getElementById('inapp-browser-warning');
    const normalSteps = document.getElementById('generic-modal-steps');
    if (isInAppBrowser) {
      if (inAppWarn) inAppWarn.classList.remove('hidden');
      if (normalSteps) normalSteps.classList.add('hidden');
    } else {
      if (inAppWarn) inAppWarn.classList.add('hidden');
      if (normalSteps) normalSteps.classList.remove('hidden');
    }

    // Modal de orientacao para Android / Chrome / Desktop
    const modalGeneric = document.getElementById('generic-install-modal');
    if (modalGeneric) {
      modalGeneric.classList.remove('hidden');
      modalGeneric.classList.add('flex');
    }
  };

  window.dismissPWABanner = function() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) {
      banner.classList.add('hidden');
      banner.classList.remove('flex');
    }
    localStorage.setItem('bicho_pwa_dismissed', Date.now().toString());
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

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] Aplicativo Bicho Master instalado com sucesso!');
    if (typeof showToast === 'function') {
      showToast('Bicho Master Pro instalado na sua tela inicial!', 'success');
    }
    updateUIForInstalledState();
    dismissPWABanner();
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (isStandalone) {
      updateUIForInstalledState();
    }
  });
})();
