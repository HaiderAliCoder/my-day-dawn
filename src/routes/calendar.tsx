import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useTasks } from "@/lib/store";
import { DOW_SHORT, MONTHS, monthMatrix, toISO } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Focus" },
      { name: "description", content: "Month calendar with per-day tasks." },
      { property: "og:title", content: "Calendar — Focus" },
      { property: "og:description", content: "Month calendar with per-day tasks." },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selected, setSelected] = useState<string | null>(toISO(new Date()));
  const { tasks } = useTasks();

  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const rows = monthMatrix(y, m);

  const tasksByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of tasks) if (t.dueDate) map[t.dueDate] = (map[t.dueDate] ?? 0) + 1;
    return map;
  }, [tasks]);

  const shift = (delta: number) => {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() + delta);
    setCursor(d);
  };

  const todayIso = toISO(new Date());

  return (
    <div>
      <PageHeader
        title="Calendar"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Prev month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium min-w-[9rem] text-center">
              {MONTHS[m]} {y}
            </div>
            <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="grid grid-cols-7 text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
            {DOW_SHORT.map((d) => (
              <div key={d} className="text-center py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {rows.flat().map((d, i) => {
              if (!d) return <div key={i} className="aspect-square" />;
              const iso = toISO(d);
              const count = tasksByDate[iso] ?? 0;
              const isSel = selected === iso;
              const isToday = iso === todayIso;
              return (
                <button
                  key={i}
                  onClick={() => setSelected(iso)}
                  className={cn(
                    "aspect-square rounded-md flex flex-col items-center justify-center text-sm transition-colors relative border",
                    isSel
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-transparent hover:bg-accent/50",
                    isToday && !isSel && "text-primary font-semibold",
                  )}
                >
                  <span>{d.getDate()}</span>
                  {count > 0 && (
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <DayPanel date={selected} onClose={() => setSelected(null)} />
      </div>
    </div>
  );
}

function DayPanel({ date, onClose }: { date: string | null; onClose: () => void }) {
  const { tasks, add, toggle, remove } = useTasks();
  const [title, setTitle] = useState("");

  const list = useMemo(
    () =>
      date
        ? tasks
            .filter((t) => t.dueDate === date)
            .sort((a, b) => Number(a.completed) - Number(b.completed))
        : [],
    [tasks, date],
  );

  if (!date) {
    return (
      <section className="rounded-xl border border-border bg-card p-5 h-fit">
        <p className="text-sm text-muted-foreground">Select a day to view tasks.</p>
      </section>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    add({ title: t, dueDate: date, createdIn: "calendar" });
    setTitle("");
  };

  const label = new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="rounded-xl border border-border bg-card p-5 h-fit">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Selected day
          </div>
          <div className="text-base font-medium">{label}</div>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
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
        <p className="text-sm text-muted-foreground py-4">No tasks for this day.</p>
      ) : (
        <ul className="space-y-1">
          {list.map((t) => (
            <li
              key={t.id}
              className="group flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/40"
            >
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
          ))}
        </ul>
      )}
    </section>
  );
}
