import { registerPlugin } from "@capacitor/core";
import { isNative } from "@/lib/notifications";

/**
 * Bridge to FocusTimerService (see android/.../FocusTimerService.java) — a
 * foreground service that owns a persistent, self-updating countdown
 * notification for a running focus session, and fires the real completion
 * alert (notification + vibration) on its own internal clock. Unlike a
 * scheduled LocalNotification, this keeps ticking and completes reliably
 * even when the app is backgrounded and some OEMs would otherwise freeze
 * the process — Android does not freeze a process actively running a
 * foreground service.
 *
 * No-op on web / when not running as the installed native app.
 */
interface FocusTimerNativePlugin {
  start(options: { endAt: number; label: string; totalSeconds: number }): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
}

const FocusTimerNative = registerPlugin<FocusTimerNativePlugin>("FocusTimer");

/** Starts (or restarts, e.g. on resume) the live countdown notification. */
export async function startFocusTimerNotification(
  endAt: number,
  label: string,
  totalSeconds: number
): Promise<void> {
  if (!isNative()) return;
  try {
    await FocusTimerNative.start({ endAt, label, totalSeconds });
  } catch {
    // Best-effort — in-app UI still shows the countdown regardless.
  }
}

/** Switches the notification to a "paused" state without stopping the service. */
export async function pauseFocusTimerNotification(): Promise<void> {
  if (!isNative()) return;
  try {
    await FocusTimerNative.pause();
  } catch {
    // Best-effort.
  }
}

/** Stops the service and clears the ongoing notification (cancel/finish). */
export async function stopFocusTimerNotification(): Promise<void> {
  if (!isNative()) return;
  try {
    await FocusTimerNative.stop();
  } catch {
    // Best-effort.
  }
}
