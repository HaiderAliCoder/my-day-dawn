package com.haider.mydaydawn;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FocusTimerPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        FocusTimerService.isAppVisible = true;
    }

    @Override
    public void onPause() {
        super.onPause();
        FocusTimerService.isAppVisible = false;
    }
}
