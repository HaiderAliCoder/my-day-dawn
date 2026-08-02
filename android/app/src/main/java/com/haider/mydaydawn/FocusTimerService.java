package com.haider.mydaydawn;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;

/**
 * Owns the live countdown notification for a running focus session — the
 * Spotify-style "ticks even when the app is closed" behavior — and the
 * completion alarm.
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
    public static final String EXTRA_TOTAL_SECONDS = "totalSeconds"; // for the progress bar
    public static final String EXTRA_LABEL = "label";

    private static final String CHANNEL_ID = "focus_timer_running";
    private static final String CHANNEL_NAME = "Focus session timer";
    private static final int NOTIF_ID = 424242;

    /**
     * Whether MainActivity is currently resumed (screen on, app in front —
     * not just "process alive"). Kept as a plain static since this is a
     * single-process app; set from MainActivity.onResume()/onPause(). Used
     * to decide how aggressive the completion alarm needs to be: if you're
     * already looking at the app, a full 5s alarm would just be annoying —
     * one beep confirms it. If you're not, that's exactly when it needs to
     * be loud and sustained.
     */
    public static volatile boolean isAppVisible = false;

    private static final long ALARM_DURATION_MS = 5000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private long endAtMillis = 0L;
    private long totalMillis = 0L;
    private boolean paused = false;
    private String label = "Focus session";

    private MediaPlayer alarmPlayer;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (paused) return;
            long remaining = endAtMillis - System.currentTimeMillis();
            if (remaining <= 0) {
                showCompletionAlarm();
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
                long totalSeconds = intent.getLongExtra(EXTRA_TOTAL_SECONDS, 0L);
                totalMillis = totalSeconds > 0 ? totalSeconds * 1000 : Math.max(1000, endAtMillis - System.currentTimeMillis());
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
                stopAlarmSound();
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
            // The channel's own sound stays off — completion sound is played
            // manually via MediaPlayer below so we can loop it for
            // background completions and keep it to one beep in foreground.
            channel.setSound(null, null);
            manager.createNotificationChannel(channel);
        }
    }

    private PendingIntent contentIntent() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(this, 0, launch, flags);
    }

    private android.graphics.Bitmap appIconBitmap() {
        try {
            return BitmapFactory.decodeResource(getResources(), getApplicationInfo().icon);
        } catch (Exception e) {
            return null;
        }
    }

    private Notification buildRunningNotification(long remainingMillis) {
        String remainingText = formatRemaining(remainingMillis);
        int totalSeconds = (int) Math.max(1, totalMillis / 1000);
        int elapsedSeconds = (int) Math.min(totalSeconds, (totalMillis - remainingMillis) / 1000);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setLargeIcon(appIconBitmap())
            .setContentTitle(label)
            .setContentText(remainingText)
            .setSubText("Focus session in progress")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(remainingText + " left in this session"))
            .setContentIntent(contentIntent())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setProgress(totalSeconds, elapsedSeconds, false);

        return builder.build();
    }

    private void updateNotification(long remainingMillis) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.notify(NOTIF_ID, buildRunningNotification(remainingMillis));
    }

    private void updateNotificationPaused() {
        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setLargeIcon(appIconBitmap())
            .setContentTitle(label + " · paused")
            .setContentText("Open the app and tap Resume to continue")
            .setContentIntent(contentIntent())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build();
        getSystemService(NotificationManager.class).notify(NOTIF_ID, n);
    }

    /**
     * Fires when the countdown hits zero. Two modes:
     *  - App visible (you're looking at it right now): one short beep, one
     *    vibration pulse — enough to confirm, not annoying.
     *  - App not visible (locked / backgrounded / closed): loud looping
     *    alarm sound + continuous vibration for ALARM_DURATION_MS, because
     *    this is the one moment you actually need it to grab your
     *    attention the way a real alarm does.
     */
    private void showCompletionAlarm() {
        boolean loud = !isAppVisible;

        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setLargeIcon(appIconBitmap())
            .setContentTitle("Focus session complete")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(label + " finished. Nice work."))
            .setContentText(label + " finished.")
            .setContentIntent(contentIntent())
            .setOngoing(false)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .build();
        getSystemService(NotificationManager.class).notify(NOTIF_ID, n);

        playAlarmSound(loud);
        vibrateCompletion(loud);
    }

    private void playAlarmSound(boolean loud) {
        stopAlarmSound();
        try {
            Uri soundUri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM);
            if (soundUri == null) {
                soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            alarmPlayer = new MediaPlayer();
            alarmPlayer.setDataSource(this, soundUri);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                alarmPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(loud ? AudioAttributes.USAGE_ALARM : AudioAttributes.USAGE_NOTIFICATION_EVENT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            }
            alarmPlayer.setLooping(loud);
            alarmPlayer.prepare();
            alarmPlayer.start();

            if (loud) {
                handler.postDelayed(this::stopAlarmSound, ALARM_DURATION_MS);
            } else {
                // Single beep — let it finish naturally, then release.
                alarmPlayer.setOnCompletionListener(mp -> stopAlarmSound());
            }
        } catch (Exception e) {
            // Best-effort — vibration still covers it if sound playback
            // fails for any reason (e.g. no default alarm sound set).
            stopAlarmSound();
        }
    }

    private void stopAlarmSound() {
        if (alarmPlayer != null) {
            try {
                if (alarmPlayer.isPlaying()) alarmPlayer.stop();
                alarmPlayer.release();
            } catch (Exception ignored) {
            }
            alarmPlayer = null;
        }
    }

    private void vibrateCompletion(boolean loud) {
        Vibrator vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null) return;

        if (loud) {
            // Repeating buzz-pause pattern for the same ~5s window as the
            // alarm sound. Index 0 = repeat from the start of the pattern.
            long[] pattern = {0, 400, 200};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
            }
            handler.postDelayed(vibrator::cancel, ALARM_DURATION_MS);
        } else {
            long[] pattern = {0, 200};
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
