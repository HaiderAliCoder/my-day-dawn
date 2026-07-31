import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  Check,
  Flame,
  GripVertical,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FocusSessionWidget } from "@/components/focus-session";
import { useHabits, useTasks, taskOrder, computeStreak } from "@/lib/store";
import { useDragReorder } from "@/lib/use-drag-reorder";
import { todayISO, formatLong, toISO, monthMatrix, MONTHS, DOW_SHORT } from "@/lib/date-utils";
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
      <div className="mb-6">
        <TodayFocus />
      </div>
      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <TodayTasks today={today} />
        <HabitTracker today={today} />
      </div>
    </div>
  );
}

function TodayFocus() {
  const { tasks } = useTasks();
  return <FocusSessionWidget tasks={tasks} />;
}

function TodayTasks({ today }: { today: string }) {
  const { tasks, add, toggle, remove, update, reorderSubset } = useTasks();
  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const todays = useMemo(
    () => tasks.filter((t) => t.dueDate === today).sort((a, b) => taskOrder(a) - taskOrder(b)),
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

  const startEdit = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditValue(currentTitle);
  };

  const saveEdit = () => {
    const t = editValue.trim();
    if (editingId && t) update(editingId, { title: t });
    setEditingId(null);
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
        <p className="text-sm text-muted-foreground py-8 text-center">Nothing planned for today.</p>
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
                {editingId === t.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1 h-8 bg-background"
                    />
                    <button
                      onClick={saveEdit}
                      className="text-muted-foreground hover:text-primary transition shrink-0"
                      aria-label="Save"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-muted-foreground hover:text-foreground transition shrink-0"
                      aria-label="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
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
                      onClick={() => startEdit(t.id, t.title)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition shrink-0"
                      aria-label="Edit task"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(t.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition shrink-0"
                      aria-label="Delete task"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function HabitTracker({ today }: { today: string }) {
  const { habits, add, toggleDate, remove, rename, addItem, removeItem, renameItem, toggleItemDate } =
    useHabits();
  const [name, setName] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [itemsOpen, setItemsOpen] = useState<Set<string>>(new Set());
  const [newItemLabel, setNewItemLabel] = useState<Record<string, string>>({});
  const [cursors, setCursors] = useState<Record<string, Date>>({});
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [editingHabitValue, setEditingHabitValue] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemValue, setEditingItemValue] = useState("");

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

  const toggleItemsOpen = (id: string) => {
    setItemsOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitNewItem = (habitId: string) => {
    const label = (newItemLabel[habitId] ?? "").trim();
    if (!label) return;
    addItem(habitId, label);
    setNewItemLabel((prev) => ({ ...prev, [habitId]: "" }));
  };

  const startEditHabit = (id: string, currentName: string) => {
    setEditingHabitId(id);
    setEditingHabitValue(currentName);
  };

  const saveEditHabit = () => {
    const n = editingHabitValue.trim();
    if (editingHabitId && n) rename(editingHabitId, n);
    setEditingHabitId(null);
  };

  const startEditItem = (id: string, currentLabel: string) => {
    setEditingItemId(id);
    setEditingItemValue(currentLabel);
  };

  const saveEditItem = () => {
    const l = editingItemValue.trim();
    if (editingItemId && l) renameItem(editingItemId, l);
    setEditingItemId(null);
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
            const isItemsOpen = itemsOpen.has(h.id);
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
                  {editingHabitId === h.id ? (
                    <>
                      <Input
                        autoFocus
                        value={editingHabitValue}
                        onChange={(e) => setEditingHabitValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEditHabit();
                          if (e.key === "Escape") setEditingHabitId(null);
                        }}
                        className="flex-1 h-8 bg-background"
                      />
                      <button
                        onClick={saveEditHabit}
                        className="text-muted-foreground hover:text-primary transition shrink-0"
                        aria-label="Save"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditingHabitId(null)}
                        className="text-muted-foreground hover:text-foreground transition shrink-0"
                        aria-label="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
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
                        onClick={() => toggleItemsOpen(h.id)}
                        className={cn(
                          "text-muted-foreground hover:text-foreground transition shrink-0",
                          isItemsOpen && "text-primary",
                        )}
                        aria-label="Toggle checklist"
                        aria-expanded={isItemsOpen}
                        title="Sub-items checklist"
                      >
                        <ListChecks className="h-4 w-4" />
                      </button>
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
                        onClick={() => startEditHabit(h.id, h.name)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition shrink-0"
                        aria-label="Edit habit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(h.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition shrink-0"
                        aria-label="Remove habit"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>

                {isItemsOpen && (
                  <div className="px-3 pb-3 pt-1 space-y-1">
                    {h.items.length === 0 && (
                      <p className="text-xs text-muted-foreground pb-1">
                        No sub-items yet — e.g. add each individual prayer here.
                      </p>
                    )}
                    <ul className="space-y-0.5">
                      {h.items.map((item) => {
                        const itemDone = (h.itemHistory[item.id] ?? []).includes(today);
                        return (
                          <li
                            key={item.id}
                            className="group/item flex items-center gap-2 px-1 py-1 rounded hover:bg-accent/30"
                          >
                            <Checkbox
                              checked={itemDone}
                              onCheckedChange={() => toggleItemDate(h.id, item.id, today)}
                              id={`hi-${item.id}`}
                            />
                            {editingItemId === item.id ? (
                              <>
                                <Input
                                  autoFocus
                                  value={editingItemValue}
                                  onChange={(e) => setEditingItemValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveEditItem();
                                    if (e.key === "Escape") setEditingItemId(null);
                                  }}
                                  className="flex-1 h-6 text-xs bg-background"
                                />
                                <button
                                  onClick={saveEditItem}
                                  className="text-muted-foreground hover:text-primary transition shrink-0"
                                  aria-label="Save"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingItemId(null)}
                                  className="text-muted-foreground hover:text-foreground transition shrink-0"
                                  aria-label="Cancel"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <label
                                  htmlFor={`hi-${item.id}`}
                                  className={cn(
                                    "flex-1 min-w-0 text-xs cursor-pointer truncate",
                                    itemDone && "text-muted-foreground line-through",
                                  )}
                                >
                                  {item.label}
                                </label>
                                <button
                                  onClick={() => startEditItem(item.id, item.label)}
                                  className="opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-foreground transition shrink-0"
                                  aria-label="Edit item"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => removeItem(item.id)}
                                  className="opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-destructive transition shrink-0"
                                  aria-label="Remove item"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        submitNewItem(h.id);
                      }}
                      className="flex gap-1.5 pt-1"
                    >
                      <Input
                        value={newItemLabel[h.id] ?? ""}
                        onChange={(e) =>
                          setNewItemLabel((prev) => ({ ...prev, [h.id]: e.target.value }))
                        }
                        placeholder="Add sub-item…"
                        className="h-7 text-xs bg-background"
                      />
                      <Button
                        type="submit"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Add sub-item"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  </div>
                )}

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
                        if (!d) return <div key={i} className="aspect-square" />;
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
