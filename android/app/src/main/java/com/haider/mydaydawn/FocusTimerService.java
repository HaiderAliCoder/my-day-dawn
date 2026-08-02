package com.haider.mydaydawn;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;

/**
 * Owns the live countdown notification for a running focus session — the
 * Spotify-style "ticks even when the app is closed" behavior.
 *
 * This exists because a plain scheduled LocalNotification only fires once,
 * and (worse, on some OEMs like Infinix/Tecno's XOS) can be held back
 * entirely while the app's process sits "cached but alive" in the
 * background, only delivering once the process is evicted. A foreground
 * service avoids both problems: Android is not allowed to freeze a process
 * that's actively running a foreground service, so this keeps ticking every
 * second and fires the real completion alert on its own internal clock —
 * no dependency on the WebView/JS thread staying alive at all.
 */
public class FocusTimerService extends Service {

    public static final String ACTION_START = "com.haider.mydaydawn.action.START";
    public static final String ACTION_PAUSE = "com.haider.mydaydawn.action.PAUSE";
    public static final String ACTION_STOP = "com.haider.mydaydawn.action.STOP";
    public static final String EXTRA_END_AT = "endAt"; // epoch millis
    public static final String EXTRA_LABEL = "label";

    private static final String CHANNEL_ID = "focus_timer_running";
    private static final String CHANNEL_NAME = "Focus session timer";
    private static final int NOTIF_ID = 424242;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private long endAtMillis = 0L;
    private boolean paused = false;
    private String label = "Focus session";

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (paused) return;
            long remaining = endAtMillis - System.currentTimeMillis();
            if (remaining <= 0) {
                showCompletionNotification();
                stopSelf();
                return;
            }
            updateNotification(remaining);
            handler.postDelayed(this, 1000);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) return START_NOT_STICKY;

        switch (intent.getAction()) {
            case ACTION_START:
                endAtMillis = intent.getLongExtra(EXTRA_END_AT, System.currentTimeMillis());
                String newLabel = intent.getStringExtra(EXTRA_LABEL);
                label = (newLabel != null) ? newLabel : "Focus session";
                paused = false;
                startForeground(NOTIF_ID, buildRunningNotification(endAtMillis - System.currentTimeMillis()));
                handler.removeCallbacks(tick);
                handler.post(tick);
                break;

            case ACTION_PAUSE:
                paused = true;
                handler.removeCallbacks(tick);
                updateNotificationPaused();
                break;

            case ACTION_STOP:
                handler.removeCallbacks(tick);
                stopForeground(true);
                stopSelf();
                break;
        }
        return START_NOT_STICKY;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("The live countdown shown while a focus session is running.");
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
    }

    private PendingIntent contentIntent() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(this, 0, launch, flags);
    }

    private Notification buildRunningNotification(long remainingMillis) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(label)
            .setContentText(formatRemaining(remainingMillis))
            .setContentIntent(contentIntent())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .build();
    }

    private void updateNotification(long remainingMillis) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.notify(NOTIF_ID, buildRunningNotification(remainingMillis));
    }

    private void updateNotificationPaused() {
        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(label + " · paused")
            .setContentText("Open the app and tap Resume to continue")
            .setContentIntent(contentIntent())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
        getSystemService(NotificationManager.class).notify(NOTIF_ID, n);
    }

    private void showCompletionNotification() {
        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("Focus session complete")
            .setContentText(label + " finished.")
            .setContentIntent(contentIntent())
            .setOngoing(false)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build();
        getSystemService(NotificationManager.class).notify(NOTIF_ID, n);

        Vibrator vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator != null) {
            long[] pattern = {0, 200, 100, 200};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
            } else {
                vibrator.vibrate(pattern, -1);
            }
        }
    }

    private String formatRemaining(long millis) {
        long totalSeconds = Math.max(0, millis / 1000);
        long h = totalSeconds / 3600;
        long m = (totalSeconds % 3600) / 60;
        long s = totalSeconds % 60;
        if (h > 0) return String.format("%d:%02d:%02d remaining", h, m, s);
        return String.format("%02d:%02d remaining", m, s);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        super.onDestroy();
    }
}
