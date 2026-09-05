package cz.exhibit.catalog;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;

import java.util.Calendar;

public final class DisplayScheduleReceiver extends BroadcastReceiver {
    private static final String ACTION_SCHEDULE = "cz.exhibit.catalog.DISPLAY_SCHEDULE";
    private static final int START_HOUR = 7;
    private static final int END_HOUR = 18;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (isPaused(context)) return;
        schedule(context);
        if (isDisplayWindowActive()) wakeAndOpen(context);
        else refreshRunningActivity(context);
    }

    static boolean isDisplayWindowActive() {
        Calendar now = Calendar.getInstance();
        int minutes = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        return minutes >= START_HOUR * 60 && minutes < END_HOUR * 60;
    }

    static boolean isPaused(Context context) {
        return context.getSharedPreferences("kiosk-control", Context.MODE_PRIVATE).getBoolean("paused", false);
    }

    static void cancel(Context context) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        for (int code : new int[]{1001, 1002}) {
            PendingIntent pending = PendingIntent.getBroadcast(context, code,
                new Intent(context, DisplayScheduleReceiver.class).setAction(ACTION_SCHEDULE),
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
            if (pending != null) { if (manager != null) manager.cancel(pending); pending.cancel(); }
        }
    }

    static void schedule(Context context) {
        if (isPaused(context)) return;
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        scheduleAlarm(context, manager, START_HOUR, 1001);
        scheduleAlarm(context, manager, END_HOUR, 1002);
    }

    private static void scheduleAlarm(Context context, AlarmManager manager, int hour, int requestCode) {
        Calendar alarmTime = Calendar.getInstance();
        alarmTime.set(Calendar.HOUR_OF_DAY, hour);
        alarmTime.set(Calendar.MINUTE, 0);
        alarmTime.set(Calendar.SECOND, 0);
        alarmTime.set(Calendar.MILLISECOND, 0);
        if (alarmTime.getTimeInMillis() <= System.currentTimeMillis()) alarmTime.add(Calendar.DAY_OF_YEAR, 1);

        Intent intent = new Intent(context, DisplayScheduleReceiver.class).setAction(ACTION_SCHEDULE);
        PendingIntent pending = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()) {
                manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarmTime.getTimeInMillis(), pending);
            } else {
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarmTime.getTimeInMillis(), pending);
            }
        } catch (SecurityException error) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarmTime.getTimeInMillis(), pending);
        }
    }

    @SuppressWarnings("deprecation")
    private static void wakeAndOpen(Context context) {
        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (power != null) {
            PowerManager.WakeLock wakeLock = power.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "ExhibitCatalog:MorningWake"
            );
            wakeLock.acquire(60_000L);
        }
        openActivity(context);
    }

    private static void refreshRunningActivity(Context context) {
        openActivity(context);
    }

    private static void openActivity(Context context) {
        Intent activity = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try {
            context.startActivity(activity);
        } catch (RuntimeException ignored) {
            // The next foreground resume applies the correct display window.
        }
    }
}
