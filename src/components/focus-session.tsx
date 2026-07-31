import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Pause, Play, Square, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFocusSessions, useMotivationalVideos, type FocusSession, type Task } from "@/lib/store";
import { cn } from "@/lib/utils";

const PRESETS = [15, 25, 50];
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

function formatClock(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// --- Active-session persistence -------------------------------------------
// A running timer only lives in React state by default, which is wiped the
// instant the app process is killed (swiped away / force-closed). The
// Supabase auth session survives that because it's written to localStorage;
// we do the same thing here so a running focus session survives a full app
// kill and rehydrates with the correct remaining time on reopen, instead of
// silently vanishing and leaving an orphaned "never finished" row behind.
const ACTIVE_SESSION_KEY = "focus-session:active";

interface PersistedSession {
  sessionId: string;
  taskId: string | undefined;
  minutes: number;
  endsAt: number | null;
  pausedSecondsLeft: number | null;
}

function saveActiveSession(state: PersistedSession) {
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (e.g. private mode) — session just won't survive
    // a kill in that case, timer still works normally otherwise.
  }
}

function clearActiveSession() {
  try {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // ignore
  }
}

function loadActiveSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    if (typeof parsed.sessionId !== "string" || typeof parsed.minutes !== "number") return null;
    return {
      sessionId: parsed.sessionId,
      taskId: typeof parsed.taskId === "string" ? parsed.taskId : undefined,
      minutes: parsed.minutes,
      endsAt: typeof parsed.endsAt === "number" ? parsed.endsAt : null,
      pausedSecondsLeft: typeof parsed.pausedSecondsLeft === "number" ? parsed.pausedSecondsLeft : null,
    };
  } catch {
    return null;
  }
}

/**
 * "Start Focus Now": picks (or lets you pick) a task, plays a random
 * motivational clip as a pre-session gate if any are uploaded, then runs a
 * wall-clock-accurate countdown (immune to setInterval drift/throttling)
 * and logs the session on finish/cancel.
 */
export function FocusSessionWidget({ tasks }: { tasks: Task[] }) {
  const { sessions, start, finish, todayCompletedCount } = useFocusSessions();
  const { videos, pickRandom, getPlaybackUrl } = useMotivationalVideos();

  // Read any active session left over from before the app was closed, once,
  // on first render — this is what lets a killed-and-reopened app pick the
  // timer back up instead of losing it.
  const [restored] = useState(() => loadActiveSession());

  const [stage, setStage] = useState<"idle" | "gate" | "running">(restored ? "running" : "idle");
  const [taskId, setTaskId] = useState<string | undefined>(restored?.taskId);
  const [minutes, setMinutes] = useState(restored?.minutes ?? DEFAULT_MINUTES);
  const [customMinutes, setCustomMinutes] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(restored?.sessionId ?? null);
  const [gateUrl, setGateUrl] = useState<string | null>(null);

  // Wall-clock based countdown state. `endsAt` is the absolute timestamp the
  // session should finish at; while paused it's null and `pausedSecondsLeft`
  // holds the frozen remaining time instead. Deriving the displayed seconds
  // from `endsAt` (rather than decrementing a counter every tick) means the
  // timer self-corrects if the browser throttles background tabs and never
  // drifts from real elapsed time — including the "background tab" that
  // happens while the whole app was closed.
  const [endsAt, setEndsAt] = useState<number | null>(restored?.endsAt ?? null);
  const [pausedSecondsLeft, setPausedSecondsLeft] = useState<number | null>(
    restored?.pausedSecondsLeft ?? null,
  );
  const [tick, setTick] = useState(0);
  const finishedRef = useRef(false);

  const incomplete = tasks.filter((t) => !t.completed);

  const secondsLeft = useMemo(() => {
    if (pausedSecondsLeft !== null) return pausedSecondsLeft;
    if (endsAt === null) return 0;
    return Math.round((endsAt - Date.now()) / 1000);
    // `tick` is an intentional dependency: it exists purely to force this
    // memo to recompute every second while running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt, pausedSecondsLeft, tick]);

  const running = stage === "running" && endsAt !== null;

  // Drive the redraw every second while actively running (not paused).
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);

  // Handle natural completion once the countdown reaches zero.
  useEffect(() => {
    if (stage !== "running" || endsAt === null) return;
    if (secondsLeft > 0) {
      finishedRef.current = false;
      return;
    }
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (sessionId) finish(sessionId, true);
    notifyCompletion(`${minutes} minute session finished.`);
    setEndsAt(null);
    setPausedSecondsLeft(null);
    setStage("idle");
    setSessionId(null);
  }, [secondsLeft, stage, endsAt, sessionId, finish, minutes]);

  // Live tab-title countdown so the running timer is visible even when
  // you're glancing at another tab/window.
  useEffect(() => {
    if (stage !== "running") {
      document.title = APP_TITLE;
      return;
    }
    document.title = `${formatClock(secondsLeft)} — Focus`;
    return () => {
      document.title = APP_TITLE;
    };
  }, [stage, secondsLeft]);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Persist (or clear) the active session on every change so the app can be
  // fully killed and reopened without losing — or orphaning — the timer.
  useEffect(() => {
    if (stage === "running" && sessionId) {
      saveActiveSession({ sessionId, taskId, minutes, endsAt, pausedSecondsLeft });
    } else {
      clearActiveSession();
    }
  }, [stage, sessionId, taskId, minutes, endsAt, pausedSecondsLeft]);

  const openGate = async () => {
    const pick = pickRandom();
    if (pick) {
      const url = await getPlaybackUrl(pick.storagePath);
      setGateUrl(url);
    }
    setStage("gate");
  };

  const beginTimer = async () => {
    const session = await start(taskId, minutes);
    setSessionId(session.id);
    finishedRef.current = false;
    setPausedSecondsLeft(null);
    setEndsAt(Date.now() + minutes * 60_000);
    setStage("running");
  };

  const togglePause = () => {
    if (pausedSecondsLeft !== null) {
      // Resuming: re-anchor to a fresh end timestamp from the frozen amount.
      setEndsAt(Date.now() + pausedSecondsLeft * 1000);
      setPausedSecondsLeft(null);
    } else if (endsAt !== null) {
      setPausedSecondsLeft(Math.max(0, Math.round((endsAt - Date.now()) / 1000)));
      setEndsAt(null);
    }
  };

  const cancelSession = () => {
    if (sessionId) finish(sessionId, false);
    setEndsAt(null);
    setPausedSecondsLeft(null);
    setStage("idle");
    setSessionId(null);
  };

  const finishEarly = () => {
    if (sessionId) finish(sessionId, true);
    setEndsAt(null);
    setPausedSecondsLeft(null);
    setStage("idle");
    setSessionId(null);
  };

  const applyCustomMinutes = () => {
    const value = Math.round(Number(customMinutes));
    if (Number.isFinite(value) && value > 0 && value <= 480) {
      setMinutes(value);
      setCustomMinutes("");
    }
  };

  const todaySessions = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    return sessions
      .filter((s) => s.startedAt >= cutoff.getTime())
      .slice(0, 8);
  }, [sessions]);

  if (stage === "running") {
    const isPaused = pausedSecondsLeft !== null;
    const totalSeconds = minutes * 60;
    const progress = totalSeconds > 0 ? 1 - secondsLeft / totalSeconds : 0;
    const activeTask = tasks.find((t) => t.id === taskId);
    return (
      <section className="rounded-xl border border-primary/40 bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Focus session{isPaused ? " · paused" : ""}
          </h2>
          <button
            onClick={cancelSession}
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
          <Button variant="outline" onClick={togglePause}>
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
          <Button onClick={finishEarly}>
            <Square className="h-4 w-4 mr-1.5" />
            Done
          </Button>
        </div>
      </section>
    );
  }

  if (stage === "gate") {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Before you start
          </h2>
          <button
            onClick={() => setStage("idle")}
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
          Start {minutes}-minute session
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

      <div className="flex gap-2 mb-2">
        {PRESETS.map((d) => (
          <button
            key={d}
            onClick={() => setMinutes(d)}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
              minutes === d
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-accent/40",
            )}
          >
            {d} min
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="number"
          min={1}
          max={480}
          placeholder="Custom minutes"
          value={customMinutes}
          onChange={(e) => setCustomMinutes(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyCustomMinutes()}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <Button variant="outline" onClick={applyCustomMinutes}>
          Set
        </Button>
        {!PRESETS.includes(minutes) && (
          <span className="self-center text-xs text-primary whitespace-nowrap px-1">
            {minutes} min selected
          </span>
        )}
      </div>

      <Button onClick={videos.length > 0 ? openGate : beginTimer} className="w-full mb-4">
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
      <span className="truncate">{task ? task.title : `${session.plannedMinutes} min`}</span>
    </li>
  );
}
