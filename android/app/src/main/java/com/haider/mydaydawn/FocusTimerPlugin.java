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
        if (endAt == null) {
            call.reject("endAt is required");
            return;
        }
        Intent intent = new Intent(getContext(), FocusTimerService.class);
        intent.setAction(FocusTimerService.ACTION_START);
        intent.putExtra(FocusTimerService.EXTRA_END_AT, endAt);
        intent.putExtra(FocusTimerService.EXTRA_LABEL, label);
        startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        Intent intent = new Intent(getContext(), FocusTimerService.class);
        intent.setAction(FocusTimerService.ACTION_PAUSE);
        startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), FocusTimerService.class);
        intent.setAction(FocusTimerService.ACTION_STOP);
        startService(intent);
        call.resolve();
    }

    private void startService(Intent intent) {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }
}
