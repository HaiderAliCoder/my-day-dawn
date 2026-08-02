package com.haider.mydaydawn;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS-facing control surface for FocusTimerService. Every method just sends
 * an Intent — the service itself holds all the real state, so this plugin
 * stays a thin, stateless bridge.
 */
@CapacitorPlugin(name = "FocusTimer")
public class FocusTimerPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        Long endAt = call.getLong("endAt");
        String label = call.getString("label", "Focus session");
        Integer totalSeconds = call.getInt("totalSeconds", 0);
        if (endAt == null) {
            call.reject("endAt is required");
            return;
        }
        Intent intent = new Intent(getContext(), FocusTimerService.class);
        intent.setAction(FocusTimerService.ACTION_START);
        intent.putExtra(FocusTimerService.EXTRA_END_AT, endAt);
        intent.putExtra(FocusTimerService.EXTRA_LABEL, label);
        intent.putExtra(FocusTimerService.EXTRA_TOTAL_SECONDS, totalSeconds != null ? totalSeconds.longValue() : 0L);
        // Only START must go through startForegroundService — Android
        // requires startForeground() to be called within 5s of that call,
        // and onStartCommand() only does so for ACTION_START. Using it for
        // pause/stop too crashes the whole app with
        // ForegroundServiceDidNotStartInTimeException, since those actions
        // never call startForeground().
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        Intent intent = new Intent(getContext(), FocusTimerService.class);
        intent.setAction(FocusTimerService.ACTION_PAUSE);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), FocusTimerService.class);
        intent.setAction(FocusTimerService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve();
    }
}
