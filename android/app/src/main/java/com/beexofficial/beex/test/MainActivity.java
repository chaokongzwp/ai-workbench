package com.beexofficial.beex.test;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SSHWorkbenchPlugin.class);
        registerPlugin(VoiceWorkbenchPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
