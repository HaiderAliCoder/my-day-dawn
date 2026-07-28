import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Trash2, Flame, GripVertical } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useHabits, useTasks, taskOrder } from "@/lib/store";
import { useDragReorder } from "@/lib/use-drag-reorder";
import { todayISO, formatLong } from "@/lib/date-utils";
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
  const { habits, add, toggleToday, remove } = useHabits();
  const [name, setName] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    add(n);
    setName("");
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
            const done = h.lastCompleted === today;
            const yest = new Date(today);
            yest.setDate(yest.getDate() - 1);
            const y = yest.toISOString().slice(0, 10);
            const streak =
              h.lastCompleted === today || h.lastCompleted === y ? h.streak : 0;
            return (
              <li
                key={h.id}
                className="group flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/40"
              >
                <Checkbox
                  checked={done}
                  onCheckedChange={() => toggleToday(h.id, today)}
                  id={`h-${h.id}`}
                />
                <label
                  htmlFor={`h-${h.id}`}
                  className={
                    "flex-1 min-w-0 text-sm cursor-pointer " +
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
                  onClick={() => remove(h.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                  aria-label="Remove habit"
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
