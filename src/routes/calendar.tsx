import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { taskOrder, useTasks, type Task } from "@/lib/store";
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
  const [selected, setSelected] = useState<string | null>(null);
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
            const isToday = iso === todayIso;
            return (
              <button
                key={i}
                onClick={() => setSelected(iso)}
                className={cn(
                  "aspect-square rounded-md flex flex-col items-center justify-center text-sm transition-colors relative border hover:bg-accent/50",
                  "border-transparent",
                  isToday && "text-primary font-semibold ring-1 ring-primary/40",
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

      <DaySheet date={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function DaySheet({ date, onClose }: { date: string | null; onClose: () => void }) {
  const { tasks, add, toggle, remove, update } = useTasks();
  const [title, setTitle] = useState("");

  const list = useMemo(
    () =>
      date
        ? tasks
            .filter((t) => t.dueDate === date)
            .sort((a, b) => taskOrder(a) - taskOrder(b))
        : [],
    [tasks, date],
  );

  if (!date) return null;

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
    year: "numeric",
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-5 border-b border-border">
          <SheetTitle className="text-base font-medium">{label}</SheetTitle>
          <p className="text-xs text-muted-foreground">
            {list.length} {list.length === 1 ? "task" : "tasks"}
          </p>
        </SheetHeader>
        <div className="p-5 border-b border-border">
          <form onSubmit={submit} className="flex gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add task for this day…"
              className="bg-background"
              autoFocus
            />
            <Button type="submit" size="icon" aria-label="Add task">
              <Plus className="h-4 w-4" />
            </Button>
          </form>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No tasks for this day.
            </p>
          ) : (
            <ul className="space-y-1">
              {list.map((t) => (
                <DaySheetItem
                  key={t.id}
                  task={t}
                  onToggle={() => toggle(t.id)}
                  onRemove={() => remove(t.id)}
                  onUpdate={(patch) => update(t.id, patch)}
                />
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DaySheetItem({
  task,
  onToggle,
  onRemove,
  onUpdate,
}: {
  task: Task;
  onToggle: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<Task>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description ?? "");
  const [due, setDue] = useState(task.dueDate ?? "");

  const save = () => {
    onUpdate({
      title: title.trim() || task.title,
      description: desc.trim() || undefined,
      dueDate: due || undefined,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="rounded-md border border-border bg-background p-3 space-y-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <Input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Description"
        />
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="w-[180px]"
            aria-label="Reschedule to"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            Save
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-3 rounded-md px-2 py-2 hover:bg-accent/40">
      <Checkbox
        checked={task.completed}
        onCheckedChange={onToggle}
        className="mt-1"
      />
      <div className="flex-1 min-w-0">
        <div
          className={
            "text-sm " +
            (task.completed ? "line-through text-muted-foreground" : "")
          }
        >
          {task.title}
        </div>
        {task.description && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {task.description}
          </div>
        )}
      </div>
      <button
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
        aria-label="Edit"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
        aria-label="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

// Silence unused import warning when strict — X icon reserved for close.
void X;
