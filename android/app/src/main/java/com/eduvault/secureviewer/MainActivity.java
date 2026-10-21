package com.eduvault.secureviewer;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Smallest viable secure host for the deployed EduVault website.
 *
 * Why this exists: ordinary Android Chrome exposes no API that can stop the
 * operating system's screenshot or screen-recording function. FLAG_SECURE is a
 * window flag that only the app hosting the content can set. This Activity does
 * exactly that before creating the WebView, then loads the existing deployed
 * EduVault site. It adds no backend, no duplicate auth and no privileged keys.
 *
 * FLAG_SECURE makes screenshots blank and removes the window from MediaProjection
 * / screen recordings on supported devices. It does not stop a second camera
 * photographing the screen, and rooted/ROM-modified devices can bypass it.
 */
public class MainActivity extends Activity {

    private static final int FILE_CHOOSER_REQUEST = 1001;

    private WebView webView;
    private FrameLayout rootView;
    private View errorOverlay;
    private TextView errorMessage;
    private View customView;
    private FrameLayout fullscreenContainer;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private ValueCallback<Uri[]> filePathCallback;
    private String baseUrl;
    private String allowedHost;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Set BEFORE buildUi() creates the WebView and before loadUrl(). The
        // window is already secure when the first protected page is displayed.
        applySecureFlag();

        // API 33+: keep the protected page out of the recent-apps thumbnail too.
        if (Build.VERSION.SDK_INT >= 33) {
            setRecentsScreenshotEnabled(false);
        }

        baseUrl = getString(R.string.eduvault_url).trim();
        Uri parsed = Uri.parse(baseUrl);
        allowedHost = parsed.getHost();

        if (!"https".equalsIgnoreCase(parsed.getScheme())
                || allowedHost == null
                || allowedHost.isEmpty()
                || baseUrl.contains("YOUR-EDUVAULT")) {
            showConfigurationError();
            return;
        }

        buildUi();
        configureWebView();

        if (savedInstanceState != null && webView.restoreState(savedInstanceState) != null) {
            // Restored after process death; keep the current page.
        } else {
            webView.loadUrl(baseUrl);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Idempotent re-assertion across resume/OEM quirks. The WebView is part
        // of this window, so it stays protected in normal and fullscreen modes.
        applySecureFlag();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
        }
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) {
            webView.saveState(outState);
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(
                        WebChromeClient.FileChooserParams.parseResult(resultCode, data)
                );
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onDestroy() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        if (webView != null) {
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) {
                parent.removeView(webView);
            }
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.clearHistory();
            webView.removeAllViews();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            hideCustomView();
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private void applySecureFlag() {
        getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
        );
    }

    private void buildUi() {
        rootView = new FrameLayout(this);
        rootView.setBackgroundColor(Color.rgb(11, 27, 54));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(11, 27, 54));
        // Suppress the native long-press selection/action mode. The reader's
        // protected root already disables text selection; this prevents the
        // Android WebView from offering copy/paste UI outside that root too.
        webView.setLongClickable(false);
        webView.setOnLongClickListener(v -> true);
        rootView.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        LinearLayout error = new LinearLayout(this);
        error.setOrientation(LinearLayout.VERTICAL);
        error.setGravity(Gravity.CENTER);
        int pad = dp(24);
        error.setPadding(pad, pad, pad, pad);
        error.setBackgroundColor(Color.rgb(11, 27, 54));
        error.setVisibility(View.GONE);

        TextView title = new TextView(this);
        title.setText(R.string.load_error_title);
        title.setTextColor(Color.WHITE);
        title.setTextSize(20);
        title.setGravity(Gravity.CENTER);

        errorMessage = new TextView(this);
        errorMessage.setTextColor(Color.LTGRAY);
        errorMessage.setTextSize(14);
        errorMessage.setGravity(Gravity.CENTER);
        errorMessage.setPadding(0, dp(8), 0, dp(24));

        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setOnClickListener(v -> {
            error.setVisibility(View.GONE);
            if (webView != null) {
                webView.loadUrl(baseUrl);
            }
        });

        error.addView(title);
        error.addView(errorMessage);
        error.addView(retry);
        errorOverlay = error;
        rootView.addView(error, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // Android 15 enforces edge-to-edge for targetSdk 35. Pad the content
        // area by the system bars so the site's fixed reader header is not
        // hidden behind the status bar.
        rootView.setOnApplyWindowInsetsListener((v, insets) -> {
            int top;
            int bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                Insets ime = insets.getInsets(WindowInsets.Type.ime());
                top = bars.top;
                // On Android 15 edge-to-edge, adjustResize alone may not keep
                // login fields above the keyboard; include the IME inset.
                bottom = Math.max(bars.bottom, ime.bottom);
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(0, top, 0, bottom);
            return insets;
        });

        setContentView(rootView);
        rootView.requestApplyInsets();
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        // Content access stays enabled so the WebView file chooser can return
        // content:// URIs for admin upload fields. file:// access remains off.
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        // The EduVault reader owns pinch-to-zoom on its canvas. Turning off
        // WebView's own zoom prevents the two zoom systems fighting.
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setTextZoom(100);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setGeolocationEnabled(false);
        settings.setSaveFormData(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= 26) {
            settings.setSafeBrowsingEnabled(true);
        }

        CookieManager.getInstance().setAcceptCookie(true);
        WebView.setWebContentsDebuggingEnabled(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Only main-frame navigations are policy-checked. Subresources
                // (Supabase, PDF.js worker, fonts, CDN) load normally over HTTPS.
                if (!request.isForMainFrame()) {
                    return false;
                }
                return handleMainFrameUrl(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleMainFrameUrl(Uri.parse(url));
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (errorOverlay != null) {
                    errorOverlay.setVisibility(View.GONE);
                }
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                if (request.isForMainFrame()) {
                    CharSequence description = error != null ? error.getDescription() : null;
                    showLoadError(description != null
                            ? description.toString()
                            : getString(R.string.network_error));
                }
            }

            @Override
            public void onReceivedSslError(
                    WebView view,
                    SslErrorHandler handler,
                    SslError error
            ) {
                // Never continue past a certificate error.
                handler.cancel();
                showLoadError(getString(R.string.ssl_error));
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // The reader needs no camera, microphone or geolocation.
                request.deny();
            }

            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    WebChromeClient.FileChooserParams params
            ) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException e) {
                    filePathCallback = null;
                    return false;
                }
            }

            @Override
            public void onShowCustomView(View view, WebChromeClient.CustomViewCallback callback) {
                showCustomView(view, callback);
            }

            @Override
            public void onHideCustomView() {
                hideCustomView();
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(
                    String url,
                    String userAgent,
                    String contentDisposition,
                    String mimeType,
                    long contentLength
            ) {
                // PDFs are rendered in-app. A download attempt is not part of the
                // reading flow and is not allowed from the secure host.
                Toast.makeText(
                        MainActivity.this,
                        R.string.downloads_disabled,
                        Toast.LENGTH_SHORT
                ).show();
            }
        });
    }

    /**
     * Main-frame navigation policy.
     *
     * Returns true when the WebView must not load the URL itself.
     */
    private boolean handleMainFrameUrl(Uri uri) {
        if (uri == null) {
            return true;
        }

        String scheme = uri.getScheme();
        String host = uri.getHost();

        if ("https".equalsIgnoreCase(scheme) && isAllowedHost(host)) {
            return false; // keep the authenticated EduVault session in the secure WebView
        }

        if ("https".equalsIgnoreCase(scheme)
                || "mailto".equalsIgnoreCase(scheme)
                || "tel".equalsIgnoreCase(scheme)) {
            openExternally(uri);
            return true;
        }

        // http:, intent:, file:, content:, data:, javascript:, blob: and any
        // unknown scheme are refused rather than handed to another app.
        return true;
    }

    private boolean isAllowedHost(String host) {
        if (host == null || allowedHost == null) {
            return false;
        }
        String bare = allowedHost.startsWith("www.")
                ? allowedHost.substring(4)
                : allowedHost;
        return host.equalsIgnoreCase(allowedHost)
                || host.equalsIgnoreCase(bare)
                || host.equalsIgnoreCase("www." + bare);
    }

    private void openExternally(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_app, Toast.LENGTH_SHORT).show();
        }
    }

    private void showCustomView(View view, CustomViewCallback callback) {
        if (customView != null) {
            callback.onCustomViewHidden();
            return;
        }
        customView = view;
        customViewCallback = callback;

        if (view.getParent() instanceof ViewGroup) {
            ((ViewGroup) view.getParent()).removeView(view);
        }

        fullscreenContainer = new FrameLayout(this);
        fullscreenContainer.setBackgroundColor(Color.BLACK);
        fullscreenContainer.addView(view, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        rootView.addView(fullscreenContainer, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        webView.setVisibility(View.GONE);
        setImmersive(true);
    }

    private void hideCustomView() {
        if (customView == null) {
            return;
        }
        if (fullscreenContainer != null) {
            rootView.removeView(fullscreenContainer);
            fullscreenContainer = null;
        }
        customView = null;
        if (webView != null) {
            webView.setVisibility(View.VISIBLE);
        }
        if (customViewCallback != null) {
            customViewCallback.onCustomViewHidden();
            customViewCallback = null;
        }
        setImmersive(false);
    }

    @SuppressWarnings("deprecation")
    private void setImmersive(boolean immersive) {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                if (immersive) {
                    controller.hide(WindowInsets.Type.systemBars());
                    controller.setSystemBarsBehavior(
                            WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    );
                } else {
                    controller.show(WindowInsets.Type.systemBars());
                }
            }
            return;
        }

        int flags = immersive
                ? (View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY)
                : View.SYSTEM_UI_FLAG_VISIBLE;
        getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    private void showLoadError(String detail) {
        if (errorOverlay == null || errorMessage == null) {
            return;
        }
        errorMessage.setText(getString(R.string.load_error_detail, detail));
        errorOverlay.setVisibility(View.VISIBLE);
    }

    private void showConfigurationError() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        int pad = dp(24);
        root.setPadding(pad, pad, pad, pad);
        root.setBackgroundColor(Color.rgb(11, 27, 54));

        TextView message = new TextView(this);
        message.setText(R.string.config_error);
        message.setTextColor(Color.WHITE);
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);
        root.addView(message);

        setContentView(root);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
