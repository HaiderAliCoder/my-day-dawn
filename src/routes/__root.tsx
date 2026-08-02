import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { TimetableAlarmScheduler } from "@/components/timetable-alarm-scheduler";

function NotFoundComponent() {
  return (
    <AppShell>
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-6xl font-semibold">404</h1>
          <p className="mt-2 text-muted-foreground">Page not found.</p>
        </div>
      </div>
    </AppShell>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="dark flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Try refreshing.</p>
        <div className="mt-6">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "Focus — Personal Productivity Dashboard" },
      {
        name: "description",
        content:
          "A minimal, dark-themed personal productivity dashboard with tasks, planner, calendar, world clocks, and long-term goals.",
      },
      { property: "og:title", content: "Focus — Personal Productivity Dashboard" },
      {
        property: "og:description",
        content: "Plan your day, track habits, manage tasks, and stay on top of long-term goals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function FullScreenSpinner() {
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
    </div>
  );
}

/**
 * Route guard: redirects signed-out users to /login and signed-in users
 * away from /login, and only mounts the (Supabase-backed) StoreProvider
 * once we actually have a session.
 */
function AuthGate() {
  const { session, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search });
  const navigate = useNavigate();

  // /reset-password is reached via a Supabase recovery link, which mints a
  // temporary session. It must render standalone (no sidebar chrome) and
  // must never bounce to "/" just because a session now exists.
  const isBareAuthRoute = pathname === "/login" || pathname === "/reset-password";

  useEffect(() => {
    if (loading) return;
    if (!session && !isBareAuthRoute) {
      navigate({ to: "/login", replace: true });
    } else if (session && pathname === "/login") {
      // Supabase's confirmation link auto-signs the user in (session tokens
      // arrive in the URL), so they never actually see the "verified"
      // banner on the login page itself — it flashes for a moment, then
      // this redirect fires. Surface it as a toast on the dashboard instead
      // so the confirmation is guaranteed to be seen.
      if ((search as Record<string, unknown>).verified === "true") {
        toast.success("Email verified — you're all set.");
      }
      navigate({ to: "/", replace: true });
    }
  }, [loading, session, pathname, isBareAuthRoute, search, navigate]);

  if (loading) return <FullScreenSpinner />;

  if (isBareAuthRoute) {
    return pathname === "/reset-password" || !session ? <Outlet /> : <FullScreenSpinner />;
  }

  if (!session) {
    // The redirect effect above is about to fire; show a spinner instead
    // of flashing protected content.
    return <FullScreenSpinner />;
  }

  return (
    <AppShell>
      <TimetableAlarmScheduler />
      <Outlet />
    </AppShell>
  );
}
