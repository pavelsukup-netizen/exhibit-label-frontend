package cz.exhibit.catalog;

import android.app.admin.DeviceAdminReceiver;

public final class KioskDeviceAdminReceiver extends DeviceAdminReceiver {
    @Override public void onEnabled(android.content.Context context, android.content.Intent intent) {
        context.getSharedPreferences("kiosk-control", android.content.Context.MODE_PRIVATE)
            .edit().putBoolean("paused", false).commit();
        DisplayScheduleReceiver.schedule(context);
    }
}
