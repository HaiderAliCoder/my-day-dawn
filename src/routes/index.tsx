import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Flame,
  GripVertical,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useHabits, useTasks, taskOrder, computeStreak } from "@/lib/store";
import { useDragReorder } from "@/lib/use-drag-reorder";
import {
  todayISO,
  formatLong,
  toISO,
  monthMatrix,
  MONTHS,
  DOW_SHORT,
} from "@/lib/date-utils";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — Focus" },
      { name: "description", content: "Today's tasks and habit tracker." },
      { property: "og:title", content: "Today — Focus" },
      { property: "og:description", content: "Today's tasks and habit tracker." },
    ],
  }),
  component: TodayPage,
});

function TodayPage() {
  const today = todayISO();
  const now = new Date();

  return (
    <div>
      <PageHeader title="Today" subtitle={formatLong(now)} />
      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <TodayTasks today={today} />
        <HabitTracker today={today} />
      </div>
    </div>
  );
}

function TodayTasks({ today }: { today: string }) {
  const { tasks, add, toggle, remove, reorderSubset } = useTasks();
  const [title, setTitle] = useState("");

  const todays = useMemo(
    () =>
      tasks
        .filter((t) => t.dueDate === today)
        .sort((a, b) => taskOrder(a) - taskOrder(b)),
    [tasks, today],
  );

  const { getRowProps } = useDragReorder(todays, reorderSubset);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    add({ title: t, dueDate: today, createdIn: "today" });
    setTitle("");
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
        Tasks
      </h2>
      <form onSubmit={submit} className="flex gap-2 mb-4">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task for today…"
          className="bg-background"
        />
        <Button type="submit" size="icon" aria-label="Add task">
          <Plus className="h-4 w-4" />
        </Button>
      </form>
      {todays.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Nothing planned for today.
        </p>
      ) : (
        <ul className="space-y-1">
          {todays.map((t) => {
            const rp = getRowProps(t.id);
            return (
              <li
                key={t.id}
                {...rp}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/40 transition",
                  rp["data-dragging"] && "opacity-40",
                  rp["data-over"] && "ring-1 ring-primary/60",
                )}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab active:cursor-grabbing shrink-0" />
                <Checkbox
                  checked={t.completed}
                  onCheckedChange={() => toggle(t.id)}
                  id={`t-${t.id}`}
                />
                <label
                  htmlFor={`t-${t.id}`}
                  className={
                    "flex-1 min-w-0 text-sm cursor-pointer " +
                    (t.completed ? "line-through text-muted-foreground" : "")
                  }
                >
                  {t.title}
                </label>
                <button
                  onClick={() => remove(t.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                  aria-label="Delete task"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function HabitTracker({ today }: { today: string }) {
  const { habits, add, toggleDate, remove } = useHabits();
  const [name, setName] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cursors, setCursors] = useState<Record<string, Date>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    add(n);
    setName("");
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const monthStart = () => {
    const d = new Date();
    d.setDate(1);
    return d;
  };

  const shiftMonth = (id: string, delta: number) => {
    setCursors((prev) => {
      const base = prev[id] ?? monthStart();
      const d = new Date(base);
      d.setMonth(d.getMonth() + delta);
      return { ...prev, [id]: d };
    });
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
        Habits
      </h2>
      <form onSubmit={submit} className="flex gap-2 mb-4">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New habit…"
          className="bg-background"
        />
        <Button type="submit" size="icon" aria-label="Add habit">
          <Plus className="h-4 w-4" />
        </Button>
      </form>
      {habits.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Add a daily habit to track.
        </p>
      ) : (
        <ul className="space-y-1">
          {habits.map((h) => {
            const done = h.history.includes(today);
            const streak = computeStreak(h.history, today);
            const isExpanded = expanded.has(h.id);
            const cursor = cursors[h.id] ?? monthStart();
            const y = cursor.getFullYear();
            const m = cursor.getMonth();
            const rows = monthMatrix(y, m);

            return (
              <li key={h.id} className="rounded-md hover:bg-accent/40">
                <div className="group flex items-center gap-3 px-2 py-2">
                  <Checkbox
                    checked={done}
                    onCheckedChange={() => toggleDate(h.id, today)}
                    id={`h-${h.id}`}
                  />
                  <label
                    htmlFor={`h-${h.id}`}
                    className={
                      "flex-1 min-w-0 text-sm cursor-pointer truncate " +
                      (done ? "text-muted-foreground" : "")
                    }
                  >
                    {h.name}
                  </label>
                  <span
                    className={
                      "flex items-center gap-1 text-xs shrink-0 " +
                      (streak > 0 ? "text-primary" : "text-muted-foreground")
                    }
                    title={`${streak}-day streak`}
                  >
                    <Flame className="h-3 w-3" />
                    {streak}
                  </span>
                  <button
                    onClick={() => toggleExpand(h.id)}
                    className={cn(
                      "text-muted-foreground hover:text-foreground transition shrink-0",
                      isExpanded && "text-primary",
                    )}
                    aria-label="Toggle calendar"
                    aria-expanded={isExpanded}
                  >
                    <CalendarDays className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(h.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition shrink-0"
                    aria-label="Remove habit"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 pt-1">
                    <div className="flex items-center justify-between mb-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => shiftMonth(h.id, -1)}
                        aria-label="Previous month"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <div className="text-xs font-medium">
                        {MONTHS[m]} {y}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => shiftMonth(h.id, 1)}
                        aria-label="Next month"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-7 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      {DOW_SHORT.map((d) => (
                        <div key={d} className="text-center py-0.5">
                          {d[0]}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {rows.flat().map((d, i) => {
                        if (!d)
                          return <div key={i} className="aspect-square" />;
                        const iso = toISO(d);
                        const marked = h.history.includes(iso);
                        const isToday = iso === today;
                        return (
                          <button
                            key={i}
                            onClick={() => toggleDate(h.id, iso)}
                            className={cn(
                              "aspect-square rounded-md text-[11px] flex items-center justify-center border transition-colors",
                              marked
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-transparent hover:bg-accent/60",
                              isToday && !marked && "ring-1 ring-primary/50",
                            )}
                            aria-label={`${iso}${marked ? " (done)" : ""}`}
                          >
                            {d.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
