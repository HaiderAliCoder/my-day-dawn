# Round 2 — Permission fix + offline app shell

## 1. Notification permission fix

**Root cause:** Android stops showing its own in-app permission dialog after
a request has been denied once (sometimes after just one denial, depending
on OEM). If your very first test build hit a denial before everything was
wired up correctly, every "Enable" tap after that silently does nothing —
there's no dialog to show anymore, and it stays stuck.

**What changed:**
- `AndroidManifest.xml` — explicitly declares `POST_NOTIFICATIONS` (belt
  and suspenders; the plugin already merges this in, but this removes any
  doubt).
- `src/lib/notifications.ts` — added `openNotificationSettings()` and
  `openBatteryOptimizationSettings()`, using the new
  `capacitor-native-settings` plugin to deep-link straight into your
  phone's system settings for this app.
- `src/routes/settings.tsx` — once permission shows "Denied", the button
  changes from a dead-end "Enable" to "Open settings", with an explanation
  of why. There's also a new **Background reliability** row that opens
  battery-optimization settings — several Android OEMs (Samsung, Xiaomi,
  Oppo, Vivo especially) kill background apps aggressively by default,
  which is a *separate* setting from notification permission and a common
  cause of "works sometimes, not others."

**What you need to do on your phone:**
Since your test builds are already stuck in the "silently denied" state,
the in-app button can't fix that retroactively. Do one of:
- Go to **Settings → Apps → My Day Dawn → Notifications** and turn it on
  manually, **or**
- Fully **uninstall** the app before installing the next build (a fresh
  install resets permission state).

Then also open **Battery settings** (new button in the app) and set it to
unrestricted / not optimized, for background reliability.

New dependency: `capacitor-native-settings` — run `bun add
capacitor-native-settings` (already reflected in the included
`package.json`).

## 2. Offline app shell (the bigger change)

Your `capacitor.config.ts` was loading the app from `https://my-day-dawn.lovable.app/`
live, over the network, every time it opened — meaning no wifi/data meant
the app couldn't open at all. That's now fixed:

- **New file `vite.mobile.config.ts`** — a separate build specifically for
  the Android app: no server (`nitro: false`), and TanStack Start's SPA
  mode produces a fully static, self-contained `index.html`.
- **`capacitor.config.ts`** — `server.url` removed. `webDir` now points to
  `dist/client`, the static build's output. The app opens from files
  bundled inside the APK — zero network needed to launch.
- **`package.json`** — new scripts:
  - `bun run build:mobile` — builds the static shell into `dist/client`.
  - `bun run android:build` — does that, then runs `cap sync android` in
    one step. Use this before opening Android Studio.

**I verified this actually builds and serves correctly** — I ran the full
build, confirmed `dist/client/index.html` is produced, and served it with a
plain static file server (no backend at all) to confirm the shell loads.
**Your web deploy on Lovable is completely untouched** — it still uses the
original `vite.config.ts` / `bun run build`, unaffected by any of this.

**Important — what this does and doesn't fix:**
- ✅ The app now **opens** with no network — no more blank/error screen in
  airplane mode.
- ✅ Notifications/alarms scheduled while online will still **fire** offline
  regardless (that was never blocked by this — it's OS-level and doesn't
  need the WebView loaded at all).
- ❌ Your actual **data** — tasks, goals, habits, etc. — still needs network
  to load/save, since it's live Supabase calls. Opening the app offline
  right now will show empty/stale screens for anything data-driven. That's
  the "data sync" work we agreed to sequence for later.

## How to apply this
1. Copy these files into your repo at the same paths.
2. `bun add @capacitor/local-notifications capacitor-native-settings` (if
   you haven't already from round 1).
3. `bun run android:build` — builds the static shell and syncs it into the
   native project.
4. Open in Android Studio (`npx cap open android`), rebuild, and — this
   time — **uninstall the old app from your phone first**, then install
   fresh so the permission state resets.
5. In Settings: grant notification permission (should show the real system
   dialog this time on a fresh install), set battery settings to
   unrestricted, send a test notification, then try turning on airplane
   mode and reopening the app to confirm it still opens.

## Next
Once you've confirmed both of these on your phone (permission grants
cleanly, app opens in airplane mode), let me know and I'll move on to
Phase 2 (Alarms) as planned.
