package com.notebase.student;

import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private static final String APP_URL = "https://notebase-sigma.vercel.app";
    private WebView webView;
    private ProgressBar progressBar;
    private FrameLayout customViewContainer;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private ValueCallback<Uri[]> fileUploadCallback;
    private long lastBackPressTime = 0;

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

        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);
        customViewContainer = findViewById(R.id.customViewContainer);

        // Configure WebSettings for optimal performance and PDF view support
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        webSettings.setSupportZoom(true);
        webSettings.setBuiltInZoomControls(true);
        webSettings.setDisplayZoomControls(false);
        webSettings.setMediaPlaybackRequiresUserGesture(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // Cache configuration for fast offline-first loading:
        // Caches HTML, JS, CSS, and opened PDF files in local app storage so subsequent opens are instant
        try {
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            android.net.NetworkInfo netInfo = cm != null ? cm.getActiveNetworkInfo() : null;
            if (netInfo != null && netInfo.isConnected()) {
                webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
            } else {
                webSettings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
            }
        } catch (Exception e) {
            webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
        }

        // Handle WebView Navigation inside App
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                return handleUrlNavigation(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrlNavigation(url);
            }

            private boolean handleUrlNavigation(String url) {
                if (url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("whatsapp:")) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        startActivity(intent);
                        return true;
                    } catch (Exception e) {
                        return true;
                    }
                }

                if (url.startsWith("intent:")) {
                    try {
                        Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                        if (intent != null) {
                            String fallbackUrl = intent.getStringExtra("browser_fallback_url");
                            if (fallbackUrl != null) {
                                webView.loadUrl(fallbackUrl);
                                return true;
                            }
                            try {
                                startActivity(intent);
                            } catch (Exception ignored) {}
                            return true;
                        }
                    } catch (Exception ignored) {}
                    return true;
                }

                // If user clicks a direct drive download link or PDF, initiate direct device download
                if (url.contains("export=download") || url.endsWith(".apk") || url.endsWith(".pdf")) {
                    downloadFile(url, webView.getSettings().getUserAgentString(), null, "application/pdf");
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
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                super.onPageFinished(view, url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
            }
        });

        // WebChromeClient for Progress & File Pickers
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
                customViewContainer.setVisibility(View.VISIBLE);
                customViewContainer.addView(view);
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                customViewContainer.removeView(customView);
                customView = null;
                customViewContainer.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }
            }
        });

        // Direct Download Listener: Downloads cleanly to user's device Downloads/Files folder
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                downloadFile(url, userAgent, contentDisposition, mimetype);
            }
        });

        // Handle modern Back Gesture / Back Button
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (customView != null) {
                    // Exit fullscreen video
                    customViewContainer.removeView(customView);
                    customView = null;
                    customViewContainer.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                    setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                    if (customViewCallback != null) {
                        customViewCallback.onCustomViewHidden();
                        customViewCallback = null;
                    }
                    return;
                }
                if (webView.canGoBack()) {
                    String currentUrl = webView.getUrl();
                    boolean isHome = currentUrl == null || 
                                     currentUrl.equals(APP_URL) || 
                                     currentUrl.equals(APP_URL + "/") || 
                                     currentUrl.endsWith(".vercel.app") || 
                                     currentUrl.endsWith(".vercel.app/");

                    if (isHome) {
                        if (System.currentTimeMillis() - lastBackPressTime < 2000) {
                            finish();
                        } else {
                            lastBackPressTime = System.currentTimeMillis();
                            Toast.makeText(MainActivity.this, "Press back again to exit NoteBase", Toast.LENGTH_SHORT).show();
                        }
                        return;
                    }

                    webView.goBack();
                } else {
                    if (System.currentTimeMillis() - lastBackPressTime < 2000) {
                        finish();
                    } else {
                        lastBackPressTime = System.currentTimeMillis();
                        Toast.makeText(MainActivity.this, "Press back again to exit NoteBase", Toast.LENGTH_SHORT).show();
                    }
                }
            }
        });

        // Load the live NoteBase web application immediately
        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
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
            if (downloadUri != null) {
                String paramFilename = downloadUri.getQueryParameter("filename");
                if (paramFilename == null || paramFilename.trim().isEmpty()) {
                    paramFilename = downloadUri.getQueryParameter("title");
                }
                if (paramFilename != null && !paramFilename.trim().isEmpty()) {
                    fileName = Uri.decode(paramFilename.trim());
                }
            }

            if (fileName == null || fileName.isEmpty()) {
                fileName = URLUtil.guessFileName(url, contentDisposition, mime);
            }

            // Sanitize filename for Android storage and remove forbidden characters
            fileName = fileName.replaceAll("[\\\\/:*?\"<>|]", "_");
            if (!fileName.toLowerCase().endsWith(".pdf") && !fileName.toLowerCase().endsWith(".apk")) {
                fileName = fileName + ".pdf";
            }

            request.setTitle(fileName);
            request.setDescription("Saving NoteBase document to your device...");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

            // Notify Media Scanner so the file is immediately visible in Gallery / File Manager
            try {
                request.allowScanningByMediaScanner();
            } catch (Exception ignored) {}

            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (dm != null) {
                dm.enqueue(request);
                Toast.makeText(this, "Downloading " + fileName + " to phone Downloads...", Toast.LENGTH_LONG).show();
                return;
            }
        } catch (Exception e) {
            // Fallback to external browser if DownloadManager cannot handle the URI directly
        }

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        } catch (Exception ex) {
            Toast.makeText(this, "Cannot download file: " + ex.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }
}
