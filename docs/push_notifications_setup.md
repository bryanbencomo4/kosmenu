# Push Notifications Setup (Kosmenu)

## 1) Firebase app files

Flutter requires Firebase app configuration per platform.

- Android: place `google-services.json` in `android/app/google-services.json`.
- iOS: place `GoogleService-Info.plist` in `ios/Runner/GoogleService-Info.plist`.

If these files are missing, Firebase Messaging will not initialize at runtime.

## 2) Custom sound files

The app and FCM payload are configured to use `cash_register`.

- Android sound file:
  - Path: `android/app/src/main/res/raw/cash_register.mp3`
  - Resource name used by app: `cash_register`

- iOS sound file:
  - Add `cash_register.aiff` to `ios/Runner` in Xcode target resources.
  - Payload uses `cash_register.aiff`.

## 3) Supabase table and webhook

Run SQL script:

- `supabase/sql/notify_order_setup.sql`

Deploy function:

- `supabase/functions/notify-order/index.ts`

Then configure DB webhook on `pedidos` INSERT to call:

- `https://<project-ref>.supabase.co/functions/v1/notify-order`

## 4) What is already implemented in Flutter

- FCM token registration to `user_tokens` on login/token refresh.
- Foreground local notification with `flutter_local_notifications` and custom sound.
- Tap on notification routes to order gate flow using `orderId` from payload data.

## 5) Merchant browser notifications

Open the bell in the merchant dashboard to request permission. Permission is
requested only after a user action. Browser alerts are grouped for one second
and deduplicated with a bounded 512-ID cache. They use the authenticated
`/orders/view/{orderId}` route; existing order authorization still applies.

Background FCM requires the following public configuration in the build
environment or `site/.env.local`:

- `FIREBASE_WEB_CONFIG`: JSON for the Firebase **web app** in the same project
  used by `notify-order`, including `apiKey`, `projectId`, `messagingSenderId`,
  and `appId`. Do not use an Android app registration or service-account JSON.
- `FIREBASE_WEB_VAPID_KEY`: the public Web Push certificate key from Firebase
  Console > Project settings > Cloud Messaging.

The Flutter deploy script passes these as Dart defines. No service-account
private key is bundled. Without these values, the UI explicitly reports that
alerts require the panel to remain open; closed-panel push is not enabled.

`merchant-notifications-sw.js` has its own `/merchant-push/` scope so it does
not replace Flutter's app service worker. The deployment rewrites must serve
both notification JavaScript files as JavaScript, not the SPA's HTML.

### Platform requirements

- Desktop/Android: supported browser, HTTPS, permission granted and notifications
  enabled at OS level. Battery-saving/background restrictions can delay delivery.
- iPhone/iPad: iOS/iPadOS 16.4+ and the app added to the Home Screen; activate
  notifications from the installed app. A normal Safari tab cannot provide the
  same background-push guarantees.
- Focus/Do Not Disturb, denied permissions, offline devices, revoked tokens and
  vendor outages can prevent or delay notifications. Absolute delivery is not
  guaranteed. Realtime plus reconciliation remains the in-panel source of truth.

### Verification before claiming background push works

1. Confirm the Firebase web app/project and VAPID configuration are deployed.
2. Activate the bell while authenticated; confirm a `device_type = 'web'` token
   for that user exists in `user_tokens` without logging token contents.
3. Send one controlled test order, then test foreground, background, closed app,
   reconnection and notification click on desktop, Android and installed iPhone.
4. Confirm the `notify-order` deployment accepts the database webhook and logs
   successful FCM delivery. Use `--no-verify-jwt` when deploying that function.

## 6) Dashboard freshness and capacity

- Recent realtime window: 150 orders, filtered by commerce.
- Shell publication is coalesced at 250 ms; no historical fetch per event.
- Metrics retain previously loaded rows when they leave the recent window and
  prefer live versions when the initial history request completes.
- Visible-panel reconciliation: at most one request for 150 recent rows every
  60 seconds, plus resume recovery. No polling while the panel is backgrounded.
- Transient reconnect delays: 5, 10, 20, then 60 seconds.

Local regression tests cover 5,000 metric rows and a burst of 1,000 browser
alerts. These are not database/network load tests or an uptime guarantee.
Historical all-time metrics still use paginated client-side reads with the
existing repository limit. For sustained large history, use server-side
aggregate metrics/pagination and measure production latency, memory and queue
lag before raising traffic limits. No production schema was changed here.

Read-only operational checks (run with appropriate database access):

```sql
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'pedidos';

select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'pedidos';
```

Verify an index supporting `comercio_id, created_at` and tenant RLS. Missing
publication/index settings require a reviewed migration, not an ad hoc change
to production during UI deployment.
