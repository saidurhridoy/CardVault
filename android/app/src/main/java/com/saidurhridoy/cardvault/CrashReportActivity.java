package com.saidurhridoy.cardvault;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/** Shows the last crash stack trace on screen with a copy button. */
public class CrashReportActivity extends Activity {

    public static final String EXTRA_TRACE = "trace";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent intent = getIntent();
        String trace = intent == null ? null : intent.getStringExtra(EXTRA_TRACE);
        if (trace == null) {
            // Launched normally (no crash) — stay invisible.
            finish();
            return;
        }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(16, 16, 20));
        root.setFitsSystemWindows(true);

        TextView title = new TextView(this);
        title.setText("CardVault stopped unexpectedly");
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setPadding(48, 48, 48, 8);

        TextView subtitle = new TextView(this);
        subtitle.setText("Please screenshot or copy this and send it to the developer:");
        subtitle.setTextColor(Color.rgb(190, 190, 200));
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        subtitle.setPadding(48, 0, 48, 16);

        TextView body = new TextView(this);
        body.setText(trace);
        body.setTextColor(Color.rgb(255, 168, 168));
        body.setTypeface(Typeface.MONOSPACE);
        body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        body.setPadding(48, 24, 48, 24);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(body);

        Button copy = new Button(this);
        copy.setText("Copy error text");
        copy.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                ClipboardManager cm =
                        (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("cardvault-crash", trace));
                Toast.makeText(CrashReportActivity.this, "Copied", Toast.LENGTH_SHORT).show();
            }
        });

        Button close = new Button(this);
        close.setText("Close");
        close.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finishAffinity();
            }
        });

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(android.view.Gravity.CENTER_VERTICAL);
        buttons.setPadding(24, 8, 24, 8);
        buttons.addView(copy);
        buttons.addView(close);

        root.addView(title);
        root.addView(subtitle);
        root.addView(buttons);
        root.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        setContentView(root);
    }
}
