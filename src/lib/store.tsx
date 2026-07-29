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
}

interface MotivationalVideoRow {
  id: string;
  title: string;
  storage_path: string;
  duration_seconds: number | null;
  tags: string[];
  created_at: string;
}

function rowToVideo(row: MotivationalVideoRow): MotivationalVideo {
  return {
    id: row.id,
    title: row.title,
    storagePath: row.storage_path,
    durationSeconds: row.duration_seconds ?? undefined,
    tags: row.tags ?? [],
    createdAt: new Date(row.created_at).getTime(),
  };
}

const VIDEO_BUCKET = "motivational-videos";
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024; // 10MB

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
      const ext = file.name.split(".").pop() || "mp4";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(VIDEO_BUCKET)
        .upload(path, file, { contentType: file.type || "video/mp4" });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from("motivational_videos")
        .insert({
          user_id: userId,
          title,
          storage_path: path,
          tags,
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
      const { error } = await supabase.from("motivational_videos").delete().eq("id", video.id);
      if (error) throw error;
    },
    onMutate: async (video) =>
      queryClient.setQueryData<MotivationalVideo[]>(queryKey, (old) =>
        (old ?? []).filter((v) => v.id !== video.id),
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
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return rowToVideo(data.video as MotivationalVideoRow);
    },
    onSuccess: (video) =>
      queryClient.setQueryData<MotivationalVideo[]>(queryKey, (old) => [video, ...(old ?? [])]),
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
    /** Signed URL, valid 1 hour — bucket is private, so this is required to play/view. */
    getPlaybackUrl: async (storagePath: string): Promise<string | null> => {
      const { data, error } = await supabase.storage
        .from(VIDEO_BUCKET)
        .createSignedUrl(storagePath, 60 * 60);
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
  startedAt: number;
  endedAt?: number;
  completed: boolean;
}

interface FocusSessionRow {
  id: string;
  task_id: string | null;
  planned_minutes: number;
  started_at: string;
  ended_at: string | null;
  completed: boolean;
}

function rowToSession(row: FocusSessionRow): FocusSession {
  return {
    id: row.id,
    taskId: row.task_id ?? undefined,
    plannedMinutes: row.planned_minutes,
    startedAt: new Date(row.started_at).getTime(),
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
  });

  const sessions = query.data ?? [];

  const startMutation = useMutation({
    mutationFn: async ({ taskId, plannedMinutes }: { taskId?: string; plannedMinutes: number }) => {
      const { data, error } = await supabase
        .from("focus_sessions")
        .insert({
          user_id: userId,
          task_id: taskId ?? null,
          planned_minutes: plannedMinutes,
        })
        .select("*")
        .single();
      if (error) throw error;
      return rowToSession(data as FocusSessionRow);
    },
    onSuccess: (session) =>
      queryClient.setQueryData<FocusSession[]>(queryKey, (old) => [session, ...(old ?? [])]),
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
    start: (taskId: string | undefined, plannedMinutes: number) =>
      startMutation.mutateAsync({ taskId, plannedMinutes }),
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
