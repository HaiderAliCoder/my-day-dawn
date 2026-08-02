import { registerPlugin } from "@capacitor/core";
import { isNative } from "@/lib/notifications";

export interface TimetableAlarmEntry {
  id: string;
  title: string;
  atMillis: number;
}

interface TimetableAlarmsNativePlugin {
  scheduleAll(options: { entries: TimetableAlarmEntry[] }): Promise<void>;
  cancelAll(): Promise<void>;
}

const TimetableAlarmsNative = registerPlugin<TimetableAlarmsNativePlugin>("TimetableAlarms");

/**
 * Replaces the full set of scheduled timetable alarms with `entries`. Call
 * this with roughly the next 48h of resolved entries every time the app
 * opens/resumes or the weekly schedule/overrides change — the native side
 * persists the list so it can re-arm everything after a reboot.
 */
export async function scheduleTimetableAlarms(entries: TimetableAlarmEntry[]): Promise<void> {
  if (!isNative()) return;
  try {
    await TimetableAlarmsNative.scheduleAll({ entries });
  } catch {
    // Best-effort — worst case, alarms for this refresh cycle don't update.
  }
}

export async function cancelTimetableAlarms(): Promise<void> {
  if (!isNative()) return;
  try {
    await TimetableAlarmsNative.cancelAll();
  } catch {
    // Best-effort.
  }
}
