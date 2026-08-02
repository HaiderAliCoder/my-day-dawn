package com.haider.mydaydawn;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Fired by AlarmManager at a timetable entry's exact start time. Just hands
 * off to TimetableAlarmService, which owns the actual 10s-on/20s-off pulsed
 * alarm pattern and its notification.
 */
public class TimetableAlarmReceiver extends BroadcastReceiver {
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ENTRY_ID = "entryId";

    @Override
    public void onReceive(Context context, Intent intent) {
        String title = intent.getStringExtra(EXTRA_TITLE);
        String entryId = intent.getStringExtra(EXTRA_ENTRY_ID);

        Intent serviceIntent = new Intent(context, TimetableAlarmService.class);
        serviceIntent.setAction(TimetableAlarmService.ACTION_FIRE);
        serviceIntent.putExtra(TimetableAlarmService.EXTRA_TITLE, title);
        serviceIntent.putExtra(TimetableAlarmService.EXTRA_ENTRY_ID, entryId);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
    }
}
