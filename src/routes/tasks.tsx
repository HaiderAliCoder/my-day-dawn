import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
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
import { useTasks, type Task, type TaskSource } from "@/lib/store";

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
  const { tasks, toggle, update, remove } = useTasks();
  const [status, setStatus] = useState<"all" | "open" | "done">("all");
  const [source, setSource] = useState<"all" | TaskSource>("all");
  const [dueFilter, setDueFilter] = useState<string>("");

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => {
        if (status === "open" && t.completed) return false;
        if (status === "done" && !t.completed) return false;
        if (source !== "all" && t.createdIn !== source) return false;
        if (dueFilter && t.dueDate !== dueFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
        const ad = a.dueDate ?? "9999";
        const bd = b.dueDate ?? "9999";
        if (ad !== bd) return ad.localeCompare(bd);
        return b.createdAt - a.createdAt;
      });
  }, [tasks, status, source, dueFilter]);

  return (
    <div>
      <PageHeader title="Tasks" subtitle="All tasks across the app" />
      <div className="flex flex-wrap gap-3 mb-6">
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-[140px] bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Incomplete</SelectItem>
            <SelectItem value="done">Complete</SelectItem>
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
          <SelectTrigger className="w-[160px] bg-card">
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
        <Input
          type="date"
          value={dueFilter}
          onChange={(e) => setDueFilter(e.target.value)}
          className="w-[180px] bg-card"
        />
        {dueFilter && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setDueFilter("")}
          >
            Clear date
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No tasks match these filters.
        </div>
      ) : (
        <ul className="rounded-xl border border-border bg-card divide-y divide-border">
          {filtered.map((t) => (
            <TaskRow
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
  );
}

function TaskRow({
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

  return (
    <li className="p-3 md:p-4">
      <div className="flex items-start gap-3">
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
