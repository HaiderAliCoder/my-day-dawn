package com.haider.mydaydawn;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Android clears every AlarmManager alarm on reboot — this reads back the
 * entries TimetableAlarmPlugin persisted last time it scheduled, and
 * re-registers whichever ones are still in the future. Entries older than
 * "now" are just dropped (their moment already passed while the phone was
 * off/restarting).
 */
public class TimetableBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;

        SharedPreferences prefs = context.getSharedPreferences(
            TimetableAlarmPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        String raw = prefs.getString(TimetableAlarmPlugin.PREFS_KEY_ENTRIES, null);
        if (raw == null) return;

        try {
            JSONArray entries = new JSONArray(raw);
            long now = System.currentTimeMillis();
            for (int i = 0; i < entries.length(); i++) {
                JSONObject entry = entries.getJSONObject(i);
                long atMillis = entry.getLong("atMillis");
                if (atMillis <= now) continue;
                TimetableAlarmPlugin.scheduleOne(
                    context, entry.getString("id"), entry.getString("title"), atMillis);
            }
        } catch (JSONException ignored) {
        }
    }
}
