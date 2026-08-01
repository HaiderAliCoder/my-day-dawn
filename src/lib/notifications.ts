import { Capacitor, type PermissionState } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { NativeSettings, AndroidSettings } from "capacitor-native-settings";

/**
 * Phase 1 notification infrastructure.
 *
 * This is the shared layer every later feature (alarms, task reminders,
 * routine pings) schedules through. It is intentionally the *only* file
 * that talks to @capacitor/local-notifications directly — everything else
 * should call the functions below.
 *
 * Platform behavior:
 *  - Native (Android via Capacitor): real OS-level scheduled notifications,
 *    survive the app being closed/killed, and (once the exact-alarm setting
 *    is granted) fire at the precise second even in Doze mode.
 *  - Web: falls back to the browser Notification API via the plugin's web
 *    implementation. This only works while the tab is open (a setTimeout
 *    under the hood) — there is no way around that in a browser. We still
 *    route through the same API so callers don't need to branch.
 */

export const isNative = () => Capacitor.isNativePlatform();

/** Channel ids used across the app. Keep in sync with ensureChannels(). */
export const CHANNELS = {
  /** Regular task/planner reminders — normal priority, default sound. */
  reminders: "reminders",
  /** Alarms — high priority, meant to interrupt like a real alarm clock. */
  alarms: "alarms",
} as const;

export type ChannelId = (typeof CHANNELS)[keyof typeof CHANNELS];

let channelsReady: Promise<void> | null = null;

/**
 * Creates the Android notification channels this app uses. Safe to call
 * repeatedly (creating a channel with the same id is a no-op update).
 * No-op on web, where channels aren't a concept.
 */
export function ensureChannels(): Promise<void> {
  if (!isNative()) return Promise.resolve();
  if (channelsReady) return channelsReady;

  channelsReady = (async () => {
    await LocalNotifications.createChannel({
      id: CHANNELS.reminders,
      name: "Reminders",
      description: "Task and planner reminders",
      importance: 3, // default: heads-up banner, no sound override
      visibility: 1,
      vibration: true,
    });
    await LocalNotifications.createChannel({
      id: CHANNELS.alarms,
      name: "Alarms",
      description: "Alarms you've set on tasks or routine items",
      importance: 5, // max: full heads-up + sound, like a real alarm
      visibility: 1,
      vibration: true,
    });
  })();

  return channelsReady;
}

export interface PermissionSnapshot {
  /** Whether notifications can be shown at all. */
  display: PermissionState;
  /**
   * Whether exact-time alarms are allowed. `null` on web/unsupported
   * platforms, where this isn't a separate concept from `display`.
   */
  exactAlarms: PermissionState | null;
}

/** Reads current permission state without prompting. */
export async function getPermissionStatus(): Promise<PermissionSnapshot> {
  const { display } = await LocalNotifications.checkPermissions();

  if (!isNative()) {
    return { display, exactAlarms: null };
  }

  try {
    const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting();
    return { display, exactAlarms: exact_alarm };
  } catch {
    // Older Android where this isn't a separate setting.
    return { display, exactAlarms: "granted" };
  }
}

/**
 * Requests the basic "can we show notifications" permission (the Android
 * 13+ runtime prompt / the browser's Notification permission prompt).
 * Does NOT touch exact-alarm permission — that's a separate settings-screen
 * flow, see requestExactAlarmPermission().
 */
export async function requestNotificationPermission(): Promise<PermissionState> {
  const { display } = await LocalNotifications.requestPermissions();
  if (display === "granted") await ensureChannels();
  return display;
}

/**
 * Exact alarms can't be granted via a normal permission prompt on Android —
 * the OS requires sending the user to a dedicated system settings screen.
 * This opens that screen and resolves once the user returns to the app.
 * No-op (resolves "granted") on web/older Android.
 */
export async function requestExactAlarmPermission(): Promise<PermissionState> {
  if (!isNative()) return "granted";
  try {
    const { exact_alarm } = await LocalNotifications.changeExactNotificationSetting();
    return exact_alarm;
  } catch {
    return "granted";
  }
}

/**
 * Opens this app's notification settings screen directly. Use this instead
 * of requestNotificationPermission() once `display` is "denied" — Android
 * stops showing its own in-app permission dialog after a request has been
 * denied once (sometimes even after just one denial, depending on OEM), so
 * requesting again silently does nothing. Deep-linking to system settings
 * is the only way to let the user flip it back on from that state.
 */
export async function openNotificationSettings(): Promise<void> {
  if (!isNative()) return;
  await NativeSettings.openAndroid({ option: AndroidSettings.AppNotification });
}

/**
 * Opens the "ignore battery optimization" screen for this app. Several
 * Android OEMs (Samsung, Xiaomi, Oppo, Vivo, etc.) aggressively kill
 * background apps to save battery, which can delay or drop scheduled
 * notifications/alarms even when notification permission itself is
 * granted — this is a separate setting from notification permission and
 * is the most common reason background delivery is unreliable on some
 * phones and not others.
 */
export async function openBatteryOptimizationSettings(): Promise<void> {
  if (!isNative()) return;
  await NativeSettings.openAndroid({ option: AndroidSettings.BatteryOptimization });
}

export interface ScheduleInput {
  /** Stable numeric id — reuse it to update/cancel the same notification later. */
  id: number;
  title: string;
  body: string;
  /** When it should fire. */
  at: Date;
  channel?: ChannelId;
  /** Extra data delivered back to the app when the notification is tapped. */
  extra?: Record<string, unknown>;
}

/** Schedules (or reschedules, if `id` already exists) a single notification. */
export async function scheduleNotification(input: ScheduleInput): Promise<void> {
  await ensureChannels();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: input.id,
        title: input.title,
        body: input.body,
        channelId: input.channel ?? CHANNELS.reminders,
        schedule: { at: input.at, allowWhileIdle: true },
        extra: input.extra,
      },
    ],
  });
}

/** Cancels one or more previously scheduled notifications by id. */
export async function cancelNotifications(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
}

/** Lists everything still pending (useful for a debug/settings view). */
export async function getPendingNotifications() {
  const { notifications } = await LocalNotifications.getPending();
  return notifications;
}

/**
 * Fires a notification a few seconds from now — purely for letting the user
 * confirm notifications actually work on their device/browser.
 */
export async function sendTestNotification(): Promise<void> {
  await scheduleNotification({
    id: 999999,
    title: "Test notification",
    body: "If you can see this, notifications are working.",
    at: new Date(Date.now() + 5000),
    channel: CHANNELS.reminders,
  });
}
