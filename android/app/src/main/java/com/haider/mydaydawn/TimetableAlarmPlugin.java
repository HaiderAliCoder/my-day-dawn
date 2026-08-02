package com.haider.mydaydawn;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * JS-facing control for scheduling timetable alarms as exact system alarms.
 *
 * JS is the source of truth for *what* should be scheduled — it resolves
 * the weekly schedule + date overrides into a flat list of upcoming entries
 * (see resolveTimetableForDate in store.tsx) and calls scheduleAll() with
 * roughly the next 48h of them, every time the app opens/resumes or the
 * schedule is edited. This plugin's job is just to turn that list into real
 * AlarmManager alarms, and to persist the list so TimetableBootReceiver can
 * re-arm everything after a phone reboot (Android clears all AlarmManager
 * alarms on reboot — there's no way around re-registering them).
 */
@CapacitorPlugin(name = "TimetableAlarms")
public class TimetableAlarmPlugin extends Plugin {

    static final String PREFS_NAME = "timetable_alarms";
    static final String PREFS_KEY_ENTRIES = "entries";

    @PluginMethod
    public void scheduleAll(PluginCall call) {
        JSArray entries = call.getArray("entries");
        if (entries == null) {
            call.reject("entries is required");
            return;
        }

        Context context = getContext();
        cancelAllInternal(context);

        JSONArray toPersist = new JSONArray();
        try {
            for (int i = 0; i < entries.length(); i++) {
                JSObject entry = JSObject.fromJSONObject(entries.getJSONObject(i));
                String id = entry.getString("id");
                String title = entry.getString("title");
                long atMillis = entry.getLong("atMillis");

                if (id == null || title == null) continue;
                if (atMillis <= System.currentTimeMillis()) continue; // already past

                scheduleOne(context, id, title, atMillis);

                JSONObject persisted = new JSONObject();
                persisted.put("id", id);
                persisted.put("title", title);
                persisted.put("atMillis", atMillis);
                toPersist.put(persisted);
            }
        } catch (JSONException e) {
            call.reject("Malformed entries", e);
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(PREFS_KEY_ENTRIES, toPersist.toString()).apply();

        call.resolve();
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        cancelAllInternal(getContext());
        getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().remove(PREFS_KEY_ENTRIES).apply();
        call.resolve();
    }

    static void scheduleOne(Context context, String id, String title, long atMillis) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent intent = new Intent(context, TimetableAlarmReceiver.class);
        intent.putExtra(TimetableAlarmReceiver.EXTRA_TITLE, title);
        intent.putExtra(TimetableAlarmReceiver.EXTRA_ENTRY_ID, id);

        int requestCode = stableRequestCode(id);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(context, requestCode, intent, flags);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pendingIntent);
        } else {
            alarmManager.setExact(AlarmManager.RTC_WAKEUP, atMillis, pendingIntent);
        }
    }

    private static void cancelAllInternal(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String raw = prefs.getString(PREFS_KEY_ENTRIES, null);
        if (raw == null) return;

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        try {
            JSONArray previous = new JSONArray(raw);
            for (int i = 0; i < previous.length(); i++) {
                JSONObject entry = previous.getJSONObject(i);
                String id = entry.getString("id");
                Intent intent = new Intent(context, TimetableAlarmReceiver.class);
                int requestCode = stableRequestCode(id);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT
                    | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
                PendingIntent pendingIntent = PendingIntent.getBroadcast(context, requestCode, intent, flags);
                alarmManager.cancel(pendingIntent);
            }
        } catch (JSONException ignored) {
        }
    }

    /** Turns an entry id string into a stable positive int for PendingIntent request codes. */
    static int stableRequestCode(String id) {
        int hash = 0;
        for (int i = 0; i < id.length(); i++) {
            hash = (hash * 31 + id.charAt(i)) | 0;
        }
        return Math.abs(hash);
    }
}
