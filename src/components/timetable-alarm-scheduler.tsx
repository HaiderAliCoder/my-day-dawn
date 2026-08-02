import { useEffect } from "react";
import { useTimetable, type TimetableEntry } from "@/lib/store";
import { scheduleTimetableAlarms, type TimetableAlarmEntry } from "@/lib/timetable-alarms";

const LOOKAHEAD_DAYS = 2; // ~48h

function entryToAlarmMillis(day: Date, entry: TimetableEntry): number {
  const [h, m, s] = entry.startTime.split(":").map(Number);
  const at = new Date(day);
  at.setHours(h, m, s ?? 0, 0);
  return at.getTime();
}

/**
 * Invisible, app-wide component (mounted once in the root layout) that keeps
 * the native alarm schedule in sync with the resolved timetable. Runs on
 * mount, whenever weekly blocks/overrides change, and whenever the app
 * becomes visible again (covers the case where you edited the schedule,
 * left the app running, and enough real time passed that "the next 48h"
 * shifted).
 */
export function TimetableAlarmScheduler() {
  const { weeklyBlocks, overrides, forDate } = useTimetable();

  useEffect(() => {
    function pushSchedule() {
      const now = new Date();
      const entries: TimetableAlarmEntry[] = [];
      for (let dayOffset = 0; dayOffset < LOOKAHEAD_DAYS; dayOffset++) {
        const day = new Date(now);
        day.setDate(day.getDate() + dayOffset);
        for (const entry of forDate(day)) {
          if (!entry.alarmEnabled) continue;
          const atMillis = entryToAlarmMillis(day, entry);
          if (atMillis <= Date.now()) continue;
          entries.push({ id: `${entry.id}:${day.toDateString()}`, title: entry.title, atMillis });
        }
      }
      scheduleTimetableAlarms(entries);
    }

    pushSchedule();

    const onVisible = () => {
      if (document.visibilityState === "visible") pushSchedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [weeklyBlocks, overrides, forDate]);

  return null;
}
