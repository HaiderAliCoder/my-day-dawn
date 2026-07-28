import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { GripVertical, Search, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { taskOrder, useTasks, type Task, type TaskSource } from "@/lib/store";
import { useDragReorder } from "@/lib/use-drag-reorder";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — Focus" },
      { name: "description", content: "Master list of all your tasks." },
      { property: "og:title", content: "Tasks — Focus" },
      { property: "og:description", content: "Master list of all your tasks." },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const { tasks, toggle, update, remove, reorderSubset } = useTasks();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "done">("all");
  const [source, setSource] = useState<"all" | TaskSource>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) => {
        if (status === "open" && t.completed) return false;
        if (status === "done" && !t.completed) return false;
        if (source !== "all" && t.createdIn !== source) return false;
        if (from && (!t.dueDate || t.dueDate < from)) return false;
        if (to && (!t.dueDate || t.dueDate > to)) return false;
        if (q) {
          const hay = `${t.title} ${t.description ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => taskOrder(a) - taskOrder(b));
  }, [tasks, query, status, source, from, to]);

  const { getRowProps } = useDragReorder(filtered, reorderSubset);

  const hasFilters = query || status !== "all" || source !== "all" || from || to;
  const clear = () => {
    setQuery(""); setStatus("all"); setSource("all"); setFrom(""); setTo("");
  };

  return (
    <div>
      <PageHeader title="Tasks" subtitle="All tasks across the app" />

      <div className="rounded-xl border border-border bg-card p-4 mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks by title or description…"
            className="pl-9 bg-background"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-[140px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Incomplete</SelectItem>
              <SelectItem value="done">Complete</SelectItem>
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
            <SelectTrigger className="w-[160px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="daily">Daily planner</SelectItem>
              <SelectItem value="monthly">Monthly planner</SelectItem>
              <SelectItem value="yearly">Yearly planner</SelectItem>
              <SelectItem value="calendar">Calendar</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Due</span>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-[160px] bg-background"
              aria-label="From date"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-[160px] bg-background"
              aria-label="To date"
            />
          </div>
          {hasFilters && (
            <button
              onClick={clear}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
          <div className="ml-auto text-xs text-muted-foreground self-center">
            {filtered.length} of {tasks.length}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No tasks match these filters.
        </div>
      ) : (
        <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {filtered.map((t) => {
            const rp = getRowProps(t.id);
            return (
              <TaskRow
                key={t.id}
                task={t}
                rowProps={rp}
                onToggle={() => toggle(t.id)}
                onRemove={() => remove(t.id)}
                onUpdate={(patch) => update(t.id, patch)}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TaskRow({
  task,
  rowProps,
  onToggle,
  onRemove,
  onUpdate,
}: {
  task: Task;
  rowProps: ReturnType<ReturnType<typeof useDragReorder<Task>>["getRowProps"]>;
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

  return (
    <li
      {...rowProps}
      className={cn(
        "p-3 md:p-4 transition",
        rowProps["data-dragging"] && "opacity-40",
        rowProps["data-over"] && "bg-primary/5",
      )}
    >
      <div className="flex items-start gap-3">
        <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab active:cursor-grabbing mt-1 shrink-0" />
        <Checkbox checked={task.completed} onCheckedChange={onToggle} className="mt-1" />
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-background" />
              <Input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Description (optional)"
                className="bg-background"
              />
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className="bg-background w-[180px]"
                />
                <button
                  className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground"
                  onClick={save}
                >
                  Save
                </button>
                <button
                  className="text-xs px-3 py-1.5 rounded-md hover:bg-accent"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="text-left w-full" onClick={() => setEditing(true)}>
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
              <div className="text-[11px] text-muted-foreground mt-1 flex gap-3">
                {task.dueDate && <span>Due {task.dueDate}</span>}
                <span className="capitalize">from {task.createdIn}</span>
              </div>
            </button>
          )}
        </div>
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Delete task"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
