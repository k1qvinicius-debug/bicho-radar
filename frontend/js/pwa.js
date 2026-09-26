// Bicho Master Pro - Gerenciamento de PWA e Instalação Mobile v2.5
(function() {
  let deferredPrompt = null;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  // 1. Registro do Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js?v=3.0', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] Service Worker registrado no escopo:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Erro ao registrar Service Worker:', err);
        });
    });
  }

  // 2. Estado de instalação: esconde chamadas para instalar SOMENTE se já estiver dentro do app instalado
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

  // 3. Captura do prompt nativo de instalação (Android / Chrome / Edge)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('[PWA] Evento beforeinstallprompt capturado com sucesso!');

    if (isStandalone) {
      updateUIForInstalledState();
      return;
    }

    // Exibe banner flutuante apenas se não tiver sido dispensado nas últimas 24h
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

  // 4. Executa a ação de instalar
  window.triggerPWAInstall = async function() {
    // Limpa qualquer bloqueio anterior
    localStorage.removeItem('bicho_pwa_dismissed');

    // Se o navegador disparou o deferredPrompt (Android Chrome/Samsung/Edge nativo)
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        console.log('[PWA] Resposta do usuário:', choice.outcome);
        if (choice.outcome === 'accepted') {
          dismissPWABanner();
          updateUIForInstalledState();
        }
      } catch (err) {
        console.warn('[PWA] Erro ao disparar prompt nativo:', err);
      }
      deferredPrompt = null;
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

    // Se for Android/Chrome/Desktop onde o prompt nativo precisa de orientação visual
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
    updateUIForInstalledState();
    dismissPWABanner();
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (isStandalone) {
      updateUIForInstalledState();
    }
  });
})();
