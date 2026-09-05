package cz.exhibit.catalog;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlertDialog;
import android.widget.EditText;
import android.text.InputType;
import android.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.MessageDigest;
import org.json.JSONTokener;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

public final class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 4107;
    private static final int VIDEO_CHOOSER_REQUEST = 4108;
    private static final String START_URL = "file:///android_asset/web/index.html";

    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private String pendingVideoProductId;
    private boolean leavingKiosk;
    private boolean pickingFile;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
        );
        updateDisplayWindow();
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF0C1117);
        webView.setLongClickable(false);
        webView.setHapticFeedbackEnabled(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                return !START_URL.equals(request.getUrl().toString());
            }
        });
        webView.addJavascriptInterface(new OwnerBridge(), "AndroidOwner");
        webView.addJavascriptInterface(new AndroidMediaBridge(), "AndroidMedia");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> callback,
                FileChooserParams params
            ) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                try {
                    pickingFile = true;
                    stopKioskTask();
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception error) {
                    pickingFile = false;
                    startKioskMode();
                    fileChooserCallback = null;
                    return false;
                }
            }
        });

        setContentView(webView);
        if (savedInstanceState == null) webView.loadUrl(START_URL);
        else webView.restoreState(savedInstanceState);
        enterImmersiveMode();
        DisplayScheduleReceiver.schedule(this);
    }

    @Override
    protected void onResume() {
        super.onResume();
        enterImmersiveMode();
        updateDisplayWindow();
        startKioskMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersiveMode();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        updateDisplayWindow();
        enterImmersiveMode();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        pickingFile = false;
        if (requestCode == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {
            fileChooserCallback.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            );
            fileChooserCallback = null;
        } else if (requestCode == VIDEO_CHOOSER_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                copySelectedVideo(data.getData(), pendingVideoProductId);
            } else {
                sendVideoFailure("Výběr videa byl zrušen.");
            }
        }
    }

    private final class AndroidMediaBridge {
        @JavascriptInterface
        public void pickVideo(String productId) {
            runOnUiThread(() -> {
                pendingVideoProductId = productId;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("video/mp4");
                try {
                    pickingFile = true;
                    stopKioskTask();
                    startActivityForResult(intent, VIDEO_CHOOSER_REQUEST);
                } catch (Exception error) {
                    pickingFile = false;
                    startKioskMode();
                    sendVideoFailure("V zařízení není dostupný správce souborů.");
                }
            });
        }
    }

    private void copySelectedVideo(Uri source, String productId) {
        if (productId == null || productId.isEmpty()) {
            sendVideoFailure("Chybí PN produktu.");
            return;
        }
        new Thread(() -> {
            String safeId = productId.replaceAll("[^A-Za-z0-9._-]", "_");
            File directory = new File(getFilesDir(), "product-videos");
            File target = new File(directory, safeId + "-" + System.currentTimeMillis() + ".mp4");
            try {
                if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Nelze vytvořit složku.");
                try (InputStream input = getContentResolver().openInputStream(source);
                     FileOutputStream output = new FileOutputStream(target, false)) {
                    if (input == null) throw new IllegalStateException("Soubor nelze otevřít.");
                    byte[] buffer = new byte[1024 * 1024];
                    int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                }
                String url = Uri.fromFile(target).toString();
                sendVideoSelected(productId, url, target.getName());
            } catch (Exception error) {
                if (target.exists()) target.delete();
                sendVideoFailure("Video se nepodařilo zkopírovat. Zkontrolujte volné místo.");
            }
        }, "video-copy").start();
    }

    private void sendVideoSelected(String productId, String url, String name) {
        String script = "window.ExhibitNativeVideo&&window.ExhibitNativeVideo.selected("
            + JSONObject.quote(productId) + "," + JSONObject.quote(url) + "," + JSONObject.quote(name) + ")";
        runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    private void sendVideoFailure(String message) {
        String script = "window.ExhibitNativeVideo&&window.ExhibitNativeVideo.failed(" + JSONObject.quote(message) + ")";
        runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    @SuppressWarnings("deprecation")
    private void enterImmersiveMode() {
        if (leavingKiosk) return;
        webView.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    private void startKioskMode() {
        if (leavingKiosk || pickingFile || DisplayScheduleReceiver.isPaused(this)) return;
        DevicePolicyManager policy =
            (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
        try {
        if (policy != null && policy.isDeviceOwnerApp(getPackageName())) {
            if (Build.VERSION.SDK_INT >= 28) policy.setLockTaskFeatures(
                new ComponentName(this, KioskDeviceAdminReceiver.class), DevicePolicyManager.LOCK_TASK_FEATURE_NONE);
            policy.setKeyguardDisabled(new ComponentName(this, KioskDeviceAdminReceiver.class), true);
            policy.setLockTaskPackages(
                new ComponentName(this, KioskDeviceAdminReceiver.class),
                new String[]{getPackageName()}
            );
        }

            // Without Device Owner Android starts user-confirmed screen pinning.
            // With Device Owner the allow-list above turns this into silent Lock Task.
            ActivityManager activityManager = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
            if (activityManager.getLockTaskModeState() == ActivityManager.LOCK_TASK_MODE_NONE) startLockTask();
        } catch (IllegalArgumentException | SecurityException ignored) {
            // Immersive mode remains active if screen pinning is unavailable.
        }
    }

    private void stopKioskTask() {
        ActivityManager manager = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
        if (manager.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE) stopLockTask();
    }

    private void updateDisplayWindow() {
        if (leavingKiosk || DisplayScheduleReceiver.isPaused(this)) return;
        if (DisplayScheduleReceiver.isDisplayWindowActive()) {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setTurnScreenOn(true);
                setShowWhenLocked(true);
            }
        } else {
            getWindow().clearFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) setTurnScreenOn(false);
            if (webView != null) webView.evaluateJavascript("document.querySelectorAll('video').forEach(v=>v.pause())", null);
        }
    }

    private final class OwnerBridge {
        @JavascriptInterface public String status() {
            DevicePolicyManager policy = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
            if (!policy.isDeviceOwnerApp(getPackageName())) return "Device Owner není aktivní – vyžaduje aktivaci přes USB";
            return DisplayScheduleReceiver.isPaused(MainActivity.this)
                ? "Device Owner aktivní · kiosk pozastaven" : "Device Owner aktivní · kiosk zapnutý";
        }

        @JavascriptInterface public void requestExit() {
            requestOwnerAction("remove");
        }

        @JavascriptInterface public void pauseKiosk() { requestOwnerAction("pause"); }
        @JavascriptInterface public void resumeKiosk() { requestOwnerAction("resume"); }

        private void requestOwnerAction(String action) {
            runOnUiThread(() -> webView.evaluateJavascript(
                "document.getElementById('adminOverlay').hidden ? null : localStorage.getItem('exhibit-label-admin-pin-v1')",
                encoded -> {
                    try {
                        Object decoded = new JSONTokener(encoded).nextValue();
                        if (!(decoded instanceof String)) return;
                        confirmOwnerAction(new JSONObject((String) decoded), action);
                    } catch (Exception ignored) { }
                }));
        }
    }

    private void confirmOwnerAction(JSONObject credential, String action) {
        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        input.setHint("Administrátorský PIN");
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle(action.equals("resume") ? "Zapnout kiosk" : action.equals("pause") ? "Dočasně vypnout kiosk" : "Odebrat správu pro odinstalaci")
            .setMessage(action.equals("resume")
                ? "Zapne se uzamčený katalog a denní plán 7:00–18:00. Vyžaduje již aktivního Device Owner. Zadejte svůj PIN."
                : action.equals("pause")
                ? "Aplikace se zavře a budíky se pozastaví. Správa Device Owner ZŮSTANE zachována. Kiosk znovu zapnete v administraci bez počítače. Zadejte svůj PIN."
                : "POZOR: Toto není běžné vypnutí aplikace. Správa Device Owner bude odebrána. Její nové nastavení vyžaduje počítač a USB. Data zůstanou zachována, odinstalace je smaže. Zadejte svůj PIN.")
            .setView(input).setNegativeButton("Zrušit", null).setPositiveButton(action.equals("resume") ? "Zapnout kiosk" : action.equals("pause") ? "Dočasně vypnout" : "Odebrat správu", null).create();
        dialog.setOnShowListener(unused -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            String pin = input.getText().toString();
            new Thread(() -> {
                boolean accepted = false;
                try {
                    int iterations = credential.getInt("iterations");
                    if (iterations < 10000 || iterations > 1000000) throw new IllegalArgumentException();
                    PBEKeySpec spec = new PBEKeySpec(pin.toCharArray(), Base64.decode(credential.getString("salt"), Base64.DEFAULT), iterations, 256);
                    byte[] actual = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
                    spec.clearPassword();
                    accepted = MessageDigest.isEqual(actual, Base64.decode(credential.getString("hash"), Base64.DEFAULT));
                } catch (Exception ignored) { }
                final boolean valid = accepted;
                runOnUiThread(() -> {
                    if (!dialog.isShowing() || isFinishing() || isDestroyed()) return;
                    dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                    if (valid) {
                        dialog.dismiss();
                        if (action.equals("resume")) resumeOwnerKiosk();
                        else releaseOwner(action.equals("remove"));
                    }
                    else { input.setError("Nesprávný PIN"); input.setText(""); }
                });
            }, "owner-pin").start();
        }));
        dialog.show();
    }

    @SuppressWarnings("deprecation")
    private void releaseOwner(boolean removeOwner) {
        leavingKiosk = true;
        getSharedPreferences("kiosk-control", MODE_PRIVATE).edit().putBoolean("paused", true).commit();
        DisplayScheduleReceiver.cancel(this);
        try {
            stopKioskTask();
            DevicePolicyManager policy = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
            ComponentName admin = new ComponentName(this, KioskDeviceAdminReceiver.class);
            if (policy.isDeviceOwnerApp(getPackageName())) {
                policy.setKeyguardDisabled(admin, false);
                if (removeOwner) {
                    policy.setLockTaskPackages(admin, new String[0]);
                    if (Build.VERSION.SDK_INT >= 28) policy.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS);
                    policy.clearDeviceOwnerApp(getPackageName());
                    if (policy.isDeviceOwnerApp(getPackageName())) throw new IllegalStateException("Správa zůstala aktivní.");
                }
            }
            if (removeOwner && policy.isAdminActive(admin)) policy.removeActiveAdmin(admin);
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
            if (Build.VERSION.SDK_INT >= 27) { setTurnScreenOn(false); setShowWhenLocked(false); }
            webView.evaluateJavascript("document.querySelectorAll('video').forEach(v=>v.pause())", null);
            webView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            startActivity(new Intent(Settings.ACTION_SETTINGS));
            finishAndRemoveTask();
        } catch (Exception error) {
            new AlertDialog.Builder(this).setTitle("Akce není dokončená")
                .setMessage("Android nedovolil dokončit akci: " + error.getMessage() + ". Automatické probouzení je zastavené. Ověřte stav správy v administraci.")
                .setPositiveButton("Nastavení", (d, w) -> startActivity(new Intent(Settings.ACTION_SETTINGS)))
                .setNegativeButton("Zavřít", null).show();
        }
    }

    private void resumeOwnerKiosk() {
        DevicePolicyManager policy = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
        if (!policy.isDeviceOwnerApp(getPackageName())) {
            new AlertDialog.Builder(this).setTitle("Nejdřív aktivujte Device Owner")
                .setMessage("Správa tabletu byla odebrána nebo ještě nebyla nastavena. Připojte tablet k počítači přes USB a aktivujte Device Owner. Aplikace si toto oprávnění sama udělit nemůže.")
                .setPositiveButton("Rozumím", null).show();
            return;
        }
        leavingKiosk = false;
        getSharedPreferences("kiosk-control", MODE_PRIVATE).edit().putBoolean("paused", false).commit();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        DisplayScheduleReceiver.schedule(this);
        updateDisplayWindow();
        enterImmersiveMode();
        startKioskMode();
        ActivityManager manager = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
        if (manager.getLockTaskModeState() == ActivityManager.LOCK_TASK_MODE_LOCKED) {
            webView.evaluateJavascript("document.getElementById('closeAdmin').click()", null);
        } else {
            new AlertDialog.Builder(this).setTitle("Kiosk se nepodařilo uzamknout")
                .setMessage("Device Owner existuje, ale Android nepotvrdil Lock Task. Nepovažujte tablet za uzamčený.")
                .setPositiveButton("Rozumím", null).show();
        }
    }

    @Override
    public void onBackPressed() {
        // Back is intentionally disabled on the visitor screen. Admin dialogs have their own close action.
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
        }
        super.onDestroy();
    }
}
