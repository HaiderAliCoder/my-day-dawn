# Phase 1 — Notification infrastructure

## What's in here
- `src/lib/notifications.ts` — **new file.** The one place that talks to the
  Capacitor Local Notifications plugin. Everything later (alarms, task
  reminders, routine pings) will call functions from this file instead of
  the plugin directly.
- `src/routes/settings.tsx` — **modified.** Added a "Notifications" panel:
  shows permission status, lets you grant notification + exact-alarm
  permission, and has a "Send test notification" button.
- `android/app/src/main/AndroidManifest.xml` — **modified.** Added the
  `SCHEDULE_EXACT_ALARM` permission so scheduled notifications (and later,
  alarms) fire at the precise time instead of getting batched by Android's
  Doze mode.
- `package.json` — **modified.** Added `@capacitor/local-notifications` as a
  dependency.

## How to apply this
1. Copy these files into the same paths in your actual repo, overwriting
   `src/routes/settings.tsx` and `android/app/src/main/AndroidManifest.xml`,
   and adding the new `src/lib/notifications.ts`.
2. Since your project uses `bun` (there's a `bun.lock`), install the new
   dependency with bun instead of copying my `package.json` wholesale —
   just run:
   ```
   bun add @capacitor/local-notifications
   ```
   (This does the same thing my `package.json` edit does — I'm including it
   here just so you can diff it if you want.)
3. Sync the native Android project so the plugin's native code gets pulled
   in:
   ```
   npx cap sync android
   ```
4. Open the project in Android Studio (`npx cap open android`) and build/run
   on your phone like normal.
5. In the app: go to **Settings**, and you should see the new
   **Notifications** panel. Tap **Enable** for both rows, then **Send test
   notification** — it should show up in your phone's notification shade
   about 5 seconds later.

## What this does and doesn't do yet
- ✅ Requests the Android 13+ notification permission and the Android 12+
  exact-alarm setting, with clear status shown in Settings.
- ✅ Sets up two notification channels (`reminders`, `alarms`) with
  different importance — alarms are max-importance/heads-up, reminders are
  normal.
- ✅ Gives you `scheduleNotification()`, `cancelNotifications()`, and
  `getPendingNotifications()` to build on.
- ✅ Works on web too (falls back to the browser Notification API), so
  nothing breaks for the browser version — though as before, web
  notifications only fire while the tab is open, that's a browser
  limitation, not something we can fix from JS.
- ❌ Nothing schedules a *real* reminder/alarm yet — that's Phase 2 (Alarms)
  and Phase 3 (task time tracking), which will call `scheduleNotification()`
  from this file.

## Next
Once you've confirmed the test notification works on your actual phone,
say the word and I'll move on to Phase 2 (the Alarms feature) — including
the Supabase table for storing alarms and the SQL for you to run.
