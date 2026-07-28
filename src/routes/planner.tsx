import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { taskOrder, usePlannerNotes, useTasks, type TaskSource } from "@/lib/store";
import { useDragReorder } from "@/lib/use-drag-reorder";
import {
  MONTHS,
  monthKey,
  monthMatrix,
  parseISO,
  toISO,
  yearKey,
  formatLong,
} from "@/lib/date-utils";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/planner")({
  head: () => ({
    meta: [
      { title: "Planner — Focus" },
      { name: "description", content: "Daily, monthly, and yearly planner." },
      { property: "og:title", content: "Planner — Focus" },
      { property: "og:description", content: "Daily, monthly, and yearly planner." },
    ],
  }),
  component: PlannerPage,
});

function PlannerPage() {
  return (
    <div>
      <PageHeader title="Planner" subtitle="Plan by day, month, or year" />
      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="yearly">Yearly</TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="mt-6">
          <DailyView />
        </TabsContent>
        <TabsContent value="monthly" className="mt-6">
          <MonthlyView />
        </TabsContent>
        <TabsContent value="yearly" className="mt-6">
          <YearlyView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StepDate({
  date,
  onChange,
  step,
  label,
}: {
  date: Date;
  onChange: (d: Date) => void;
  step: "day" | "month" | "year";
  label: string;
}) {
  const nudge = (dir: -1 | 1) => {
    const d = new Date(date);
    if (step === "day") d.setDate(d.getDate() + dir);
    else if (step === "month") d.setMonth(d.getMonth() + dir);
    else d.setFullYear(d.getFullYear() + dir);
    onChange(d);
  };
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={() => nudge(-1)} aria-label="Previous">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="text-sm font-medium min-w-[10rem] text-center">{label}</div>
      <Button variant="ghost" size="icon" onClick={() => nudge(1)} aria-label="Next">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function DailyView() {
  const [date, setDate] = useState(new Date());
  const iso = toISO(date);
  const { notes, setDaily } = usePlannerNotes();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <StepDate date={date} onChange={setDate} step="day" label={formatLong(date)} />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Notes
          </h3>
          <Textarea
            value={notes.daily[iso] ?? ""}
            onChange={(e) => setDaily(iso, e.target.value)}
            placeholder="Notes for the day…"
            className="min-h-[240px] bg-background"
          />
        </section>
        <DayTaskList date={iso} source="daily" />
      </div>
    </div>
  );
}

function DayTaskList({ date, source }: { date: string; source: TaskSource }) {
  const { tasks, add, toggle, remove, reorderSubset } = useTasks();
  const [title, setTitle] = useState("");
  const list = useMemo(
    () =>
      tasks
        .filter((t) => t.dueDate === date)
        .sort((a, b) => taskOrder(a) - taskOrder(b)),
    [tasks, date],
  );
  const { getRowProps } = useDragReorder(list, reorderSubset);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    add({ title: t, dueDate: date, createdIn: source });
    setTitle("");
  };
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Tasks
      </h3>
      <form onSubmit={submit} className="flex gap-2 mb-4">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add task…"
          className="bg-background"
        />
        <Button type="submit" size="icon" aria-label="Add task">
          <Plus className="h-4 w-4" />
        </Button>
      </form>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No tasks yet.</p>
      ) : (
        <ul className="space-y-1">
          {list.map((t) => {
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
                <Checkbox checked={t.completed} onCheckedChange={() => toggle(t.id)} />
                <span
                  className={
                    "flex-1 min-w-0 text-sm " +
                    (t.completed ? "line-through text-muted-foreground" : "")
                  }
                >
                  {t.title}
                </span>
                <button
                  onClick={() => remove(t.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  aria-label="Delete"
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

function MonthlyView() {
  const [date, setDate] = useState(new Date());
  const y = date.getFullYear();
  const m = date.getMonth();
  const key = monthKey(date);
  const { notes, setMonthly } = usePlannerNotes();
  const { tasks } = useTasks();

  const perDay = useMemo(() => {
    const map: Record<string, { done: number; pending: number }> = {};
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const d = parseISO(t.dueDate);
      if (d.getFullYear() !== y || d.getMonth() !== m) continue;
      map[t.dueDate] ||= { done: 0, pending: 0 };
      if (t.completed) map[t.dueDate].done++;
      else map[t.dueDate].pending++;
    }
    return map;
  }, [tasks, y, m]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <StepDate
          date={date}
          onChange={setDate}
          step="month"
          label={`${MONTHS[m]} ${y}`}
        />
      </div>
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Monthly goals
        </h3>
        <Textarea
          value={notes.monthly[key] ?? ""}
          onChange={(e) => setMonthly(key, e.target.value)}
          placeholder="What do you want to accomplish this month?"
          className="min-h-[120px] bg-background"
        />
      </section>
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Days
        </h3>
        <ul className="divide-y divide-border">
          {Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => {
            const d = new Date(y, m, i + 1);
            const iso = toISO(d);
            const stats = perDay[iso];
            return (
              <li key={iso} className="flex items-center justify-between py-2">
                <span className="text-sm">
                  {d.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {stats
                    ? `${stats.done} done · ${stats.pending} pending`
                    : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function YearlyView() {
  const [date, setDate] = useState(new Date());
  const y = date.getFullYear();
  const key = yearKey(date);
  const { notes, setYearly } = usePlannerNotes();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <StepDate date={date} onChange={setDate} step="year" label={`${y}`} />
      </div>
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Yearly goals
        </h3>
        <Textarea
          value={notes.yearly[key] ?? ""}
          onChange={(e) => setYearly(key, e.target.value)}
          placeholder="Big-picture goals for the year…"
          className="min-h-[140px] bg-background"
        />
      </section>
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {MONTHS.map((name, mi) => (
          <MiniMonth key={mi} year={y} month={mi} label={name} />
        ))}
      </section>
    </div>
  );
}

function MiniMonth({ year, month, label }: { year: number; month: number; label: string }) {
  const rows = monthMatrix(year, month);
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs font-medium mb-2">{label}</div>
      <div className="grid grid-cols-7 gap-0.5 text-[10px] text-muted-foreground">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center">
            {d}
          </div>
        ))}
        {rows.flat().map((d, i) => (
          <div
            key={i}
            className="aspect-square flex items-center justify-center text-[10px] text-foreground/80"
          >
            {d ? d.getDate() : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
