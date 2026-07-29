import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [{ title: "Settings — Focus" }],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, updatePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }
    if (!user?.email) {
      setError("No account email found.");
      return;
    }

    setSubmitting(true);
    try {
      // Re-verify identity with the current password before changing it,
      // since Supabase's updateUser doesn't require it on its own.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyError) {
        setError("Current password is incorrect.");
        return;
      }

      const { error } = await updatePassword(newPassword);
      if (error) {
        setError(error);
        return;
      }

      setSuccess("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your account" />

      <div className="max-w-sm">
        <div className="mb-4">
          <p className="text-xs text-muted-foreground">Signed in as</p>
          <p className="text-sm">{user?.email}</p>
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium">Change password</h2>

          <div className="space-y-1.5">
            <label htmlFor="current-password" className="text-xs text-muted-foreground">
              Current password
            </label>
            <Input
              id="current-password"
              type={showPasswords ? "text" : "password"}
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="bg-background"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="new-password" className="text-xs text-muted-foreground">
              New password
            </label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPasswords ? "text" : "password"}
                required
                minLength={6}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-background pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPasswords((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition"
                aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                tabIndex={-1}
              >
                {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirm-new-password" className="text-xs text-muted-foreground">
              Confirm new password
            </label>
            <Input
              id="confirm-new-password"
              type={showPasswords ? "text" : "password"}
              required
              minLength={6}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-background"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-primary">{success}</p>}

          <Button type="submit" disabled={submitting}>
            {submitting ? "Updating…" : "Update password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
