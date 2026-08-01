import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Bell, BellRing, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  isNative,
  getPermissionStatus,
  requestNotificationPermission,
  requestExactAlarmPermission,
  openNotificationSettings,
  openBatteryOptimizationSettings,
  sendTestNotification,
  type PermissionSnapshot,
} from "@/lib/notifications";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [{ title: "Settings — Focus" }],
  }),
  component: SettingsPage,
});

function StatusPill({ state }: { state: string | null }) {
  const label =
    state === "granted"
      ? "Granted"
      : state === "denied"
        ? "Denied"
        : state === "prompt"
          ? "Not asked yet"
          : "Unknown";
  const color =
    state === "granted"
      ? "bg-primary/15 text-primary"
      : state === "denied"
        ? "bg-destructive/15 text-destructive"
        : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{label}</span>;
}

function NotificationsPanel() {
  const [status, setStatus] = useState<PermissionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setStatus(await getPermissionStatus());
    } catch {
      // Notifications unsupported in this environment (e.g. very old
      // browser) — leave status as null, the UI below explains that.
      setStatus(null);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleRequestPermission = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestNotificationPermission();
      await refresh();
    } catch {
      setError("Couldn't request notification permission on this device/browser.");
    } finally {
      setBusy(false);
    }
  };

  const handleRequestExactAlarm = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestExactAlarmPermission();
      await refresh();
    } catch {
      setError("Couldn't open the exact-alarm settings screen.");
    } finally {
      setBusy(false);
    }
  };

  const handleOpenSettings = async () => {
    setError(null);
    try {
      await openNotificationSettings();
    } catch {
      setError(
        "Couldn't open system settings — enable notifications manually from your phone's Settings app.",
      );
    }
  };

  const handleOpenBatterySettings = async () => {
    setError(null);
    try {
      await openBatteryOptimizationSettings();
    } catch {
      setError(
        'Couldn\'t open battery settings — look for "Battery" or "App battery usage" under this app in your phone\'s Settings app.',
      );
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setError(null);
    setTestSent(false);
    try {
      await sendTestNotification();
      setTestSent(true);
    } catch {
      setError("Couldn't schedule a test notification — check permission is granted above.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Notifications</h2>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Show notifications</span>
        <div className="flex items-center gap-2">
          <StatusPill state={status?.display ?? null} />
          {status?.display === "denied" ? (
            <Button size="sm" variant="outline" onClick={handleOpenSettings}>
              Open settings
            </Button>
          ) : (
            status?.display !== "granted" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={handleRequestPermission}>
                Enable
              </Button>
            )
          )}
        </div>
      </div>
      {status?.display === "denied" && (
        <p className="-mt-1.5 text-xs text-muted-foreground">
          Android already asked once and won't ask again from inside the app — tap "Open settings"
          above and turn notifications on for this app directly.
        </p>
      )}

      {isNative() && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Exact-time alarms</span>
          <div className="flex items-center gap-2">
            <StatusPill state={status?.exactAlarms ?? null} />
            {status?.exactAlarms !== "granted" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={handleRequestExactAlarm}>
                Enable
              </Button>
            )}
          </div>
        </div>
      )}

      {isNative() && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Background reliability</span>
          <Button size="sm" variant="outline" onClick={handleOpenBatterySettings}>
            Battery settings
          </Button>
        </div>
      )}

      <div className="pt-1">
        <Button size="sm" disabled={busy || status?.display !== "granted"} onClick={handleTest}>
          <BellRing className="mr-1.5 h-3.5 w-3.5" />
          Send test notification
        </Button>
        {testSent && (
          <p className="mt-1.5 text-xs text-primary">Sent — it'll arrive in ~5 seconds.</p>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <p className="text-xs text-muted-foreground">
        {isNative()
          ? 'For alarms and reminders to fire reliably when the app is closed and there\'s no wifi/data, set "Battery settings" above to unrestricted/not optimized \u2014 this is the #1 reason background notifications get delayed or dropped on Android.'
          : "In the browser, notifications only fire while this tab stays open. Install the Android app for reliable background notifications."}
      </p>
    </div>
  );
}

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

        <NotificationsPanel />
      </div>
    </div>
  );
}
