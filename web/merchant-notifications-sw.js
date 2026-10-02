self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const orderId = data.orderId || data.FCM_MSG?.data?.orderId;
  if (!orderId) return;
  const url = new URL('/orders/view/' + encodeURIComponent(orderId), self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const client = clients.find((candidate) => new URL(candidate.url).origin === self.location.origin);
    if (client) {
      await client.navigate(url);
      return client.focus();
    }
    return self.clients.openWindow(url);
  }));
});

const configJson = new URL(self.location.href).searchParams.get('config');
if (configJson) {
  importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');
  firebase.initializeApp(JSON.parse(configJson));
  firebase.messaging();
}