const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const bridgeSource = readFileSync(path.join(__dirname, '../web/merchant-notifications.js'), 'utf8');
const workerSource = readFileSync(path.join(__dirname, '../web/merchant-notifications-sw.js'), 'utf8');

function setup({ permission = 'granted', ios = false, installed = false } = {}) {
  const notifications = [];
  const timers = [];
  const registrations = [];
  const registration = {
    active: {},
    showNotification: async (title, options) => notifications.push({ title, options }),
  };
  const context = {
    window: { isSecureContext: true },
    navigator: {
      userAgent: ios ? 'iPhone' : 'Desktop',
      standalone: installed,
      serviceWorker: {
        getRegistration: async () => registration,
        register: async (url) => { registrations.push(url); return registration; },
      },
    },
    Notification: {
      permission,
      requestPermission: async () => permission,
    },
    matchMedia: () => ({ matches: installed }),
    setTimeout: (callback) => { timers.push(callback); return timers.length; },
    document: { createElement: () => ({}), head: { appendChild: (script) => script.onload() } },
  };
  context.window.Notification = context.Notification;
  vm.runInNewContext(bridgeSource, context);
  return {
    bridge: context.window.__merchantNotifications,
    notifications,
    registrations,
    context,
    flush: async () => {
      for (const callback of timers.splice(0)) await callback();
    },
  };
}

test('permission denial does not register push or show alerts', async () => {
  const instance = setup({ permission: 'denied' });
  assert.equal(JSON.parse(await instance.bridge.enable('', '')).status, 'denied');
  instance.bridge.show('order-1', 'EMXFA-1');
  await instance.flush();
  assert.equal(instance.notifications.length, 0);
  assert.equal(instance.registrations.length, 0);
});

test('iPhone requires installation before requesting push', async () => {
  const instance = setup({ ios: true });
  assert.equal(JSON.parse(await instance.bridge.enable('', '')).status, 'install-required');
});

test('missing Firebase config explicitly enables foreground alerts only', async () => {
  const instance = setup();
  assert.equal(JSON.parse(await instance.bridge.enable('', '')).status, 'foreground-only');
});

test('1000 arrivals are grouped and duplicate ids are ignored', async () => {
  const instance = setup();
  for (let index = 0; index < 1000; index++) {
    instance.bridge.show('order-' + index, 'EMXFA-' + index);
    instance.bridge.show('order-' + index, 'EMXFA-' + index);
  }
  await instance.flush();
  assert.equal(instance.notifications.length, 1);
  assert.equal(instance.notifications[0].title, '1000 pedidos nuevos');
  assert.equal(instance.notifications[0].options.data.orderId, 'order-999');
});

test('configured FCM worker is not replaced by foreground notifications', async () => {
  const instance = setup();
  const messaging = () => ({ getToken: async () => 'mock-token' });
  messaging.isSupported = async () => true;
  instance.context.firebase = instance.context.window.firebase = {
    apps: [{}], messaging,
  };
  const result = JSON.parse(await instance.bridge.enable('{"projectId":"mock"}', 'mock-vapid'));
  assert.equal(result.status, 'enabled');
  assert.equal(result.token, 'mock-token');
  instance.bridge.show('order-1', 'EMXFA-1');
  await instance.flush();
  assert.equal(instance.registrations.length, 1);
  assert.match(instance.registrations[0], /config=/);
});

test('notification click opens the authenticated merchant order route', async () => {
  const handlers = {};
  let opened;
  const self = {
    location: { href: 'https://app.elmenuxfa.com/merchant-notifications-sw.js', origin: 'https://app.elmenuxfa.com' },
    addEventListener: (name, callback) => { handlers[name] = callback; },
    clients: {
      matchAll: async () => [],
      openWindow: async (url) => { opened = url; },
    },
  };
  vm.runInNewContext(workerSource, { self, URL });
  let completion;
  handlers.notificationclick({
    notification: { close() {}, data: { FCM_MSG: { data: { orderId: 'EMXFA-123' } } } },
    waitUntil: (promise) => { completion = promise; },
  });
  await completion;
  assert.equal(opened, 'https://app.elmenuxfa.com/orders/view/EMXFA-123');
});