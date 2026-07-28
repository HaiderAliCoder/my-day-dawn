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
  history: string[];
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
      setState((s) => ({
        ...s,
        tasks: [
          ...s.tasks,
          {
            id: uid(),
            completed: false,
            createdAt: Date.now(),
            ...partial,
          } as Task,
        ],
      })),
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
    toggleToday: (id: string, today: string) =>
      setState((s) => ({
        ...s,
        habits: s.habits.map((h) => {
          if (h.id !== id) return h;
          const done = h.lastCompleted === today;
          if (done) {
            // undo today
            return {
              ...h,
              lastCompleted: undefined,
              streak: Math.max(0, h.streak - 1),
              history: h.history.filter((d) => d !== today),
            };
          }
          // determine if streak continues (yesterday completed)
          const yest = new Date(today);
          yest.setDate(yest.getDate() - 1);
          const y = yest.toISOString().slice(0, 10);
          const continues = h.lastCompleted === y;
          return {
            ...h,
            lastCompleted: today,
            streak: continues ? h.streak + 1 : 1,
            history: [...h.history, today],
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
