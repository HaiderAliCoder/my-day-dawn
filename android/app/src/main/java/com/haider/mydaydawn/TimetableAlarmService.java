package com.haider.mydaydawn;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
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
 * Plays the timetable alarm pattern: 10s of alarm sound + vibration, 20s of
 * silence, repeated for a total 2-minute window, then stops automatically
 * and leaves just the notification behind (not ongoing, so it can be
 * swiped away or tapped like a normal notification).
 *
 * Runs as a foreground service for the same reason FocusTimerService does:
 * it needs to keep pulsing correctly regardless of whether the app's
 * WebView is alive, frozen, or the phone is in Doze.
 */
public class TimetableAlarmService extends Service {

    public static final String ACTION_FIRE = "com.haider.mydaydawn.action.TIMETABLE_FIRE";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ENTRY_ID = "entryId";

    private static final String CHANNEL_ID = "timetable_alarms";
    private static final String CHANNEL_NAME = "Timetable alarms";

    private static final long PULSE_ON_MS = 10_000;
    private static final long PULSE_OFF_MS = 20_000;
    private static final long TOTAL_WINDOW_MS = 120_000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private String title = "Timetable";
    private int notifId = 900000;
    private long windowEndAt = 0L;

    private final Runnable pulseOn = new Runnable() {
        @Override
        public void run() {
            if (System.currentTimeMillis() >= windowEndAt) {
                finishAlarm();
                return;
            }
            startPulseSound();
            vibrateOnce();
            handler.postDelayed(pulseOff, PULSE_ON_MS);
        }
    };

    private final Runnable pulseOff = new Runnable() {
        @Override
        public void run() {
            stopPulseSound();
            if (System.currentTimeMillis() >= windowEndAt) {
                finishAlarm();
                return;
            }
            handler.postDelayed(pulseOn, PULSE_OFF_MS);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || !ACTION_FIRE.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String newTitle = intent.getStringExtra(EXTRA_TITLE);
        title = (newTitle != null) ? newTitle : "Timetable";
        String entryId = intent.getStringExtra(EXTRA_ENTRY_ID);
        notifId = 900000 + (entryId != null ? Math.abs(entryId.hashCode() % 90000) : 0);
        windowEndAt = System.currentTimeMillis() + TOTAL_WINDOW_MS;

        startForeground(notifId, buildFiringNotification());
        handler.removeCallbacksAndMessages(null);
        handler.post(pulseOn);
        return START_NOT_STICKY;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Alarms for scheduled timetable entries.");
            // Sound is played manually via MediaPlayer so the pulsed on/off
            // pattern is exact, rather than however the channel would fire it.
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

    private Notification buildFiringNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText("Scheduled now")
            .setContentIntent(contentIntent())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .build();
    }

    private void finishAlarm() {
        stopPulseSound();
        Notification done = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText("Scheduled time")
            .setContentIntent(contentIntent())
            .setOngoing(false)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build();
        getSystemService(NotificationManager.class).notify(notifId, done);
        handler.removeCallbacksAndMessages(null);
        stopForeground(true);
        stopSelf();
    }

    private void startPulseSound() {
        stopPulseSound();
        try {
            Uri soundUri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM);
            if (soundUri == null) {
                soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            player = new MediaPlayer();
            player.setDataSource(this, soundUri);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            }
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception e) {
            stopPulseSound();
        }
    }

    private void stopPulseSound() {
        if (player != null) {
            try {
                if (player.isPlaying()) player.stop();
                player.release();
            } catch (Exception ignored) {
            }
            player = null;
        }
    }

    private void vibrateOnce() {
        Vibrator vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null) return;
        long[] pattern = {0, 400, 200, 400, 200, 400};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
        } else {
            vibrator.vibrate(pattern, -1);
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        stopPulseSound();
        super.onDestroy();
    }
}
