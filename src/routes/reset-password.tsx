import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Sun, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Reset password — Focus" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { updatePassword, signOut } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        setError(error);
        return;
      }
      setDone(true);
      // Force a fresh sign-in with the new password rather than leaving
      // the temporary recovery session active.
      await signOut();
      setTimeout(() => navigate({ to: "/login", replace: true }), 1500);
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
          <p className="text-sm text-muted-foreground">Choose a new password</p>
        </div>

        {done ? (
          <div className="rounded-xl border border-border bg-card p-5 text-center">
            <p className="text-sm text-primary">Password updated. Redirecting to sign in…</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-card p-5">
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="text-xs text-muted-foreground">
                New password
              </label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete="new-password"
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

            <div className="space-y-1.5">
              <label htmlFor="confirm-password" className="text-xs text-muted-foreground">
                Confirm new password
              </label>
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="bg-background"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Please wait…" : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
