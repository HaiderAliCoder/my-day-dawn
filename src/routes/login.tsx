import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Sun, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign in — Focus" }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    verified: search.verified === "true" || search.verified === true,
  }),
  component: LoginPage,
});

type Mode = "signin" | "signup" | "forgot";

function LoginPage() {
  const { signIn, signUp, requestPasswordReset } = useAuth();
  const navigate = useNavigate();
  const { verified } = useSearch({ from: "/login" });

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(
    verified ? "Email verified — you can sign in now." : null,
  );
  const [submitting, setSubmitting] = useState(false);

  const resetMessages = () => {
    setError(null);
    setInfo(null);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    resetMessages();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error);
          return;
        }
        navigate({ to: "/", replace: true });
      } else if (mode === "signup") {
        const { error } = await signUp(email, password);
        if (error) {
          setError(error);
          return;
        }
        setInfo(
          "Account created. If email confirmation is required, check your inbox — otherwise you're signed in.",
        );
      } else {
        const { error } = await requestPasswordReset(email);
        if (error) {
          setError(error);
          return;
        }
        setInfo("If that email has an account, a reset link is on its way.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const heading =
    mode === "signin"
      ? "Sign in to your dashboard"
      : mode === "signup"
        ? "Create your account"
        : "Reset your password";

  return (
    <div className="dark min-h-screen w-full flex items-center justify-center bg-background text-foreground px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sun className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Focus</h1>
          <p className="text-sm text-muted-foreground">{heading}</p>
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

          {mode !== "forgot" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs text-muted-foreground">
                  Password
                </label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    className="text-xs text-muted-foreground hover:text-foreground transition"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-background pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-primary">{info}</p>}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Sign up"
                  : "Send reset link"}
          </Button>
        </form>

        {mode === "forgot" ? (
          <button
            onClick={() => switchMode("signin")}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition"
          >
            Back to sign in
          </button>
        ) : (
          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">
              {mode === "signin" ? "New here?" : "Already registered?"}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}

        {mode !== "forgot" && (
          <button
            onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
            className="mt-3 w-full text-center text-sm font-medium text-primary hover:underline underline-offset-4 transition"
          >
            {mode === "signin" ? "Create an account" : "Sign in instead"}
          </button>
        )}
      </div>
    </div>
  );
}
