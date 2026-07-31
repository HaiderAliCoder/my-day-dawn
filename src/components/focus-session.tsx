import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Pause, Play, Square, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFocusSessions, useMotivationalVideos, type FocusSession, type Task } from "@/lib/store";
import { cn } from "@/lib/utils";

const PRESET_MINUTES = [15, 25, 50];
const DEFAULT_MINUTES = 25;
const APP_TITLE = "My Day Dawn";

/** Short beep via Web Audio — no external asset, works offline. */
function playCompletionSound() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    };
    playTone(880, 0, 0.15);
    playTone(1175, 0.18, 0.25);
  } catch {
    // Audio not available (e.g. no user gesture yet) — fail silently.
  }
}

function notifyCompletion(label: string) {
  playCompletionSound();
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification("Focus session complete", { body: label, tag: "focus-session" });
    } catch {
      // Notifications can be unavailable in some WebView contexts — ignore.
    }
  }
}

function requestNotificationPermission() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Compact "1h 5m", "25 min", "45s" style label for buttons/history rows. */
function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (sec > 0 && h === 0) parts.push(`${sec}s`);
  return parts.length > 0 ? parts.join(" ") : "0s";
}

/** The exact planned duration for a session, in seconds — falls back to the
 * legacy whole-minutes field for sessions created before seconds-precision
 * existed. */
function sessionPlannedSeconds(session: FocusSession) {
  return session.plannedSeconds ?? session.plannedMinutes * 60;
}

/**
 * "Start Focus Now": picks (or lets you pick) a task, plays a random
 * motivational clip as a pre-session gate if any are uploaded, then runs a
 * wall-clock-accurate countdown and logs the session on finish/cancel.
 *
 * The running/paused state itself is NOT local — it's derived entirely from
 * `activeSession`, which comes from the database and is kept in sync across
 * every device in real time. That's deliberate: a running session has to be
 * a single, server-side fact everyone agrees on, otherwise two devices can
 * each start their own independent timer with no idea the other exists.
 */
export function FocusSessionWidget({ tasks }: { tasks: Task[] }) {
  const { sessions, activeSession, start, pause, resume, finish, todayCompletedCount } =
    useFocusSessions();
  const { videos, pickRandom, getPlaybackUrl } = useMotivationalVideos();

  const [localStage, setLocalStage] = useState<"idle" | "gate">("idle");
  const [taskId, setTaskId] = useState<string | undefined>(undefined);
  const [hours, setHours] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_MINUTES);
  const [seconds, setSeconds] = useState(0);
  const [gateUrl, setGateUrl] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const finishedRef = useRef<string | null>(null);

  const incomplete = tasks.filter((t) => !t.completed);
  const totalSeconds = hours * 3600 + durationMinutes * 60 + seconds;

  const secondsLeft = useMemo(() => {
    if (!activeSession) return 0;
    const planned = sessionPlannedSeconds(activeSession);
    if (activeSession.pausedAt) {
      return planned - Math.floor((activeSession.pausedAt - activeSession.startedAt) / 1000);
    }
    const endsAt = activeSession.startedAt + planned * 1000;
    return Math.round((endsAt - Date.now()) / 1000);
    // `tick` is an intentional dependency: it exists purely to force this to
    // recompute every second while running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession, tick]);

  const isPaused = !!activeSession?.pausedAt;
  const isRunning = !!activeSession && !isPaused;

  // Drive the redraw every second while actively counting down.
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  // Handle natural completion once the countdown reaches zero. Guarded by
  // session id so this can't double-fire, and safe if another device
  // happens to finish it first (finish() just overwrites the same fields).
  useEffect(() => {
    if (!activeSession || isPaused) return;
    if (secondsLeft > 0) return;
    if (finishedRef.current === activeSession.id) return;
    finishedRef.current = activeSession.id;
    finish(activeSession.id, true);
    notifyCompletion(`${formatDuration(sessionPlannedSeconds(activeSession))} session finished.`);
  }, [activeSession, isPaused, secondsLeft, finish]);

  // Live tab-title countdown so the running timer is visible even when
  // you're glancing at another tab/window.
  useEffect(() => {
    if (!activeSession) {
      document.title = APP_TITLE;
      return;
    }
    document.title = `${formatClock(secondsLeft)}${isPaused ? " (paused)" : ""} — Focus`;
    return () => {
      document.title = APP_TITLE;
    };
  }, [activeSession, secondsLeft, isPaused]);

  const openGate = async () => {
    requestNotificationPermission();
    const pick = pickRandom();
    if (pick) {
      const url = await getPlaybackUrl(pick.storagePath);
      setGateUrl(url);
    }
    setLocalStage("gate");
  };

  const beginTimer = async () => {
    requestNotificationPermission();
    if (totalSeconds <= 0) return;
    finishedRef.current = null;
    await start(taskId, totalSeconds);
    setLocalStage("idle");
  };

  const applyPreset = (mins: number) => {
    setHours(0);
    setDurationMinutes(mins);
    setSeconds(0);
  };

  const todaySessions = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    return sessions.filter((s) => s.startedAt >= cutoff.getTime()).slice(0, 8);
  }, [sessions]);

  if (activeSession) {
    const planned = sessionPlannedSeconds(activeSession);
    const progress = planned > 0 ? 1 - secondsLeft / planned : 0;
    const activeTask = tasks.find((t) => t.id === activeSession.taskId);
    return (
      <section className="rounded-xl border border-primary/40 bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Focus session{isPaused ? " · paused" : ""}
          </h2>
          <button
            onClick={() => finish(activeSession.id, false)}
            className="text-muted-foreground hover:text-destructive transition"
            aria-label="Cancel session"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {activeTask && (
          <p className="text-sm text-muted-foreground mb-2 truncate">{activeTask.title}</p>
        )}
        <div className="font-mono text-5xl tabular-nums tracking-tight mb-3">
          {formatClock(secondsLeft)}
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-4">
          <div
            className="h-full bg-primary transition-all duration-1000 ease-linear"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => (isPaused ? resume(activeSession.id) : pause(activeSession.id))}
          >
            {isPaused ? (
              <>
                <Play className="h-4 w-4 mr-1.5" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-4 w-4 mr-1.5" />
                Pause
              </>
            )}
          </Button>
          <Button
            onClick={() => {
              finish(activeSession.id, true);
              notifyCompletion(`${formatDuration(planned)} session finished.`);
            }}
          >
            <Square className="h-4 w-4 mr-1.5" />
            Done
          </Button>
        </div>
      </section>
    );
  }

  if (localStage === "gate") {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Before you start
          </h2>
          <button
            onClick={() => setLocalStage("idle")}
            className="text-muted-foreground hover:text-foreground transition"
            aria-label="Skip"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {gateUrl ? (
          <video src={gateUrl} controls autoPlay className="w-full rounded-md mb-4 max-h-64" />
        ) : (
          <p className="text-sm text-muted-foreground mb-4">
            No clip could be loaded — you can still start.
          </p>
        )}
        <Button onClick={beginTimer} className="w-full">
          Start {formatDuration(totalSeconds)} session
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Focus session
        </h2>
        {todayCompletedCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-primary">
            <Timer className="h-3 w-3" />
            {todayCompletedCount} today
          </span>
        )}
      </div>

      {incomplete.length > 0 && (
        <select
          value={taskId ?? ""}
          onChange={(e) => setTaskId(e.target.value || undefined)}
          className="w-full mb-3 rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">No specific task</option>
          {incomplete.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      )}

      <div className="flex gap-2 mb-3">
        {PRESET_MINUTES.map((d) => (
          <button
            key={d}
            onClick={() => applyPreset(d)}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
              hours === 0 && durationMinutes === d && seconds === 0
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-accent/40",
            )}
          >
            {d} min
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mb-1.5">Custom duration</p>
      <div className="flex items-center gap-2 mb-4">
        <DurationField label="h" value={hours} max={23} onChange={setHours} />
        <DurationField label="m" value={durationMinutes} max={59} onChange={setDurationMinutes} />
        <DurationField label="s" value={seconds} max={59} onChange={setSeconds} />
        <span className="ml-auto text-sm text-muted-foreground whitespace-nowrap">
          = {formatDuration(totalSeconds)}
        </span>
      </div>

      <Button
        onClick={videos.length > 0 ? openGate : beginTimer}
        disabled={totalSeconds <= 0}
        className="w-full mb-4"
      >
        <Play className="h-4 w-4 mr-1.5" />
        Start focus session
      </Button>

      {todaySessions.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Today
          </p>
          <ul className="space-y-1.5">
            {todaySessions.map((s) => (
              <TodaySessionRow key={s.id} session={s} tasks={tasks} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DurationField({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(0, n)));
        }}
        className="w-14 rounded-md border border-border bg-background px-2 py-2 text-sm text-center"
      />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function TodaySessionRow({ session, tasks }: { session: FocusSession; tasks: Task[] }) {
  const task = tasks.find((t) => t.id === session.taskId);
  const time = new Date(session.startedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <li className="flex items-center gap-2 text-sm">
      {session.completed ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
      ) : (
        <X className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      )}
      <span className="text-muted-foreground shrink-0">{time}</span>
      <span className="truncate">
        {task ? task.title : formatDuration(sessionPlannedSeconds(session))}
      </span>
    </li>
  );
}
