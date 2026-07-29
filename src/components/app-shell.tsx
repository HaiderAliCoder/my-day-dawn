import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  CalendarDays,
  CheckSquare,
  Clapperboard,
  Globe2,
  LogOut,
  Menu,
  Notebook,
  Sun,
  Target,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

type NavItem = {
  to: string;
  label: string;
  icon: typeof Sun;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { to: "/", label: "Today", icon: Sun, exact: true },
  { to: "/planner", label: "Planner", icon: Notebook },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/clocks", label: "World Clocks", icon: Globe2 },
  { to: "/goals", label: "Long-Term Goals", icon: Target },
  { to: "/motivation", label: "Motivation", icon: Clapperboard },
];

export function AppShell({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="dark min-h-screen w-full flex bg-background text-foreground">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 h-14 border-b border-border bg-sidebar flex items-center justify-between px-4">
        <span className="text-sm font-semibold tracking-tight">Focus</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-2 -mr-2 text-sidebar-foreground"
          aria-label="Toggle navigation"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed md:static inset-y-0 left-0 z-30 w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex-col transition-transform",
          open ? "flex translate-x-0" : "hidden md:flex md:translate-x-0",
        )}
      >
        <div className="h-14 hidden md:flex items-center px-5 border-b border-sidebar-border">
          <span className="text-sm font-semibold tracking-tight">Focus</span>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 pt-16 md:pt-3">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.to
              : pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to as never}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <SidebarFooter />
      </aside>

      {open && (
        <button
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        />
      )}

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">{children ?? <Outlet />}</div>
      </main>
    </div>
  );
}

function SidebarFooter() {
  const { user, signOut } = useAuth();

  return (
    <div className="p-3 border-t border-sidebar-border">
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-sidebar-foreground/70">
            {user?.email ?? "Signed in"}
          </p>
        </div>
        <button
          onClick={() => void signOut()}
          className="p-1.5 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 md:mb-8 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight truncate">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </header>
  );
}
