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
