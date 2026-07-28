import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Sun } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign in — Focus" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error);
          return;
        }
        navigate({ to: "/", replace: true });
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          setError(error);
          return;
        }
        setInfo(
          "Account created. If email confirmation is required, check your inbox — otherwise you're signed in.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dark min-h-screen w-full flex items-center justify-center bg-background text-foreground px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sun className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Focus</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in to your dashboard" : "Create your account"}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs text-muted-foreground">
              Email
            </label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs text-muted-foreground">
              Password
            </label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-background"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-primary">{info}</p>}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
          </Button>
        </form>

        <button
          onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
            setError(null);
            setInfo(null);
          }}
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition"
        >
          {mode === "signin"
            ? "Don't have an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
