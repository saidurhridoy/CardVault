package com.saidurhridoy.cardvault;

import android.app.Application;
import android.content.Intent;
import android.os.Process;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.StringWriter;

/**
 * Catches any uncaught exception (in the TWA launch path or elsewhere), saves
 * the stack trace and brings up {@link CrashReportActivity} so the error is
 * visible on the phone itself (the app is distributed without adb access).
 * After the system's default crash handling kills the process, Android
 * restarts it straight into the crash report screen.
 */
public class CrashReportingApp extends Application {

    @Override
    public void onCreate() {
        super.onCreate();

        final Thread.UncaughtExceptionHandler previous =
                Thread.getDefaultUncaughtExceptionHandler();

        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread thread, Throwable throwable) {
                StringWriter sw = new StringWriter();
                throwable.printStackTrace(new PrintWriter(sw));
                final String trace = sw.toString();

                android.util.Log.e("CardVault-CRASH", trace);

                try {
                    File f = new File(getFilesDir(), "last_crash.txt");
                    FileWriter w = new FileWriter(f, false);
                    w.write(trace);
                    w.close();
                } catch (Throwable ignored) {
                }

                try {
                    Intent i = new Intent(CrashReportingApp.this, CrashReportActivity.class);
                    i.putExtra(CrashReportActivity.EXTRA_TRACE, trace);
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                    startActivity(i);
                } catch (Throwable ignored) {
                }

                // Delegate so the system performs its normal crash handling
                // (the process is killed and then relaunched into the report
                // screen recorded above).
                if (previous != null) {
                    previous.uncaughtException(thread, throwable);
                } else {
                    Process.killProcess(Process.myPid());
                    System.exit(10);
                }
            }
        });
    }
}
