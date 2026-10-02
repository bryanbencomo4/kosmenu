(function () {
  let workerPromise;
  let pending = [];
  let publishTimer;
  const seen = new Set();

  function worker() {
    if (!workerPromise) {
      workerPromise = navigator.serviceWorker.getRegistration('/merchant-push/').then(function (existing) {
        return existing || navigator.serviceWorker.register('/merchant-notifications-sw.js', {
          scope: '/merchant-push/',
        });
      }).then(function (registration) {
        if (registration.active) return registration;
        const installing = registration.installing || registration.waiting;
        if (!installing) throw new Error('Notification worker unavailable');
        return new Promise(function (resolve, reject) {
          installing.addEventListener('statechange', function () {
            if (installing.state === 'activated') resolve(registration);
            if (installing.state === 'redundant') reject(new Error('Notification worker failed'));
          });
        });
      }).catch(function (error) {
        workerPromise = null;
        throw error;
      });
    }
    return workerPromise;
  }

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  window.__merchantNotifications = {
    enable: async function (configJson, vapidKey) {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIos && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches) {
        return JSON.stringify({ status: 'install-required' });
      }
      if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator)) {
        return JSON.stringify({ status: 'unsupported' });
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return JSON.stringify({ status: permission });
      await worker();
      if (!configJson || !vapidKey) return JSON.stringify({ status: 'foreground-only' });
      try {
        const config = JSON.parse(configJson);
        if (!window.firebase) {
          await loadScript('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
        }
        if (!window.firebase.messaging) {
          await loadScript('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');
        }
        if (!await firebase.messaging.isSupported()) {
          return JSON.stringify({ status: 'foreground-only' });
        }
        if (!firebase.apps.length) firebase.initializeApp(config);
        const configured = await navigator.serviceWorker.register(
          '/merchant-notifications-sw.js?config=' + encodeURIComponent(JSON.stringify(config)),
          { scope: '/merchant-push/' },
        );
        workerPromise = Promise.resolve(configured);
        const token = await firebase.messaging().getToken({
          vapidKey: vapidKey,
          serviceWorkerRegistration: configured,
        });
        return JSON.stringify({ status: token ? 'enabled' : 'foreground-only', token: token });
      } catch (_) {
        return JSON.stringify({ status: 'foreground-only' });
      }
    },
    show: function (orderId, label) {
      if (!('Notification' in window) || Notification.permission !== 'granted' || seen.has(orderId)) return;
      seen.add(orderId);
      if (seen.size > 512) seen.delete(seen.values().next().value);
      pending.push({ id: orderId, label: label });
      if (publishTimer) return;
      publishTimer = setTimeout(async function () {
        publishTimer = null;
        const batch = pending;
        pending = [];
        const newest = batch[batch.length - 1];
        try {
          const registration = await worker();
          await registration.showNotification(
            batch.length === 1 ? 'Nuevo pedido' : batch.length + ' pedidos nuevos',
            {
              body: 'Pedido ' + newest.label,
              icon: '/icons/Icon-192.png',
              tag: 'merchant-orders',
              data: { orderId: newest.id },
            },
          );
        } catch (_) {
          // Realtime alerts inside the panel remain available.
        }
      }, 1000);
    },
  };
})();