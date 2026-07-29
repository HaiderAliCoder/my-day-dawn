import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFocusSessions, useMotivationalVideos, type Task } from "@/lib/store";
import { cn } from "@/lib/utils";

const DURATIONS = [25, 50];

/**
 * "Start Focus Now": picks (or lets you pick) a task, plays a random
 * motivational clip as a pre-session gate if any are uploaded, then runs a
 * simple countdown timer and logs the session on finish/cancel.
 */
export function FocusSessionWidget({ tasks }: { tasks: Task[] }) {
  const { start, finish, todayCompletedCount } = useFocusSessions();
  const { videos, pickRandom, getPlaybackUrl } = useMotivationalVideos();

  const [stage, setStage] = useState<"idle" | "gate" | "running">("idle");
  const [taskId, setTaskId] = useState<string | undefined>(undefined);
  const [minutes, setMinutes] = useState(25);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const [gateUrl, setGateUrl] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const incomplete = tasks.filter((t) => !t.completed);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current!);
          setRunning(false);
          if (sessionId) finish(sessionId, true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

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
    setSecondsLeft(minutes * 60);
    setRunning(true);
    setStage("running");
  };

  const cancelSession = () => {
    if (sessionId) finish(sessionId, false);
    setRunning(false);
    setStage("idle");
    setSessionId(null);
  };

  const finishEarly = () => {
    if (sessionId) finish(sessionId, true);
    setRunning(false);
    setStage("idle");
    setSessionId(null);
  };

  if (stage === "running") {
    const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
    const ss = String(secondsLeft % 60).padStart(2, "0");
    const activeTask = tasks.find((t) => t.id === taskId);
    return (
      <section className="rounded-xl border border-primary/40 bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Focus session
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
        <div className="font-mono text-5xl tabular-nums tracking-tight mb-4">
          {mm}:{ss}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setRunning((r) => !r)}>
            {running ? (
              <>
                <Pause className="h-4 w-4 mr-1.5" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1.5" />
                Resume
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

      <div className="flex gap-2 mb-4">
        {DURATIONS.map((d) => (
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

      <Button onClick={videos.length > 0 ? openGate : beginTimer} className="w-full">
        <Play className="h-4 w-4 mr-1.5" />
        Start focus session
      </Button>
    </section>
  );
}
