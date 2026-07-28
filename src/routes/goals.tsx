import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useGoals, type Goal } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/goals")({
  head: () => ({
    meta: [
      { title: "Long-Term Goals — Focus" },
      { name: "description", content: "Track 5, 10, and 50-year goals." },
      { property: "og:title", content: "Long-Term Goals — Focus" },
      { property: "og:description", content: "Track 5, 10, and 50-year goals." },
    ],
  }),
  component: GoalsPage,
});

function GoalsPage() {
  const { sections, addSection, removeSection } = useGoals();
  const [newSection, setNewSection] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Long-Term Goals"
        subtitle="Direction for the years ahead"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Section
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New timeframe section</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newSection.trim()) return;
                  addSection(newSection.trim());
                  setNewSection("");
                  setOpen(false);
                }}
                className="flex gap-2"
              >
                <Input
                  value={newSection}
                  onChange={(e) => setNewSection(e.target.value)}
                  placeholder="e.g. Next 20 Years"
                  className="bg-background"
                  autoFocus
                />
                <Button type="submit">Add</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="space-y-8">
        {sections
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((s) => (
            <SectionBlock
              key={s.id}
              id={s.id}
              label={s.label}
              onRemoveSection={() => {
                if (confirm(`Delete section "${s.label}" and all its goals?`))
                  removeSection(s.id);
              }}
            />
          ))}
      </div>
    </div>
  );
}

function SectionBlock({
  id,
  label,
  onRemoveSection,
}: {
  id: string;
  label: string;
  onRemoveSection: () => void;
}) {
  const { goals, addGoal, updateGoal, removeGoal, reorderGoal } = useGoals();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [target, setTarget] = useState("");
  const [expanded, setExpanded] = useState(false);

  const list = useMemo(
    () =>
      goals
        .filter((g) => g.sectionId === id)
        .sort((a, b) => Number(a.achieved) - Number(b.achieved) || a.order - b.order),
    [goals, id],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    addGoal(id, {
      title: title.trim(),
      description: desc.trim() || undefined,
      targetDate: target || undefined,
    });
    setTitle("");
    setDesc("");
    setTarget("");
    setExpanded(false);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold tracking-tight">{label}</h2>
        <button
          onClick={onRemoveSection}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          Remove section
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 mb-3">
        <form onSubmit={submit} className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Add a goal for ${label}…`}
              onFocus={() => setExpanded(true)}
              className="bg-background"
            />
            <Button type="submit" size="icon" aria-label="Add">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {expanded && (
            <>
              <Textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Notes (optional)"
                className="min-h-[70px] bg-background"
              />
              <Input
                type="date"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-[200px] bg-background"
              />
            </>
          )}
        </form>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground pl-1">No goals yet.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((g, i) => (
            <GoalRow
              key={g.id}
              goal={g}
              isFirst={i === 0}
              isLast={i === list.length - 1}
              onToggle={() => updateGoal(g.id, { achieved: !g.achieved })}
              onUpdate={(patch) => updateGoal(g.id, patch)}
              onRemove={() => removeGoal(g.id)}
              onMove={(dir) => reorderGoal(g.id, dir)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function GoalRow({
  goal,
  isFirst,
  isLast,
  onToggle,
  onUpdate,
  onRemove,
  onMove,
}: {
  goal: Goal;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<Goal>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(goal.title);
  const [desc, setDesc] = useState(goal.description ?? "");
  const [target, setTarget] = useState(goal.targetDate ?? "");

  const save = () => {
    onUpdate({
      title: title.trim() || goal.title,
      description: desc.trim() || undefined,
      targetDate: target || undefined,
    });
    setEditing(false);
  };

  return (
    <li
      className={cn(
        "rounded-lg border border-border bg-card p-3 flex gap-3 items-start",
        goal.achieved && "opacity-60",
      )}
    >
      <button
        onClick={onToggle}
        className={cn(
          "mt-0.5 h-5 w-5 rounded-full border flex items-center justify-center shrink-0 transition",
          goal.achieved
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary",
        )}
        aria-label={goal.achieved ? "Mark as not achieved" : "Mark as achieved"}
      >
        {goal.achieved && <Check className="h-3 w-3" />}
      </button>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-background" />
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Notes"
              className="min-h-[70px] bg-background"
            />
            <div className="flex gap-2">
              <Input
                type="date"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-[180px] bg-background"
              />
              <Button size="sm" onClick={save}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={cn(
                "text-sm font-medium",
                goal.achieved && "line-through",
              )}
            >
              {goal.title}
            </div>
            {goal.description && (
              <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                {goal.description}
              </div>
            )}
            {goal.targetDate && (
              <div className="text-[11px] text-muted-foreground mt-1">
                Target · {goal.targetDate}
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        {!editing ? (
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onRemove}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditing(false)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => onMove(-1)}
          disabled={isFirst}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          aria-label="Move up"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={isLast}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          aria-label="Move down"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
