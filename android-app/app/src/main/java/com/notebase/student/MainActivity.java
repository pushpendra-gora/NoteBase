package com.notebase.student;

import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.google.android.material.button.MaterialButton;

import org.json.JSONObject;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends AppCompatActivity {

    private static final String APP_URL = "https://notebase-sigma.vercel.app";

    private WebView webView;
    private ProgressBar progressBar;
    private FrameLayout customViewContainer;
    private FrameLayout pdfNativeContainer;
    private LinearLayout offlineErrorLayout;
    private LinearLayout splashOverlay;
    private NativePdfViewerView nativePdfViewerView;
    private PdfCacheManager pdfCacheManager;

    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private ValueCallback<Uri[]> fileUploadCallback;
    private long lastBackPressTime = 0L;
    private long pdfSessionToken = 0L;
    private boolean hasRetriedOfflineCache = false;
    private boolean networkCallbackRegistered = false;

    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();

    private static final Pattern YT_WATCH_PATTERN = Pattern.compile("[?&]v=([a-zA-Z0-9_-]{11})");
    private static final Pattern YT_PATH_PATTERN = Pattern.compile("(?:youtu\\.be/|embed/|shorts/|live/)([a-zA-Z0-9_-]{11})");

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (fileUploadCallback != null) {
                    Uri[] results = null;
                    if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                        if (result.getData().getClipData() != null) {
                            int count = result.getData().getClipData().getItemCount();
                            results = new Uri[count];
                            for (int i = 0; i < count; i++) {
                                results[i] = result.getData().getClipData().getItemAt(i).getUri();
                            }
                        } else if (result.getData().getData() != null) {
                            results = new Uri[]{result.getData().getData()};
                        }
                    }
                    fileUploadCallback.onReceiveValue(results);
                    fileUploadCallback = null;
                }
            });

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        FrameLayout contentContainer = findViewById(R.id.contentContainer);
        if (contentContainer != null) {
            ViewCompat.setOnApplyWindowInsetsListener(contentContainer, (v, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(contentContainer);
        }

        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);
        customViewContainer = findViewById(R.id.customViewContainer);
        pdfNativeContainer = findViewById(R.id.pdfNativeContainer);
        offlineErrorLayout = findViewById(R.id.offlineErrorLayout);
        splashOverlay = findViewById(R.id.splashOverlay);
        MaterialButton btnRetryConnection = findViewById(R.id.btnRetryConnection);
        if (savedInstanceState != null && splashOverlay != null) {
            splashOverlay.setVisibility(View.GONE);
        } else if (splashOverlay != null) {
            splashOverlay.postDelayed(this::dismissSplashOverlay, 4500L);
        }

        pdfCacheManager = new PdfCacheManager(this);
        nativePdfViewerView = new NativePdfViewerView(this);
        pdfNativeContainer.addView(nativePdfViewerView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        btnRetryConnection.setOnClickListener(v -> {
            offlineErrorLayout.setVisibility(View.GONE);
            hasRetriedOfflineCache = false;
            updateWebViewCacheMode(isDeviceOnline());
            String currentUrl = webView.getUrl();
            if (currentUrl != null && currentUrl.startsWith(APP_URL)) {
                webView.reload();
            } else {
                webView.loadUrl(APP_URL);
            }
        });

        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);

        // Configure WebView hardware rendering & viewport hygiene
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setHorizontalScrollBarEnabled(false);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setAllowFileAccess(false);
        webSettings.setAllowContentAccess(true);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        webSettings.setSupportZoom(false);
        webSettings.setBuiltInZoomControls(false);
        webSettings.setDisplayZoomControls(false);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        updateWebViewCacheMode(isDeviceOnline());
        registerLiveNetworkMonitor();

        // Expose optimized native Android bridge
        webView.addJavascriptInterface(new NoteBaseBridge(), "NoteBaseAndroid");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrlNavigation(request.getUrl().toString());
            }

            private boolean handleUrlNavigation(String url) {
                if (url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("whatsapp:")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception ignored) {}
                    return true;
                }

                if (url.startsWith("vnd.youtube:") || url.contains("youtube.com/watch") || url.contains("youtu.be/")) {
                    launchYouTubeApp(url);
                    return true;
                }

                if (url.startsWith("intent:")) {
                    try {
                        Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                        if (intent != null) {
                            try {
                                startActivity(intent);
                                return true;
                            } catch (Exception e) {
                                String fallbackUrl = intent.getStringExtra("browser_fallback_url");
                                if (fallbackUrl != null) {
                                    webView.loadUrl(fallbackUrl);
                                    return true;
                                }
                            }
                        }
                    } catch (Exception ignored) {}
                    return true;
                }

                String path = Uri.parse(url).getPath();
                String lowerPath = path != null ? path.toLowerCase(java.util.Locale.US) : "";
                if (url.contains("export=download") || lowerPath.endsWith(".apk") || lowerPath.endsWith(".pdf")) {
                    String mime = lowerPath.endsWith(".apk") ? "application/vnd.android.package-archive" : "application/pdf";
                    downloadFile(url, webView.getSettings().getUserAgentString(), null, mime);
                    return true;
                }

                return false;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                super.onPageCommitVisible(view, url);
                dismissSplashOverlay();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                hasRetriedOfflineCache = false;
                offlineErrorLayout.setVisibility(View.GONE);
                dismissSplashOverlay();
                super.onPageFinished(view, url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame()) {
                    if (!hasRetriedOfflineCache) {
                        hasRetriedOfflineCache = true;
                        webView.getSettings().setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
                        view.reload();
                    } else if (!isDeviceOnline()) {
                        progressBar.setVisibility(View.GONE);
                        dismissSplashOverlay();
                        offlineErrorLayout.setVisibility(View.VISIBLE);
                    }
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (fileUploadCallback != null) {
                    fileUploadCallback.onReceiveValue(null);
                }
                fileUploadCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                try {
                    fileChooserLauncher.launch(intent);
                } catch (Exception e) {
                    fileUploadCallback = null;
                    Toast.makeText(MainActivity.this, "Cannot open file picker", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                webView.setVisibility(View.GONE);
                pdfNativeContainer.setVisibility(View.GONE);
                customViewContainer.setVisibility(View.VISIBLE);
                customViewContainer.addView(view, new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                ));
                setFullscreenSystemBars(true);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            }

            @Override
            public void onHideCustomView() {
                exitFullscreenVideo();
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                downloadFile(url, userAgent, contentDisposition, mimetype);
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (customView != null) {
                    exitFullscreenVideo();
                    return;
                }

                webView.evaluateJavascript(
                        "window.__closeNoteBaseModalIfOpen ? window.__closeNoteBaseModalIfOpen() : false",
                        value -> {
                            if ("true".equals(value)) {
                                if (pdfNativeContainer != null && pdfNativeContainer.getVisibility() == View.VISIBLE) {
                                    pdfSessionToken++;
                                    pdfNativeContainer.setVisibility(View.GONE);
                                    if (nativePdfViewerView != null) {
                                        nativePdfViewerView.closeDocument();
                                    }
                                }
                                return;
                            }

                            if (pdfNativeContainer != null && pdfNativeContainer.getVisibility() == View.VISIBLE) {
                                pdfSessionToken++;
                                pdfNativeContainer.setVisibility(View.GONE);
                                if (nativePdfViewerView != null) {
                                    nativePdfViewerView.closeDocument();
                                }
                                return;
                            }

                            navigateBackFromWebView();
                        }
                );
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void dismissSplashOverlay() {
        if (splashOverlay == null || splashOverlay.getVisibility() != View.VISIBLE) {
            return;
        }
        splashOverlay.animate()
                .alpha(0f)
                .setDuration(180L)
                .withEndAction(() -> {
                    if (splashOverlay != null) {
                        splashOverlay.setVisibility(View.GONE);
                    }
                })
                .start();
    }

    private boolean isHomeUrl(String url) {
        if (url == null) return true;
        try {
            Uri uri = Uri.parse(url);
            String path = uri.getPath();
            return path == null || path.isEmpty() || "/".equals(path);
        } catch (Exception e) {
            return url.equals(APP_URL) || url.equals(APP_URL + "/");
        }
    }

    private void navigateBackFromWebView() {
        if (webView == null) {
            handleExitPrompt();
            return;
        }
        String currentUrl = webView.getUrl();
        if (isHomeUrl(currentUrl)) {
            handleExitPrompt();
            return;
        }

        // If on /results (or subpage), jump directly back to the Home filter page in 1 press
        if (currentUrl != null && currentUrl.contains("/results")) {
            android.webkit.WebBackForwardList list = webView.copyBackForwardList();
            int currentIdx = list.getCurrentIndex();
            for (int i = currentIdx - 1; i >= 0; i--) {
                String itemUrl = list.getItemAtIndex(i).getUrl();
                if (isHomeUrl(itemUrl)) {
                    webView.goBackOrForward(i - currentIdx);
                    return;
                }
            }
            webView.loadUrl(APP_URL);
            return;
        }

        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            webView.loadUrl(APP_URL);
        }
    }

    private void handleExitPrompt() {
        long now = System.currentTimeMillis();
        if (now - lastBackPressTime < 2000L) {
            finish();
        } else {
            lastBackPressTime = now;
            Toast.makeText(MainActivity.this, "Press back again to exit NoteBase", Toast.LENGTH_SHORT).show();
        }
    }

    private void exitFullscreenVideo() {
        if (customView == null) return;
        customViewContainer.removeView(customView);
        customView = null;
        customViewContainer.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        setFullscreenSystemBars(false);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        if (customViewCallback != null) {
            customViewCallback.onCustomViewHidden();
            customViewCallback = null;
        }
    }

    private void setFullscreenSystemBars(boolean fullscreen) {
        try {
            WindowInsetsControllerCompat controller =
                    WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            if (controller != null) {
                if (fullscreen) {
                    controller.hide(WindowInsetsCompat.Type.systemBars());
                    controller.setSystemBarsBehavior(
                            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    );
                } else {
                    controller.show(WindowInsetsCompat.Type.systemBars());
                }
            }
        } catch (Exception ignored) {}
    }

    private boolean isDeviceOnline() {
        if (connectivityManager == null) return false;
        Network network = connectivityManager.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities caps = connectivityManager.getNetworkCapabilities(network);
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private void updateWebViewCacheMode(boolean online) {
        if (webView == null) return;
        WebSettings settings = webView.getSettings();
        settings.setCacheMode(online ? WebSettings.LOAD_DEFAULT : WebSettings.LOAD_CACHE_ELSE_NETWORK);
    }

    private void registerLiveNetworkMonitor() {
        if (connectivityManager == null || networkCallbackRegistered) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(@NonNull Network network) {
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    updateWebViewCacheMode(true);
                    if (offlineErrorLayout != null && offlineErrorLayout.getVisibility() == View.VISIBLE) {
                        offlineErrorLayout.setVisibility(View.GONE);
                        hasRetriedOfflineCache = false;
                        webView.loadUrl(APP_URL);
                    } else if (webView != null) {
                        webView.evaluateJavascript("window.dispatchEvent(new Event('online'));", null);
                    }
                });
            }

            @Override
            public void onLost(@NonNull Network network) {
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    boolean stillOnline = isDeviceOnline();
                    updateWebViewCacheMode(stillOnline);
                    if (!stillOnline && webView != null) {
                        webView.evaluateJavascript("window.dispatchEvent(new Event('offline'));", null);
                    }
                });
            }
        };
        try {
            connectivityManager.registerDefaultNetworkCallback(networkCallback);
            networkCallbackRegistered = true;
        } catch (Exception ignored) {}
    }

    private void applyPdfOverlayBounds(float leftRatio, float topRatio, float widthRatio, float heightRatio) {
        if (webView == null || pdfNativeContainer == null) return;
        int webW = webView.getWidth();
        int webH = webView.getHeight();
        if (webW <= 0 || webH <= 0) return;

        int leftPx = Math.max(0, Math.round(leftRatio * webW));
        int topPx = Math.max(0, Math.round(topRatio * webH));
        int widthPx = Math.max(1, Math.round(widthRatio * webW));
        int heightPx = Math.max(1, Math.round(heightRatio * webH));

        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) pdfNativeContainer.getLayoutParams();
        if (params.leftMargin != leftPx
                || params.topMargin != topPx
                || params.width != widthPx
                || params.height != heightPx) {
            params.leftMargin = leftPx;
            params.topMargin = topPx;
            params.width = widthPx;
            params.height = heightPx;
            pdfNativeContainer.setLayoutParams(params);
        }
    }

    private void launchYouTubeApp(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return;
        String trimmed = rawUrl.trim();
        String videoId = extractYouTubeVideoId(trimmed);

        if (videoId != null) {
            // Try direct vnd.youtube URI first for instant native player launch
            try {
                Intent appIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("vnd.youtube:" + videoId));
                startActivity(appIntent);
                return;
            } catch (Exception ignored) {}

            // Try package-targeted watch URL
            String watchUrl = "https://www.youtube.com/watch?v=" + videoId;
            try {
                Intent ytIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(watchUrl));
                ytIntent.setPackage("com.google.android.youtube");
                startActivity(ytIntent);
                return;
            } catch (Exception ignored) {}

            // Final fallback: system default handler / browser
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(watchUrl)));
                return;
            } catch (Exception ignored) {}
        } else {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(trimmed)));
                return;
            } catch (Exception ignored) {}
        }
        Toast.makeText(this, "Could not open YouTube link", Toast.LENGTH_SHORT).show();
    }

    public static String extractYouTubeVideoId(String url) {
        if (url == null || url.trim().isEmpty()) return null;
        String trimmed = url.trim();
        if (trimmed.startsWith("vnd.youtube:")) {
            String id = trimmed.substring("vnd.youtube:".length()).split("[?&]")[0];
            return id.length() >= 6 ? id : null;
        }
        Matcher watchMatcher = YT_WATCH_PATTERN.matcher(trimmed);
        if (watchMatcher.find()) {
            return watchMatcher.group(1);
        }
        Matcher pathMatcher = YT_PATH_PATTERN.matcher(trimmed);
        if (pathMatcher.find()) {
            return pathMatcher.group(1);
        }
        return null;
    }

    private void downloadFile(String url, String userAgent, String contentDisposition, String mimetype) {
        try {
            Uri downloadUri = Uri.parse(url);
            DownloadManager.Request request = new DownloadManager.Request(downloadUri);

            String mime = (mimetype != null && !mimetype.isEmpty() && !mimetype.equals("application/octet-stream"))
                    ? mimetype : "application/pdf";
            request.setMimeType(mime);

            if (userAgent != null && !userAgent.isEmpty()) {
                request.addRequestHeader("User-Agent", userAgent);
            }

            String fileName = null;
            String paramFilename = downloadUri.getQueryParameter("filename");
            if (paramFilename == null || paramFilename.trim().isEmpty()) {
                paramFilename = downloadUri.getQueryParameter("title");
            }
            if (paramFilename != null && !paramFilename.trim().isEmpty()) {
                fileName = Uri.decode(paramFilename.trim());
            }

            if (fileName == null || fileName.isEmpty()) {
                fileName = URLUtil.guessFileName(url, contentDisposition, mime);
            }

            fileName = PdfCacheManager.sanitizeDownloadFilename(fileName);
            request.setTitle(fileName);
            request.setDescription("Saving NoteBase document to your device...");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (dm != null) {
                dm.enqueue(request);
                Toast.makeText(this, "Downloading " + fileName + " to Downloads...", Toast.LENGTH_LONG).show();
                return;
            }
        } catch (Exception ignored) {}

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ex) {
            Toast.makeText(this, "Cannot download file", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            updateWebViewCacheMode(isDeviceOnline());
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onDestroy() {
        if (connectivityManager != null && networkCallback != null && networkCallbackRegistered) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {}
            networkCallbackRegistered = false;
        }
        if (nativePdfViewerView != null) {
            nativePdfViewerView.destroy();
        }
        if (pdfCacheManager != null) {
            pdfCacheManager.shutdown();
        }
        ioExecutor.shutdownNow();

        if (webView != null) {
            webView.stopLoading();
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) {
                parent.removeView(webView);
            }
            webView.removeAllViews();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /**
     * Native Android JavascriptInterface bridging offline PDF cache, PdfRenderer zoom viewer,
     * offline Downloads export, and native YouTube launcher to the NoteBase web UI.
     */
    private class NoteBaseBridge {

        @JavascriptInterface
        public void openNativePdf(
                String docId,
                String pdfUrl,
                float leftRatio,
                float topRatio,
                float widthRatio,
                float heightRatio
        ) {
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed() || pdfCacheManager == null || nativePdfViewerView == null) {
                    return;
                }
                final long token = ++pdfSessionToken;
                applyPdfOverlayBounds(leftRatio, topRatio, widthRatio, heightRatio);
                pdfNativeContainer.setVisibility(View.GONE);
                nativePdfViewerView.closeDocument();

                pdfCacheManager.getOrDownloadPdf(docId, pdfUrl, new PdfCacheManager.LoadCallback() {
                    @Override
                    public void onProgress(int percent) {
                        if (token != pdfSessionToken || webView == null) return;
                        webView.evaluateJavascript(
                                "if (window.onNativePdfProgress) { window.onNativePdfProgress("
                                        + JSONObject.quote(docId) + ", " + percent + "); }",
                                null
                        );
                    }

                    @Override
                    public void onSuccess(File pdfFile, boolean fromCache) {
                        if (token != pdfSessionToken || isFinishing() || isDestroyed()) return;
                        nativePdfViewerView.openPdfFile(pdfFile, new NativePdfViewerView.OpenListener() {
                            @Override
                            public void onOpened(int pageCount) {
                                if (token != pdfSessionToken || isFinishing() || isDestroyed()) return;
                                long fileBytes = pdfFile != null && pdfFile.exists() ? pdfFile.length() : 0L;
                                if (pdfCacheManager != null) {
                                    ioExecutor.execute(() -> pdfCacheManager.savePdfMeta(docId, pageCount, fileBytes));
                                }
                                pdfNativeContainer.setVisibility(View.VISIBLE);
                                if (webView != null) {
                                    webView.evaluateJavascript(
                                            "if (window.onNativePdfReady) { window.onNativePdfReady("
                                                    + JSONObject.quote(docId) + ", " + fromCache + ", " + pageCount + ", " + fileBytes + "); }",
                                            null
                                    );
                                }
                            }

                            @Override
                            public void onOpenFailed(String reason) {
                                if (token != pdfSessionToken) return;
                                pdfCacheManager.removePdf(docId);
                                pdfNativeContainer.setVisibility(View.GONE);
                                if (webView != null) {
                                    webView.evaluateJavascript(
                                            "if (window.onNativePdfFallback) { window.onNativePdfFallback("
                                                    + JSONObject.quote(docId) + ", " + JSONObject.quote(reason) + "); }",
                                            null
                                    );
                                }
                            }
                        });
                    }

                    @Override
                    public void onFallbackToWeb(String reason) {
                        if (token != pdfSessionToken) return;
                        pdfNativeContainer.setVisibility(View.GONE);
                        if (webView != null) {
                            webView.evaluateJavascript(
                                    "if (window.onNativePdfFallback) { window.onNativePdfFallback("
                                            + JSONObject.quote(docId) + ", " + JSONObject.quote(reason) + "); }",
                                    null
                            );
                        }
                    }
                });
            });
        }

        @JavascriptInterface
        public void updatePdfBounds(float leftRatio, float topRatio, float widthRatio, float heightRatio) {
            runOnUiThread(() -> applyPdfOverlayBounds(leftRatio, topRatio, widthRatio, heightRatio));
        }

        @JavascriptInterface
        public void closeNativePdf() {
            runOnUiThread(() -> {
                pdfSessionToken++;
                if (pdfNativeContainer != null) {
                    pdfNativeContainer.setVisibility(View.GONE);
                }
                if (nativePdfViewerView != null) {
                    nativePdfViewerView.closeDocument();
                }
            });
        }

        @JavascriptInterface
        public boolean isPdfCachedOnDisk(String docId) {
            return pdfCacheManager != null && pdfCacheManager.isCached(docId);
        }

        @JavascriptInterface
        public String getCachedPdfMeta(String docId) {
            return pdfCacheManager != null ? pdfCacheManager.getCachedPdfMetaJson(docId) : null;
        }

        @JavascriptInterface
        public void removeCachedPdf(String docId) {
            if (pdfCacheManager != null) {
                ioExecutor.execute(() -> pdfCacheManager.removePdf(docId));
            }
        }

        @JavascriptInterface
        public void downloadPdf(String docId, String url, String filename) {
            ioExecutor.execute(() -> {
                boolean exportedOffline = pdfCacheManager != null
                        && pdfCacheManager.isCached(docId)
                        && pdfCacheManager.copyCachedToDownloads(docId, filename);

                runOnUiThread(() -> {
                    if (exportedOffline) {
                        String safeName = PdfCacheManager.sanitizeDownloadFilename(filename);
                        Toast.makeText(MainActivity.this, "Saved " + safeName + " to Downloads", Toast.LENGTH_LONG).show();
                    } else if (url != null && !url.isEmpty()) {
                        String ua = webView != null ? webView.getSettings().getUserAgentString() : null;
                        downloadFile(url, ua, null, "application/pdf");
                    } else {
                        Toast.makeText(MainActivity.this, "Cannot download file offline before opening", Toast.LENGTH_SHORT).show();
                    }
                });
            });
        }

        @JavascriptInterface
        public void openYouTubeVideo(String url) {
            runOnUiThread(() -> launchYouTubeApp(url));
        }

        @JavascriptInterface
        public boolean isNetworkConnected() {
            return isDeviceOnline();
        }
    }
}
