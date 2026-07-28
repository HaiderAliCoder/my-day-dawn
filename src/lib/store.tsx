import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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

export interface Habit {
  id: string;
  name: string;
  streak: number;
  lastCompleted?: string; // YYYY-MM-DD
  history: string[]; // YYYY-MM-DD, unsorted set of completed days
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

interface State {
  tasks: Task[];
  habits: Habit[];
  plannerNotes: PlannerNotes;
  goals: Goal[];
  goalSections: GoalSection[];
  clocks: Clock[];
}

const KEY = "productivity-dashboard-v1";

const DEFAULT_STATE: State = {
  tasks: [],
  habits: [],
  plannerNotes: { daily: {}, monthly: {}, yearly: {} },
  goals: [],
  goalSections: [
    { id: "s5", label: "Next 5 Years", order: 0 },
    { id: "s10", label: "Next 10 Years", order: 1 },
    { id: "s50", label: "Next 50 Years", order: 2 },
  ],
  clocks: [
    { id: "c1", timezone: "America/New_York", city: "New York", country: "United States" },
    { id: "c2", timezone: "Europe/London", city: "London", country: "United Kingdom" },
    { id: "c3", timezone: "Asia/Tokyo", city: "Tokyo", country: "Japan" },
  ],
};

function loadState(): State {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

type Ctx = {
  state: State;
  setState: (updater: (s: State) => State) => void;
};

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setInner] = useState<State>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setInner(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state, hydrated]);

  const setState = useCallback((updater: (s: State) => State) => {
    setInner((prev) => updater(prev));
  }, []);

  const value = useMemo(() => ({ state, setState }), [state, setState]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

// helpers
const uid = () => Math.random().toString(36).slice(2, 10);

export function useTasks() {
  const { state, setState } = useStore();
  return {
    tasks: state.tasks,
    add: (partial: Partial<Task> & { title: string; createdIn: TaskSource }) =>
      setState((s) => {
        const now = Date.now();
        // Place new tasks at the end of the global order.
        const maxOrder = s.tasks.reduce(
          (m, t) => Math.max(m, taskOrder(t)),
          0,
        );
        return {
          ...s,
          tasks: [
            ...s.tasks,
            {
              id: uid(),
              completed: false,
              createdAt: now,
              order: maxOrder + 1,
              ...partial,
            } as Task,
          ],
        };
      }),
    update: (id: string, patch: Partial<Task>) =>
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      })),
    remove: (id: string) =>
      setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) })),
    toggle: (id: string) =>
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === id ? { ...t, completed: !t.completed } : t,
        ),
      })),
    /**
     * Reorder a subset of tasks. The order slots occupied by the given
     * ids are redistributed in the new sequence, so relative position
     * against tasks outside the subset is preserved everywhere.
     */
    reorderSubset: (idsInNewOrder: string[]) =>
      setState((s) => {
        const subset = idsInNewOrder
          .map((id) => s.tasks.find((t) => t.id === id))
          .filter((t): t is Task => Boolean(t));
        if (subset.length < 2) return s;
        const slots = subset
          .map((t) => taskOrder(t))
          .slice()
          .sort((a, b) => a - b);
        const assigned = new Map<string, number>();
        idsInNewOrder.forEach((id, i) => {
          if (i < slots.length) assigned.set(id, slots[i]);
        });
        return {
          ...s,
          tasks: s.tasks.map((t) =>
            assigned.has(t.id) ? { ...t, order: assigned.get(t.id)! } : t,
          ),
        };
      }),
  };
}

export function useHabits() {
  const { state, setState } = useStore();
  return {
    habits: state.habits,
    add: (name: string) =>
      setState((s) => ({
        ...s,
        habits: [
          ...s.habits,
          { id: uid(), name, streak: 0, history: [] },
        ],
      })),
    remove: (id: string) =>
      setState((s) => ({ ...s, habits: s.habits.filter((h) => h.id !== id) })),
    /**
     * Toggle completion for any given day (not just today), so each habit
     * can have its own calendar of marked days. Streak/lastCompleted are
     * kept in sync for backward compatibility, but the source of truth is
     * `history` — use computeStreak() to get the live streak.
     */
    toggleDate: (id: string, date: string) =>
      setState((s) => ({
        ...s,
        habits: s.habits.map((h) => {
          if (h.id !== id) return h;
          const marked = h.history.includes(date);
          const history = marked
            ? h.history.filter((d) => d !== date)
            : [...h.history, date].sort();
          const lastCompleted = history.length
            ? history[history.length - 1]
            : undefined;
          return {
            ...h,
            history,
            lastCompleted,
            streak: computeStreak(history, date),
          };
        }),
      })),
  };
}

export function usePlannerNotes() {
  const { state, setState } = useStore();
  return {
    notes: state.plannerNotes,
    setDaily: (date: string, value: string) =>
      setState((s) => ({
        ...s,
        plannerNotes: {
          ...s.plannerNotes,
          daily: { ...s.plannerNotes.daily, [date]: value },
        },
      })),
    setMonthly: (ym: string, value: string) =>
      setState((s) => ({
        ...s,
        plannerNotes: {
          ...s.plannerNotes,
          monthly: { ...s.plannerNotes.monthly, [ym]: value },
        },
      })),
    setYearly: (y: string, value: string) =>
      setState((s) => ({
        ...s,
        plannerNotes: {
          ...s.plannerNotes,
          yearly: { ...s.plannerNotes.yearly, [y]: value },
        },
      })),
  };
}

export function useGoals() {
  const { state, setState } = useStore();
  return {
    goals: state.goals,
    sections: state.goalSections,
    addSection: (label: string) =>
      setState((s) => ({
        ...s,
        goalSections: [
          ...s.goalSections,
          { id: uid(), label, order: s.goalSections.length },
        ],
      })),
    removeSection: (id: string) =>
      setState((s) => ({
        ...s,
        goalSections: s.goalSections.filter((x) => x.id !== id),
        goals: s.goals.filter((g) => g.sectionId !== id),
      })),
    addGoal: (sectionId: string, partial: Partial<Goal> & { title: string }) =>
      setState((s) => ({
        ...s,
        goals: [
          ...s.goals,
          {
            id: uid(),
            sectionId,
            title: partial.title,
            description: partial.description,
            targetDate: partial.targetDate,
            achieved: false,
            order: s.goals.filter((g) => g.sectionId === sectionId).length,
          },
        ],
      })),
    updateGoal: (id: string, patch: Partial<Goal>) =>
      setState((s) => ({
        ...s,
        goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      })),
    removeGoal: (id: string) =>
      setState((s) => ({ ...s, goals: s.goals.filter((g) => g.id !== id) })),
    reorderGoal: (id: string, direction: -1 | 1) =>
      setState((s) => {
        const goal = s.goals.find((g) => g.id === id);
        if (!goal) return s;
        const siblings = s.goals
          .filter((g) => g.sectionId === goal.sectionId)
          .sort((a, b) => a.order - b.order);
        const idx = siblings.findIndex((g) => g.id === id);
        const swap = siblings[idx + direction];
        if (!swap) return s;
        return {
          ...s,
          goals: s.goals.map((g) => {
            if (g.id === goal.id) return { ...g, order: swap.order };
            if (g.id === swap.id) return { ...g, order: goal.order };
            return g;
          }),
        };
      }),
  };
}

export function useClocks() {
  const { state, setState } = useStore();
  return {
    clocks: state.clocks,
    add: (c: Omit<Clock, "id">) =>
      setState((s) => ({ ...s, clocks: [...s.clocks, { ...c, id: uid() }] })),
    remove: (id: string) =>
      setState((s) => ({ ...s, clocks: s.clocks.filter((c) => c.id !== id) })),
  };
}
