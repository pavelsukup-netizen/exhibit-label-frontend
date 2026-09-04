package cz.exhibit.catalog;

import android.app.Activity;
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

        webView.setWebViewClient(new WebViewClient());
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
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception error) {
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
                    startActivityForResult(intent, VIDEO_CHOOSER_REQUEST);
                } catch (Exception error) {
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
            File target = new File(directory, safeId + ".mp4");
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
        DevicePolicyManager policy =
            (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
        if (policy != null && policy.isDeviceOwnerApp(getPackageName())) {
            policy.setLockTaskPackages(
                new ComponentName(this, KioskDeviceAdminReceiver.class),
                new String[]{getPackageName()}
            );
            try {
                startLockTask();
            } catch (IllegalArgumentException | SecurityException ignored) {
                // Immersive mode remains active if the device policy is incomplete.
            }
        }
    }

    private void updateDisplayWindow() {
        if (DisplayScheduleReceiver.isDisplayWindowActive()) {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) setTurnScreenOn(true);
        } else {
            getWindow().clearFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) setTurnScreenOn(false);
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
