import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskSource = "today" | "daily" | "monthly" | "yearly" | "calendar";

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string; // YYYY-MM-DD
  completed: boolean;
  createdIn: TaskSource;
  createdAt: number;
  order?: number; // shared ordering across all views
}

export const taskOrder = (t: Task) => t.order ?? t.createdAt;

export interface HabitItem {
  id: string;
  label: string;
  order: number;
}

export interface Habit {
  id: string;
  name: string;
  items: HabitItem[];
  history: string[]; // YYYY-MM-DD, dates the habit itself was marked done
  itemHistory: Record<string, string[]>; // itemId -> completed dates
}

/**
 * Current streak derived from a habit's full history, counting back from
 * today. If today isn't marked yet, the streak still reflects the run
 * ending yesterday (so it doesn't drop to 0 just because you haven't
 * checked in yet today).
 */
export function computeStreak(history: string[], today: string): number {
  const set = new Set(history);
  const cursor = new Date(today + "T00:00:00");
  if (!set.has(today)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (true) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    const iso = `${y}-${m}-${d}`;
    if (!set.has(iso)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface Goal {
  id: string;
  sectionId: string;
  title: string;
  description?: string;
  targetDate?: string;
  achieved: boolean;
  order: number;
}

export interface GoalSection {
  id: string;
  label: string;
  order: number;
}

export interface Clock {
  id: string;
  timezone: string;
  city: string;
  country: string;
}

export interface PlannerNotes {
  daily: Record<string, string>; // YYYY-MM-DD
  monthly: Record<string, string>; // YYYY-MM
  yearly: Record<string, string>; // YYYY
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  created_in: TaskSource;
  created_at: string;
  sort_order: number;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    dueDate: row.due_date ?? undefined,
    completed: row.completed,
    createdIn: row.created_in,
    createdAt: new Date(row.created_at).getTime(),
    order: row.sort_order,
  };
}

export function useTasks() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const queryKey = ["tasks", userId] as const;

  const query = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as TaskRow[]).map(rowToTask);
    },
  });

  const tasks = query.data ?? [];

  const setTasks = (updater: (tasks: Task[]) => Task[]) => {
    queryClient.setQueryData<Task[]>(queryKey, (old) => updater(old ?? []));
  };

  const addMutation = useMutation({
    mutationFn: async (partial: Partial<Task> & { title: string; createdIn: TaskSource }) => {
      const maxOrder = tasks.reduce((m, t) => Math.max(m, taskOrder(t)), 0);
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          user_id: userId,
          title: partial.title,
          description: partial.description ?? null,
          due_date: partial.dueDate ?? null,
          created_in: partial.createdIn,
          completed: partial.completed ?? false,
          sort_order: maxOrder + 1,
        })
        .select("*")
        .single();
      if (error) throw error;
      return rowToTask(data as TaskRow);
    },
    onSuccess: (task) => setTasks((ts) => [...ts, task]),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const { error } = await supabase
        .from("tasks")
        .update({
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.description !== undefined ? { description: patch.description ?? null } : {}),
          ...(patch.dueDate !== undefined ? { due_date: patch.dueDate ?? null } : {}),
          ...(patch.completed !== undefined ? { completed: patch.completed } : {}),
          ...(patch.order !== undefined ? { sort_order: patch.order } : {}),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => setTasks((ts) => ts.filter((t) => t.id !== id)),
  });

  const reorderMutation = useMutation({
    mutationFn: async (assignments: { id: string; order: number }[]) => {
      await Promise.all(
        assignments.map(({ id, order }) =>
          supabase.from("tasks").update({ sort_order: order }).eq("id", id),
        ),
      );
    },
    onMutate: async (assignments) => {
      const map = new Map(assignments.map((a) => [a.id, a.order]));
      setTasks((ts) => ts.map((t) => (map.has(t.id) ? { ...t, order: map.get(t.id) } : t)));
    },
  });

  return {
    tasks,
    add: (partial: Partial<Task> & { title: string; createdIn: TaskSource }) =>
      addMutation.mutate(partial),
    update: (id: string, patch: Partial<Task>) => updateMutation.mutate({ id, patch }),
    remove: (id: string) => removeMutation.mutate(id),
    toggle: (id: string) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      updateMutation.mutate({ id, patch: { completed: !t.completed } });
    },
    /**
     * Reorder a subset of tasks. The order slots occupied by the given
     * ids are redistributed in the new sequence, so relative position
     * against tasks outside the subset is preserved everywhere.
     */
    reorderSubset: (idsInNewOrder: string[]) => {
      const subset = idsInNewOrder
        .map((id) => tasks.find((t) => t.id === id))
        .filter((t): t is Task => Boolean(t));
      if (subset.length < 2) return;
      const slots = subset
        .map((t) => taskOrder(t))
        .slice()
        .sort((a, b) => a - b);
      const assignments = idsInNewOrder
        .map((id, i) => (i < slots.length ? { id, order: slots[i] } : null))
        .filter((a): a is { id: string; order: number } => a !== null);
      reorderMutation.mutate(assignments);
    },
  };
}

// ---------------------------------------------------------------------------
// Habits (with nested sub-items, e.g. individual prayers within a "Prayer"
// habit) — each habit and each item has its own daily completion history.
// ---------------------------------------------------------------------------

interface HabitRow {
  id: string;
  name: string;
}
interface HabitItemRow {
  id: string;
  habit_id: string;
  label: string;
  sort_order: number;
}
interface HabitCompletionRow {
  habit_id: string;
  completed_date: string;
}
interface HabitItemCompletionRow {
  item_id: string;
  habit_id: string;
  completed_date: string;
}

async function fetchHabits(): Promise<Habit[]> {
  const [habitsRes, itemsRes, completionsRes, itemCompletionsRes] = await Promise.all([
    supabase.from("habits").select("id, name").order("created_at", { ascending: true }),
    supabase
      .from("habit_items")
      .select("id, habit_id, label, sort_order")
      .order("sort_order", { ascending: true }),
    supabase.from("habit_completions").select("habit_id, completed_date"),
    supabase.from("habit_item_completions").select("item_id, habit_id, completed_date"),
  ]);
  if (habitsRes.error) throw habitsRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (completionsRes.error) throw completionsRes.error;
  if (itemCompletionsRes.error) throw itemCompletionsRes.error;

  const habitRows = habitsRes.data as HabitRow[];
  const itemRows = itemsRes.data as HabitItemRow[];
  const completionRows = completionsRes.data as HabitCompletionRow[];
  const itemCompletionRows = itemCompletionsRes.data as HabitItemCompletionRow[];

  return habitRows.map((h) => {
    const items: HabitItem[] = itemRows
      .filter((i) => i.habit_id === h.id)
      .map((i) => ({ id: i.id, label: i.label, order: i.sort_order }));
    const history = completionRows
      .filter((c) => c.habit_id === h.id)
      .map((c) => c.completed_date)
      .sort();
    const itemHistory: Record<string, string[]> = {};
    for (const item of items) {
      itemHistory[item.id] = itemCompletionRows
        .filter((c) => c.item_id === item.id)
        .map((c) => c.completed_date)
        .sort();
    }
    return { id: h.id, name: h.name, items, history, itemHistory };
  });
}

export function useHabits() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const queryKey = ["habits", userId] as const;

  const query = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: fetchHabits,
  });

  const habits = query.data ?? [];

  const setHabits = (updater: (habits: Habit[]) => Habit[]) => {
    queryClient.setQueryData<Habit[]>(queryKey, (old) => updater(old ?? []));
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("habits").insert({ user_id: userId, name });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("habits").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => setHabits((hs) => hs.filter((h) => h.id !== id)),
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("habits").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, name }) =>
      setHabits((hs) => hs.map((h) => (h.id === id ? { ...h, name } : h))),
  });

  const toggleDateMutation = useMutation({
    mutationFn: async ({
      habitId,
      date,
      done,
    }: {
      habitId: string;
      date: string;
      done: boolean;
    }) => {
      if (done) {
        const { error } = await supabase
          .from("habit_completions")
          .delete()
          .eq("habit_id", habitId)
          .eq("completed_date", date);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("habit_completions")
          .insert({ habit_id: habitId, user_id: userId, completed_date: date });
        if (error) throw error;
      }
    },
    onMutate: async ({ habitId, date, done }) =>
      setHabits((hs) =>
        hs.map((h) =>
          h.id !== habitId
            ? h
            : {
                ...h,
                history: done ? h.history.filter((d) => d !== date) : [...h.history, date].sort(),
              },
        ),
      ),
  });

  const addItemMutation = useMutation({
    mutationFn: async ({ habitId, label }: { habitId: string; label: string }) => {
      const habit = habits.find((h) => h.id === habitId);
      const maxOrder = habit?.items.reduce((m, i) => Math.max(m, i.order), -1) ?? -1;
      const { error } = await supabase
        .from("habit_items")
        .insert({ habit_id: habitId, user_id: userId, label, sort_order: maxOrder + 1 });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("habit_items").delete().eq("id", itemId);
      if (error) throw error;
    },
    onMutate: async (itemId) =>
      setHabits((hs) => hs.map((h) => ({ ...h, items: h.items.filter((i) => i.id !== itemId) }))),
  });

  const renameItemMutation = useMutation({
    mutationFn: async ({ itemId, label }: { itemId: string; label: string }) => {
      const { error } = await supabase.from("habit_items").update({ label }).eq("id", itemId);
      if (error) throw error;
    },
    onMutate: async ({ itemId, label }) =>
      setHabits((hs) =>
        hs.map((h) => ({
          ...h,
          items: h.items.map((i) => (i.id === itemId ? { ...i, label } : i)),
        })),
      ),
  });

  const toggleItemDateMutation = useMutation({
    mutationFn: async ({
      itemId,
      habitId,
      date,
      done,
    }: {
      itemId: string;
      habitId: string;
      date: string;
      done: boolean;
    }) => {
      if (done) {
        const { error } = await supabase
          .from("habit_item_completions")
          .delete()
          .eq("item_id", itemId)
          .eq("completed_date", date);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("habit_item_completions")
          .insert({ item_id: itemId, habit_id: habitId, user_id: userId, completed_date: date });
        if (error) throw error;
      }
    },
    onMutate: async ({ itemId, habitId, date, done }) =>
      setHabits((hs) =>
        hs.map((h) => {
          if (h.id !== habitId) return h;
          const current = h.itemHistory[itemId] ?? [];
          const next = done ? current.filter((d) => d !== date) : [...current, date].sort();
          return { ...h, itemHistory: { ...h.itemHistory, [itemId]: next } };
        }),
      ),
  });

  return {
    habits,
    add: (name: string) => addMutation.mutate(name),
    remove: (id: string) => removeMutation.mutate(id),
    rename: (id: string, name: string) => renameMutation.mutate({ id, name }),
    /**
     * Toggle completion for any given day (not just today), so each habit
     * can have its own calendar of marked days.
     */
    toggleDate: (id: string, date: string) => {
      const habit = habits.find((h) => h.id === id);
      const done = habit?.history.includes(date) ?? false;
      toggleDateMutation.mutate({ habitId: id, date, done });
    },
    addItem: (habitId: string, label: string) => addItemMutation.mutate({ habitId, label }),
    removeItem: (itemId: string) => removeItemMutation.mutate(itemId),
    renameItem: (itemId: string, label: string) => renameItemMutation.mutate({ itemId, label }),
    toggleItemDate: (habitId: string, itemId: string, date: string) => {
      const habit = habits.find((h) => h.id === habitId);
      const done = habit?.itemHistory[itemId]?.includes(date) ?? false;
      toggleItemDateMutation.mutate({ itemId, habitId, date, done });
    },
  };
}

// ---------------------------------------------------------------------------
// Planner notes
// ---------------------------------------------------------------------------

interface PlannerNoteRow {
  scope: "daily" | "monthly" | "yearly";
  period_key: string;
  content: string;
}

export function usePlannerNotes() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const queryKey = ["planner_notes", userId] as const;

  const query = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: async (): Promise<PlannerNotes> => {
      const { data, error } = await supabase
        .from("planner_notes")
        .select("scope, period_key, content");
      if (error) throw error;
      const notes: PlannerNotes = { daily: {}, monthly: {}, yearly: {} };
      for (const row of data as PlannerNoteRow[]) {
        notes[row.scope][row.period_key] = row.content;
      }
      return notes;
    },
  });

  const notes = query.data ?? { daily: {}, monthly: {}, yearly: {} };

  const setNotes = (updater: (n: PlannerNotes) => PlannerNotes) => {
    queryClient.setQueryData<PlannerNotes>(queryKey, (old) =>
      updater(old ?? { daily: {}, monthly: {}, yearly: {} }),
    );
  };

  const saveMutation = useMutation({
    mutationFn: async ({
      scope,
      periodKey,
      value,
    }: {
      scope: "daily" | "monthly" | "yearly";
      periodKey: string;
      value: string;
    }) => {
      const { error } = await supabase
        .from("planner_notes")
        .upsert(
          { user_id: userId, scope, period_key: periodKey, content: value },
          { onConflict: "user_id,scope,period_key" },
        );
      if (error) throw error;
    },
    onMutate: async ({ scope, periodKey, value }) =>
      setNotes((n) => ({ ...n, [scope]: { ...n[scope], [periodKey]: value } })),
  });

  return {
    notes,
    setDaily: (date: string, value: string) =>
      saveMutation.mutate({ scope: "daily", periodKey: date, value }),
    setMonthly: (ym: string, value: string) =>
      saveMutation.mutate({ scope: "monthly", periodKey: ym, value }),
    setYearly: (y: string, value: string) =>
      saveMutation.mutate({ scope: "yearly", periodKey: y, value }),
  };
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

interface GoalSectionRow {
  id: string;
  label: string;
  sort_order: number;
}
interface GoalRow {
  id: string;
  section_id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  achieved: boolean;
  sort_order: number;
}

function rowToSection(row: GoalSectionRow): GoalSection {
  return { id: row.id, label: row.label, order: row.sort_order };
}
function rowToGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    sectionId: row.section_id,
    title: row.title,
    description: row.description ?? undefined,
    targetDate: row.target_date ?? undefined,
    achieved: row.achieved,
    order: row.sort_order,
  };
}

export function useGoals() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const sectionsKey = ["goal_sections", userId] as const;
  const goalsKey = ["goals", userId] as const;

  const sectionsQuery = useQuery({
    queryKey: sectionsKey,
    enabled: !!userId,
    queryFn: async (): Promise<GoalSection[]> => {
      const { data, error } = await supabase
        .from("goal_sections")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as GoalSectionRow[]).map(rowToSection);
    },
  });

  const goalsQuery = useQuery({
    queryKey: goalsKey,
    enabled: !!userId,
    queryFn: async (): Promise<Goal[]> => {
      const { data, error } = await supabase
        .from("goals")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as GoalRow[]).map(rowToGoal);
    },
  });

  const sections = sectionsQuery.data ?? [];
  const goals = goalsQuery.data ?? [];

  const setSections = (updater: (s: GoalSection[]) => GoalSection[]) =>
    queryClient.setQueryData<GoalSection[]>(sectionsKey, (old) => updater(old ?? []));
  const setGoals = (updater: (g: Goal[]) => Goal[]) =>
    queryClient.setQueryData<Goal[]>(goalsKey, (old) => updater(old ?? []));

  const addSectionMutation = useMutation({
    mutationFn: async (label: string) => {
      const { error } = await supabase
        .from("goal_sections")
        .insert({ user_id: userId, label, sort_order: sections.length });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sectionsKey }),
  });

  const removeSectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goal_sections").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      setSections((s) => s.filter((x) => x.id !== id));
      setGoals((g) => g.filter((x) => x.sectionId !== id));
    },
  });

  const addGoalMutation = useMutation({
    mutationFn: async ({
      sectionId,
      partial,
    }: {
      sectionId: string;
      partial: Partial<Goal> & { title: string };
    }) => {
      const order = goals.filter((g) => g.sectionId === sectionId).length;
      const { error } = await supabase.from("goals").insert({
        user_id: userId,
        section_id: sectionId,
        title: partial.title,
        description: partial.description ?? null,
        target_date: partial.targetDate ?? null,
        achieved: false,
        sort_order: order,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: goalsKey }),
  });

  const updateGoalMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Goal> }) => {
      const { error } = await supabase
        .from("goals")
        .update({
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.description !== undefined ? { description: patch.description ?? null } : {}),
          ...(patch.targetDate !== undefined ? { target_date: patch.targetDate ?? null } : {}),
          ...(patch.achieved !== undefined ? { achieved: patch.achieved } : {}),
          ...(patch.order !== undefined ? { sort_order: patch.order } : {}),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) =>
      setGoals((g) => g.map((x) => (x.id === id ? { ...x, ...patch } : x))),
  });

  const removeGoalMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goals").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => setGoals((g) => g.filter((x) => x.id !== id)),
  });

  return {
    goals,
    sections,
    addSection: (label: string) => addSectionMutation.mutate(label),
    removeSection: (id: string) => removeSectionMutation.mutate(id),
    addGoal: (sectionId: string, partial: Partial<Goal> & { title: string }) =>
      addGoalMutation.mutate({ sectionId, partial }),
    updateGoal: (id: string, patch: Partial<Goal>) => updateGoalMutation.mutate({ id, patch }),
    removeGoal: (id: string) => removeGoalMutation.mutate(id),
    reorderGoal: (id: string, direction: -1 | 1) => {
      const goal = goals.find((g) => g.id === id);
      if (!goal) return;
      const siblings = goals
        .filter((g) => g.sectionId === goal.sectionId)
        .sort((a, b) => a.order - b.order);
      const idx = siblings.findIndex((g) => g.id === id);
      const swap = siblings[idx + direction];
      if (!swap) return;
      updateGoalMutation.mutate({ id: goal.id, patch: { order: swap.order } });
      updateGoalMutation.mutate({ id: swap.id, patch: { order: goal.order } });
    },
  };
}

// ---------------------------------------------------------------------------
// World clocks
// ---------------------------------------------------------------------------

interface ClockRow {
  id: string;
  timezone: string;
  city: string;
  country: string;
}

export function useClocks() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const queryKey = ["clocks", userId] as const;

  const query = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: async (): Promise<Clock[]> => {
      const { data, error } = await supabase.from("clocks").select("*");
      if (error) throw error;
      return data as ClockRow[];
    },
  });

  const clocks = query.data ?? [];
  const setClocks = (updater: (c: Clock[]) => Clock[]) =>
    queryClient.setQueryData<Clock[]>(queryKey, (old) => updater(old ?? []));

  const addMutation = useMutation({
    mutationFn: async (c: Omit<Clock, "id">) => {
      const { error } = await supabase.from("clocks").insert({ user_id: userId, ...c });
      if (error) {
        // Postgres unique_violation — already added, not a real failure.
        if (error.code === "23505") {
          throw new Error("ALREADY_ADDED");
        }
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clocks").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => setClocks((c) => c.filter((x) => x.id !== id)),
  });

  return {
    clocks,
    add: (c: Omit<Clock, "id">) => addMutation.mutateAsync(c),
    remove: (id: string) => removeMutation.mutate(id),
  };
}

// ---------------------------------------------------------------------------
// Motivational videos — short clips (0-10MB) stored in the private
// "motivational-videos" Storage bucket, one folder per user (RLS-scoped).
// ---------------------------------------------------------------------------

export interface MotivationalVideo {
  id: string;
  title: string;
  storagePath: string;
  durationSeconds?: number;
  tags: string[];
  createdAt: number;
  thumbnailPath?: string;
  /** width / height of the source clip, e.g. 0.5625 for a 9:16 reel. */
  aspectRatio?: number;
}

interface MotivationalVideoRow {
  id: string;
  title: string;
  storage_path: string;
  duration_seconds: number | null;
  tags: string[];
  created_at: string;
  thumbnail_path: string | null;
  aspect_ratio: number | null;
}

function rowToVideo(row: MotivationalVideoRow): MotivationalVideo {
  return {
    id: row.id,
    title: row.title,
    storagePath: row.storage_path,
    durationSeconds: row.duration_seconds ?? undefined,
    tags: row.tags ?? [],
    createdAt: new Date(row.created_at).getTime(),
    thumbnailPath: row.thumbnail_path ?? undefined,
    aspectRatio: row.aspect_ratio ?? undefined,
  };
}

const VIDEO_BUCKET = "motivational-videos";
const THUMB_BUCKET = "motivational-thumbnails";
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Grabs a frame partway into a video source (blob: URL or a signed
 * storage URL) and returns it as a small JPEG, along with the clip's real
 * aspect ratio — so cards can render at the same proportions as the
 * source video instead of a fixed box. Resolves null on any failure
 * (unsupported codec, CORS, etc.) rather than throwing, since a missing
 * thumbnail shouldn't block the upload/import itself.
 */
async function captureVideoThumbnail(
  src: string,
): Promise<{ blob: Blob; aspectRatio: number } | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.style.position = "fixed";
    video.style.left = "-9999px";
    video.style.top = "0";

    let settled = false;
    const finish = (result: { blob: Blob; aspectRatio: number } | null) => {
      if (settled) return;
      settled = true;
      video.remove();
      resolve(result);
    };

    const timeout = setTimeout(() => finish(null), 8000);

    video.onerror = () => {
      clearTimeout(timeout);
      finish(null);
    };
    video.onloadedmetadata = () => {
      if (!video.videoWidth || !video.videoHeight) return finish(null);
      const seekTo = Math.min(0.3, (video.duration || 1) * 0.1);
      video.currentTime = seekTo;
    };
    video.onseeked = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement("canvas");
        const maxDim = 480;
        const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => finish(blob ? { blob, aspectRatio: video.videoWidth / video.videoHeight } : null),
          "image/jpeg",
          0.8,
        );
      } catch {
        finish(null);
      }
    };

    document.body.appendChild(video);
    video.src = src;
  });
}

export function useMotivationalVideos() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const queryKey = ["motivational_videos", userId] as const;

  const query = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: async (): Promise<MotivationalVideo[]> => {
      const { data, error } = await supabase
        .from("motivational_videos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as MotivationalVideoRow[]).map(rowToVideo);
    },
  });

  const videos = query.data ?? [];

  const uploadMutation = useMutation({
    mutationFn: async ({ file, title, tags }: { file: File; title: string; tags: string[] }) => {
      if (!userId) throw new Error("Not signed in");
      if (file.size > MAX_VIDEO_BYTES) {
        throw new Error("Video must be 10MB or smaller.");
      }
      const id = crypto.randomUUID();
      const ext = file.name.split(".").pop() || "mp4";
      const path = `${userId}/${id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(VIDEO_BUCKET)
        .upload(path, file, { contentType: file.type || "video/mp4" });
      if (uploadError) throw uploadError;

      let thumbnailPath: string | null = null;
      let aspectRatio: number | null = null;
      const objectUrl = URL.createObjectURL(file);
      try {
        const thumb = await captureVideoThumbnail(objectUrl);
        if (thumb) {
          const thumbPath = `${userId}/${id}.jpg`;
          const { error: thumbError } = await supabase.storage
            .from(THUMB_BUCKET)
            .upload(thumbPath, thumb.blob, { contentType: "image/jpeg" });
          if (!thumbError) {
            thumbnailPath = thumbPath;
            aspectRatio = thumb.aspectRatio;
          }
        }
      } finally {
        URL.revokeObjectURL(objectUrl);
      }

      const { data, error } = await supabase
        .from("motivational_videos")
        .insert({
          user_id: userId,
          title,
          storage_path: path,
          tags,
          thumbnail_path: thumbnailPath,
          aspect_ratio: aspectRatio,
        })
        .select("*")
        .single();
      if (error) throw error;
      return rowToVideo(data as MotivationalVideoRow);
    },
    onSuccess: (video) =>
      queryClient.setQueryData<MotivationalVideo[]>(queryKey, (old) => [video, ...(old ?? [])]),
  });

  const removeMutation = useMutation({
    mutationFn: async (video: MotivationalVideo) => {
      await supabase.storage.from(VIDEO_BUCKET).remove([video.storagePath]);
      if (video.thumbnailPath) {
        await supabase.storage.from(THUMB_BUCKET).remove([video.thumbnailPath]);
      }
      const { error } = await supabase.from("motivational_videos").delete().eq("id", video.id);
      if (error) throw error;
    },
    onMutate: async (video) =>
      queryClient.setQueryData<MotivationalVideo[]>(queryKey, (old) =>
        (old ?? []).filter((v) => v.id !== video.id),
      ),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, title, tags }: { id: string; title: string; tags: string[] }) => {
      const { data, error } = await supabase
        .from("motivational_videos")
        .update({ title, tags })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return rowToVideo(data as MotivationalVideoRow);
    },
    onSuccess: (video) =>
      queryClient.setQueryData<MotivationalVideo[]>(queryKey, (old) =>
        (old ?? []).map((v) => (v.id === video.id ? video : v)),
      ),
  });

  const importInstagramMutation = useMutation({
    mutationFn: async ({
      url,
      title,
      tags,
    }: {
      url: string;
      title?: string;
      tags: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke("import-instagram-video", {
        body: { url, title, tags },
      });
      if (error) {
        // supabase-js discards the response body on non-2xx by default —
        // read it ourselves so the real reason reaches the UI instead of
        // the generic "non-2xx status code" message.
        let message = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx) {
          try {
            const body = await ctx.clone().json();
            if (body?.error) message = body.error;
          } catch {
            /* body wasn't JSON — keep the generic message */
          }
        }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      return rowToVideo(data.video as MotivationalVideoRow);
    },
    onSuccess: (video) =>
      queryClient.setQueryData<MotivationalVideo[]>(queryKey, (old) => [video, ...(old ?? [])]),
  });

  /** Backfills a thumbnail for a video imported before this feature existed
   *  (or where generation failed at upload time) — pulls a frame from the
   *  already-stored video file, once, and persists it for next time. */
  const ensureThumbnailMutation = useMutation({
    mutationFn: async (video: MotivationalVideo) => {
      if (video.thumbnailPath || !userId) return video;
      const { data: signed, error: signError } = await supabase.storage
        .from(VIDEO_BUCKET)
        .createSignedUrl(video.storagePath, 300);
      if (signError || !signed) return video;

      const thumb = await captureVideoThumbnail(signed.signedUrl);
      if (!thumb) return video;

      const thumbPath = `${userId}/${video.id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(THUMB_BUCKET)
        .upload(thumbPath, thumb.blob, { contentType: "image/jpeg", upsert: true });
      if (uploadError) return video;

      const { data, error } = await supabase
        .from("motivational_videos")
        .update({ thumbnail_path: thumbPath, aspect_ratio: thumb.aspectRatio })
        .eq("id", video.id)
        .select("*")
        .single();
      if (error) return video;
      return rowToVideo(data as MotivationalVideoRow);
    },
    onSuccess: (video) =>
      queryClient.setQueryData<MotivationalVideo[]>(queryKey, (old) =>
        (old ?? []).map((v) => (v.id === video.id ? video : v)),
      ),
  });

  return {
    videos,
    isLoading: query.isLoading,
    upload: (file: File, title: string, tags: string[] = []) =>
      uploadMutation.mutateAsync({ file, title, tags }),
    uploading: uploadMutation.isPending,
    uploadError: uploadMutation.error as Error | null,
    importFromInstagram: (url: string, title?: string, tags: string[] = []) =>
      importInstagramMutation.mutateAsync({ url, title, tags }),
    importing: importInstagramMutation.isPending,
    importError: importInstagramMutation.error as Error | null,
    remove: (video: MotivationalVideo) => removeMutation.mutate(video),
    update: (id: string, title: string, tags: string[]) =>
      updateMutation.mutateAsync({ id, title, tags }),
    updating: updateMutation.isPending,
    ensureThumbnail: (video: MotivationalVideo) => ensureThumbnailMutation.mutateAsync(video),
    /** Signed URL, valid 1 hour — bucket is private, so this is required to play/view. */
    getPlaybackUrl: async (storagePath: string): Promise<string | null> => {
      const { data, error } = await supabase.storage
        .from(VIDEO_BUCKET)
        .createSignedUrl(storagePath, 60 * 60);
      if (error) return null;
      return data.signedUrl;
    },
    getThumbnailUrl: async (thumbnailPath: string): Promise<string | null> => {
      const { data, error } = await supabase.storage
        .from(THUMB_BUCKET)
        .createSignedUrl(thumbnailPath, 60 * 60);
      if (error) return null;
      return data.signedUrl;
    },
    pickRandom: (): MotivationalVideo | undefined =>
      videos.length ? videos[Math.floor(Math.random() * videos.length)] : undefined,
  };
}

// ---------------------------------------------------------------------------
// Motivational images — pics (0-3MB) stored in the private
// "motivational-images" Storage bucket, same pattern as videos.
// ---------------------------------------------------------------------------

export interface MotivationalImage {
  id: string;
  title: string;
  storagePath: string;
  tags: string[];
  createdAt: number;
}

interface MotivationalImageRow {
  id: string;
  title: string;
  storage_path: string;
  tags: string[];
  created_at: string;
}

function rowToImage(row: MotivationalImageRow): MotivationalImage {
  return {
    id: row.id,
    title: row.title,
    storagePath: row.storage_path,
    tags: row.tags ?? [],
    createdAt: new Date(row.created_at).getTime(),
  };
}

const IMAGE_BUCKET = "motivational-images";
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB

export function useMotivationalImages() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const queryKey = ["motivational_images", userId] as const;

  const query = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: async (): Promise<MotivationalImage[]> => {
      const { data, error } = await supabase
        .from("motivational_images")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as MotivationalImageRow[]).map(rowToImage);
    },
  });

  const images = query.data ?? [];

  const uploadMutation = useMutation({
    mutationFn: async ({ file, title, tags }: { file: File; title: string; tags: string[] }) => {
      if (!userId) throw new Error("Not signed in");
      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error("Image must be 3MB or smaller.");
      }
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, file, { contentType: file.type || "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from("motivational_images")
        .insert({
          user_id: userId,
          title,
          storage_path: path,
          tags,
        })
        .select("*")
        .single();
      if (error) throw error;
      return rowToImage(data as MotivationalImageRow);
    },
    onSuccess: (image) =>
      queryClient.setQueryData<MotivationalImage[]>(queryKey, (old) => [image, ...(old ?? [])]),
  });

  const removeMutation = useMutation({
    mutationFn: async (image: MotivationalImage) => {
      await supabase.storage.from(IMAGE_BUCKET).remove([image.storagePath]);
      const { error } = await supabase.from("motivational_images").delete().eq("id", image.id);
      if (error) throw error;
    },
    onMutate: async (image) =>
      queryClient.setQueryData<MotivationalImage[]>(queryKey, (old) =>
        (old ?? []).filter((i) => i.id !== image.id),
      ),
  });

  return {
    images,
    isLoading: query.isLoading,
    upload: (file: File, title: string, tags: string[] = []) =>
      uploadMutation.mutateAsync({ file, title, tags }),
    uploading: uploadMutation.isPending,
    uploadError: uploadMutation.error as Error | null,
    remove: (image: MotivationalImage) => removeMutation.mutate(image),
    getViewUrl: async (storagePath: string): Promise<string | null> => {
      const { data, error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .createSignedUrl(storagePath, 60 * 60);
      if (error) return null;
      return data.signedUrl;
    },
  };
}

// ---------------------------------------------------------------------------
// Focus sessions — a simple timer bound to a task, so "start working" is a
// single deliberate action rather than another item on a list.
// ---------------------------------------------------------------------------

export interface FocusSession {
  id: string;
  taskId?: string;
  plannedMinutes: number;
  plannedSeconds?: number;
  startedAt: number;
  pausedAt?: number;
  endedAt?: number;
  completed: boolean;
}

interface FocusSessionRow {
  id: string;
  task_id: string | null;
  planned_minutes: number;
  planned_seconds: number | null;
  started_at: string;
  paused_at: string | null;
  ended_at: string | null;
  completed: boolean;
}

function rowToSession(row: FocusSessionRow): FocusSession {
  return {
    id: row.id,
    taskId: row.task_id ?? undefined,
    plannedMinutes: row.planned_minutes,
    plannedSeconds: row.planned_seconds ?? undefined,
    startedAt: new Date(row.started_at).getTime(),
    pausedAt: row.paused_at ? new Date(row.paused_at).getTime() : undefined,
    endedAt: row.ended_at ? new Date(row.ended_at).getTime() : undefined,
    completed: row.completed,
  };
}

export function useFocusSessions() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const queryKey = ["focus_sessions", userId] as const;

  const query = useQuery({
    queryKey,
    enabled: !!userId,
    queryFn: async (): Promise<FocusSession[]> => {
      const { data, error } = await supabase
        .from("focus_sessions")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as FocusSessionRow[]).map(rowToSession);
    },
    // While a session is active, back the realtime subscription with a
    // short poll too. WebSocket connections are not reliably kept alive by
    // mobile OSes when the screen is off/backgrounded, so a socket can go
    // silently dead — this bounds how out-of-sync a device can ever get to
    // a few seconds, even if the push channel drops entirely.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((s) => s.endedAt === undefined) ? 3000 : false,
  });

  const sessions = query.data ?? [];

  // The database, not any single device, is the source of truth for "is a
  // session currently running" — this is what lets the phone app and the
  // web tab (or any other device) agree on the same state instead of each
  // one happily starting its own independent timer. `sessions` is already
  // ordered newest-first, so the first row without an ended_at is the one
  // active session (starting a second one is blocked in the UI whenever
  // this is non-null).
  const activeSession = sessions.find((s) => s.endedAt === undefined);

  // Keep every device in sync as close to instantly as the web platform
  // allows: any insert/update to this user's focus_sessions (pause, resume,
  // finish, a new session starting on another device) is applied straight
  // into the cache the moment the event arrives — no extra refetch round
  // trip — plus an immediate refetch whenever the app/tab regains focus, to
  // catch up right away after being backgrounded.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`focus_sessions_sync_${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "focus_sessions", filter: `user_id=eq.${userId}` },
        (payload) => {
          const session = rowToSession(payload.new as FocusSessionRow);
          queryClient.setQueryData<FocusSession[]>(queryKey, (old) =>
            (old ?? []).some((s) => s.id === session.id) ? old : [session, ...(old ?? [])],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "focus_sessions", filter: `user_id=eq.${userId}` },
        (payload) => {
          const session = rowToSession(payload.new as FocusSessionRow);
          queryClient.setQueryData<FocusSession[]>(queryKey, (old) =>
            (old ?? []).map((s) => (s.id === session.id ? session : s)),
          );
        },
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [userId, queryClient, queryKey]);

  const startMutation = useMutation({
    mutationFn: async ({ taskId, plannedSeconds }: { taskId?: string; plannedSeconds: number }) => {
      const { data, error } = await supabase
        .from("focus_sessions")
        .insert({
          user_id: userId,
          task_id: taskId ?? null,
          planned_minutes: Math.max(1, Math.round(plannedSeconds / 60)),
          planned_seconds: plannedSeconds,
        })
        .select("*")
        .single();
      if (error) throw error;
      return rowToSession(data as FocusSessionRow);
    },
    onSuccess: (session) =>
      queryClient.setQueryData<FocusSession[]>(queryKey, (old) => [session, ...(old ?? [])]),
  });

  const pauseMutation = useMutation({
    mutationFn: async (id: string) => {
      const pausedAtIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("focus_sessions")
        .update({ paused_at: pausedAtIso })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return rowToSession(data as FocusSessionRow);
    },
    onMutate: async (id) =>
      queryClient.setQueryData<FocusSession[]>(queryKey, (old) =>
        (old ?? []).map((s) => (s.id === id ? { ...s, pausedAt: Date.now() } : s)),
      ),
    onSuccess: (session) =>
      queryClient.setQueryData<FocusSession[]>(queryKey, (old) =>
        (old ?? []).map((s) => (s.id === session.id ? session : s)),
      ),
  });

  const resumeMutation = useMutation({
    mutationFn: async (id: string) => {
      const current = (queryClient.getQueryData<FocusSession[]>(queryKey) ?? []).find(
        (s) => s.id === id,
      );
      if (!current?.pausedAt) throw new Error("Session is not paused");
      // Shift started_at forward by however long it sat paused, so the
      // remaining time (plannedSeconds - elapsed) is preserved exactly —
      // no separate "remaining seconds" field needed anywhere.
      const pausedDurationMs = Date.now() - current.pausedAt;
      const newStartedAtIso = new Date(current.startedAt + pausedDurationMs).toISOString();
      const { data, error } = await supabase
        .from("focus_sessions")
        .update({ started_at: newStartedAtIso, paused_at: null })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return rowToSession(data as FocusSessionRow);
    },
    onSuccess: (session) =>
      queryClient.setQueryData<FocusSession[]>(queryKey, (old) =>
        (old ?? []).map((s) => (s.id === session.id ? session : s)),
      ),
  });

  const finishMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase
        .from("focus_sessions")
        .update({ ended_at: new Date().toISOString(), completed })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, completed }) =>
      queryClient.setQueryData<FocusSession[]>(queryKey, (old) =>
        (old ?? []).map((s) => (s.id === id ? { ...s, endedAt: Date.now(), completed } : s)),
      ),
  });

  const todayCompletedCount = countTodayCompleted(sessions);

  return {
    sessions,
    activeSession,
    start: (taskId: string | undefined, plannedSeconds: number) =>
      startMutation.mutateAsync({ taskId, plannedSeconds }),
    pause: (id: string) => pauseMutation.mutateAsync(id),
    resume: (id: string) => resumeMutation.mutateAsync(id),
    finish: (id: string, completed: boolean) => finishMutation.mutate({ id, completed }),
    todayCompletedCount,
  };
}

function countTodayCompleted(sessions: FocusSession[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = today.getTime();
  return sessions.filter((s) => s.completed && s.startedAt >= cutoff).length;
}

// ---------------------------------------------------------------------------
// Timetable — a recurring weekly schedule (timetable_weekly_blocks), plus
// one-off date overrides (timetable_overrides) that take priority over the
// weekly schedule only for the time range they overlap on their date. Every
// other weekly block that day is untouched.
// ---------------------------------------------------------------------------

export interface TimetableWeeklyBlock {
  id: string;
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
  title: string;
  startTime: string; // "HH:MM:SS"
  endTime: string;
  alarmEnabled: boolean;
}

export interface TimetableOverride {
  id: string;
  date: string; // "YYYY-MM-DD"
  title: string;
  startTime: string;
  endTime: string;
  alarmEnabled: boolean;
}

/** A single resolved entry for one calendar day, after merging overrides in. */
export interface TimetableEntry {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  alarmEnabled: boolean;
  isOverride: boolean;
}

interface TimetableWeeklyBlockRow {
  id: string;
  day_of_week: number;
  title: string;
  start_time: string;
  end_time: string;
  alarm_enabled: boolean;
}

interface TimetableOverrideRow {
  id: string;
  override_date: string;
  title: string;
  start_time: string;
  end_time: string;
  alarm_enabled: boolean;
}

function weeklyBlockFromRow(r: TimetableWeeklyBlockRow): TimetableWeeklyBlock {
  return {
    id: r.id,
    dayOfWeek: r.day_of_week,
    title: r.title,
    startTime: r.start_time,
    endTime: r.end_time,
    alarmEnabled: r.alarm_enabled,
  };
}

function overrideFromRow(r: TimetableOverrideRow): TimetableOverride {
  return {
    id: r.id,
    date: r.override_date,
    title: r.title,
    startTime: r.start_time,
    endTime: r.end_time,
    alarmEnabled: r.alarm_enabled,
  };
}

/**
 * Merges the recurring weekly schedule with that date's overrides. An
 * override only replaces the portion of weekly blocks it time-overlaps —
 * a weekly block entirely outside every override's range is kept as-is; one
 * that partially overlaps is clipped to the non-overlapping remainder(s); one
 * fully covered by an override is dropped.
 */
export function resolveTimetableForDate(
  date: Date,
  weeklyBlocks: TimetableWeeklyBlock[],
  overrides: TimetableOverride[],
): TimetableEntry[] {
  const dayOfWeek = date.getDay();
  const dateKey = toDateKey(date);
  const dayOverrides = overrides
    .filter((o) => o.date === dateKey)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const dayWeekly = weeklyBlocks.filter((b) => b.dayOfWeek === dayOfWeek);

  const clipped: TimetableEntry[] = [];
  for (const block of dayWeekly) {
    // Start with the block's full range, then carve out every overlapping
    // override, potentially splitting it into multiple remaining pieces.
    let remaining: Array<[string, string]> = [[block.startTime, block.endTime]];
    for (const ov of dayOverrides) {
      const next: Array<[string, string]> = [];
      for (const [s, e] of remaining) {
        if (ov.endTime <= s || ov.startTime >= e) {
          // No overlap with this override — keep the piece whole.
          next.push([s, e]);
          continue;
        }
        if (ov.startTime > s) next.push([s, ov.startTime]);
        if (ov.endTime < e) next.push([ov.endTime, e]);
      }
      remaining = next;
    }
    for (const [s, e] of remaining) {
      clipped.push({
        id: `${block.id}:${s}`,
        title: block.title,
        startTime: s,
        endTime: e,
        alarmEnabled: block.alarmEnabled,
        isOverride: false,
      });
    }
  }

  const overrideEntries: TimetableEntry[] = dayOverrides.map((o) => ({
    id: o.id,
    title: o.title,
    startTime: o.startTime,
    endTime: o.endTime,
    alarmEnabled: o.alarmEnabled,
    isOverride: true,
  }));

  return [...clipped, ...overrideEntries].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function useTimetable() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const weeklyKey = ["timetable_weekly_blocks", userId] as const;
  const overridesKey = ["timetable_overrides", userId] as const;

  const weeklyQuery = useQuery({
    queryKey: weeklyKey,
    enabled: !!userId,
    queryFn: async (): Promise<TimetableWeeklyBlock[]> => {
      const { data, error } = await supabase
        .from("timetable_weekly_blocks")
        .select("*")
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return (data as TimetableWeeklyBlockRow[]).map(weeklyBlockFromRow);
    },
  });

  const overridesQuery = useQuery({
    queryKey: overridesKey,
    enabled: !!userId,
    queryFn: async (): Promise<TimetableOverride[]> => {
      const { data, error } = await supabase
        .from("timetable_overrides")
        .select("*")
        .order("override_date")
        .order("start_time");
      if (error) throw error;
      return (data as TimetableOverrideRow[]).map(overrideFromRow);
    },
  });

  const weeklyBlocks = weeklyQuery.data ?? [];
  const overrides = overridesQuery.data ?? [];

  const addWeeklyMutation = useMutation({
    mutationFn: async (b: Omit<TimetableWeeklyBlock, "id">) => {
      const { error } = await supabase.from("timetable_weekly_blocks").insert({
        user_id: userId,
        day_of_week: b.dayOfWeek,
        title: b.title,
        start_time: b.startTime,
        end_time: b.endTime,
        alarm_enabled: b.alarmEnabled,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: weeklyKey }),
  });

  const updateWeeklyMutation = useMutation({
    mutationFn: async ({ id, ...b }: Partial<TimetableWeeklyBlock> & { id: string }) => {
      const patch: Record<string, unknown> = {};
      if (b.dayOfWeek !== undefined) patch.day_of_week = b.dayOfWeek;
      if (b.title !== undefined) patch.title = b.title;
      if (b.startTime !== undefined) patch.start_time = b.startTime;
      if (b.endTime !== undefined) patch.end_time = b.endTime;
      if (b.alarmEnabled !== undefined) patch.alarm_enabled = b.alarmEnabled;
      const { error } = await supabase.from("timetable_weekly_blocks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: weeklyKey }),
  });

  const removeWeeklyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("timetable_weekly_blocks").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) =>
      queryClient.setQueryData<TimetableWeeklyBlock[]>(weeklyKey, (old) =>
        (old ?? []).filter((b) => b.id !== id),
      ),
  });

  const addOverrideMutation = useMutation({
    mutationFn: async (o: Omit<TimetableOverride, "id">) => {
      const { error } = await supabase.from("timetable_overrides").insert({
        user_id: userId,
        override_date: o.date,
        title: o.title,
        start_time: o.startTime,
        end_time: o.endTime,
        alarm_enabled: o.alarmEnabled,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: overridesKey }),
  });

  const updateOverrideMutation = useMutation({
    mutationFn: async ({ id, ...o }: Partial<TimetableOverride> & { id: string }) => {
      const patch: Record<string, unknown> = {};
      if (o.date !== undefined) patch.override_date = o.date;
      if (o.title !== undefined) patch.title = o.title;
      if (o.startTime !== undefined) patch.start_time = o.startTime;
      if (o.endTime !== undefined) patch.end_time = o.endTime;
      if (o.alarmEnabled !== undefined) patch.alarm_enabled = o.alarmEnabled;
      const { error } = await supabase.from("timetable_overrides").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: overridesKey }),
  });

  const removeOverrideMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("timetable_overrides").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) =>
      queryClient.setQueryData<TimetableOverride[]>(overridesKey, (old) =>
        (old ?? []).filter((o) => o.id !== id),
      ),
  });

  return {
    weeklyBlocks,
    overrides,
    addWeeklyBlock: (b: Omit<TimetableWeeklyBlock, "id">) => addWeeklyMutation.mutateAsync(b),
    updateWeeklyBlock: (b: Partial<TimetableWeeklyBlock> & { id: string }) =>
      updateWeeklyMutation.mutateAsync(b),
    removeWeeklyBlock: (id: string) => removeWeeklyMutation.mutate(id),
    addOverride: (o: Omit<TimetableOverride, "id">) => addOverrideMutation.mutateAsync(o),
    updateOverride: (o: Partial<TimetableOverride> & { id: string }) =>
      updateOverrideMutation.mutateAsync(o),
    removeOverride: (id: string) => removeOverrideMutation.mutate(id),
    forDate: (date: Date) => resolveTimetableForDate(date, weeklyBlocks, overrides),
  };
}

