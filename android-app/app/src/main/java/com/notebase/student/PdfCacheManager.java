package com.notebase.student;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Thread-safe native disk cache for NoteBase PDFs.
 * Downloads verified PDF bytes to app-private storage so repeated opens work
 * instantaneously and 100% offline, with automatic LRU size management and server-sync deletion.
 */
public class PdfCacheManager {

    public interface LoadCallback {
        void onProgress(int percent);
        void onSuccess(File pdfFile, boolean fromCache);
        void onFallbackToWeb(String reason);
    }

    private static final long MAX_CACHE_BYTES = 350L * 1024L * 1024L; // 350 MB cap
    private static final int CONNECT_TIMEOUT_MS = 12_000;
    private static final int READ_TIMEOUT_MS = 25_000;
    private static final int MAX_REDIRECTS = 6;

    private static final Pattern DRIVE_FILE_D_PATTERN = Pattern.compile("/file/d/([a-zA-Z0-9_-]+)");
    private static final Pattern DRIVE_ID_QUERY_PATTERN = Pattern.compile("[?&]id=([a-zA-Z0-9_-]+)");
    private static final Pattern GDRIVE_SCHEME_PATTERN = Pattern.compile("^gdrive://([a-zA-Z0-9_-]+)");
    private static final Pattern CONFIRM_PARAM_PATTERN = Pattern.compile("confirm=([a-zA-Z0-9_-]+)");
    private static final Pattern INPUT_TAG_PATTERN = Pattern.compile("<input\\b([^>]*)>", Pattern.CASE_INSENSITIVE);
    private static final Pattern NAME_ATTR_PATTERN = Pattern.compile("\\bname\\s*=\\s*[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);
    private static final Pattern VALUE_ATTR_PATTERN = Pattern.compile("\\bvalue\\s*=\\s*[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);

    private final Context appContext;
    private final File cacheDir;
    private final ExecutorService downloadExecutor;
    private final Handler mainHandler;
    private final ConcurrentHashMap<String, Boolean> activeDownloads = new ConcurrentHashMap<>();

    public PdfCacheManager(Context context) {
        this.appContext = context.getApplicationContext();
        this.cacheDir = new File(appContext.getFilesDir(), "pdf_cache");
        if (!this.cacheDir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            this.cacheDir.mkdirs();
        }
        this.downloadExecutor = Executors.newFixedThreadPool(2);
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    public static String sanitizeDocId(String docId) {
        if (docId == null || docId.trim().isEmpty()) {
            return "unknown_doc";
        }
        return docId.trim().replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    public static String extractGoogleDriveFileId(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return null;
        String trimmed = rawUrl.trim();

        Matcher gdriveMatcher = GDRIVE_SCHEME_PATTERN.matcher(trimmed);
        if (gdriveMatcher.find()) {
            return gdriveMatcher.group(1);
        }

        Matcher fileMatcher = DRIVE_FILE_D_PATTERN.matcher(trimmed);
        if (fileMatcher.find()) {
            return fileMatcher.group(1);
        }

        if (trimmed.contains("drive.google.com") || trimmed.contains("drive.usercontent.google.com")) {
            Matcher idMatcher = DRIVE_ID_QUERY_PATTERN.matcher(trimmed);
            if (idMatcher.find()) {
                return idMatcher.group(1);
            }
        }
        return null;
    }

    public static String resolveDirectDownloadUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return null;
        String driveId = extractGoogleDriveFileId(rawUrl);
        if (driveId != null) {
            return "https://drive.usercontent.google.com/download?id=" + driveId + "&export=download&confirm=t";
        }
        return rawUrl.trim();
    }

    public File getCachedFile(String docId) {
        return new File(cacheDir, sanitizeDocId(docId) + ".pdf");
    }

    public boolean isCached(String docId) {
        File file = getCachedFile(docId);
        return file.exists() && file.length() > 100 && hasPdfHeader(file);
    }

    public boolean removePdf(String docId) {
        if (docId == null || docId.isEmpty()) return false;
        File file = getCachedFile(docId);
        File tmpFile = new File(cacheDir, sanitizeDocId(docId) + ".tmp");
        if (tmpFile.exists()) {
            //noinspection ResultOfMethodCallIgnored
            tmpFile.delete();
        }
        if (file.exists()) {
            return file.delete();
        }
        return false;
    }

    public void getOrDownloadPdf(String docId, String rawUrl, LoadCallback callback) {
        if (docId == null || docId.trim().isEmpty()) {
            postFallback(callback, "Missing document ID");
            return;
        }

        File cached = getCachedFile(docId);
        if (cached.exists() && cached.length() > 100 && hasPdfHeader(cached)) {
            // Update LRU timestamp cleanly on access
            //noinspection ResultOfMethodCallIgnored
            cached.setLastModified(System.currentTimeMillis());
            postSuccess(callback, cached, true);
            return;
        } else if (cached.exists()) {
            // Clean up any invalid/partial file
            //noinspection ResultOfMethodCallIgnored
            cached.delete();
        }

        String resolvedUrl = resolveDirectDownloadUrl(rawUrl);
        if (resolvedUrl == null || resolvedUrl.isEmpty()) {
            postFallback(callback, "No downloadable PDF URL available");
            return;
        }

        if (activeDownloads.putIfAbsent(docId, Boolean.TRUE) != null) {
            // Poll briefly or wait on executor behind existing download
            downloadExecutor.execute(() -> {
                int attempts = 0;
                while (activeDownloads.containsKey(docId) && attempts < 60) {
                    try {
                        Thread.sleep(200);
                    } catch (InterruptedException ignored) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                    attempts++;
                }
                if (isCached(docId)) {
                    postSuccess(callback, getCachedFile(docId), true);
                } else {
                    postFallback(callback, "Concurrent PDF download did not finish");
                }
            });
            return;
        }

        downloadExecutor.execute(() -> {
            try {
                File result = downloadToCacheBlocking(docId, rawUrl, resolvedUrl, callback);
                if (result != null && result.exists() && hasPdfHeader(result)) {
                    evictIfExceedsCap();
                    postSuccess(callback, result, false);
                } else {
                    postFallback(callback, "Remote response was not a direct PDF binary");
                }
            } catch (Exception e) {
                postFallback(callback, e.getMessage() != null ? e.getMessage() : "Download error");
            } finally {
                activeDownloads.remove(docId);
            }
        });
    }

    private File downloadToCacheBlocking(String docId, String originalUrl, String primaryUrl, LoadCallback callback) {
        String safeId = sanitizeDocId(docId);
        File targetFile = new File(cacheDir, safeId + ".pdf");
        File tempFile = new File(cacheDir, safeId + ".tmp");

        String driveId = extractGoogleDriveFileId(originalUrl);
        String[] candidates = driveId != null
                ? new String[]{
                        primaryUrl,
                        "https://drive.google.com/uc?export=download&id=" + driveId + "&confirm=t"
                }
                : new String[]{primaryUrl};

        for (String candidateUrl : candidates) {
            if (tryDownloadUrl(candidateUrl, tempFile, targetFile, driveId, callback)) {
                return targetFile;
            }
        }

        if (tempFile.exists()) {
            //noinspection ResultOfMethodCallIgnored
            tempFile.delete();
        }
        return null;
    }

    private boolean tryDownloadUrl(
            String startUrl,
            File tempFile,
            File targetFile,
            String driveId,
            LoadCallback callback
    ) {
        HttpURLConnection conn = null;
        try {
            String currentUrl = startUrl;
            for (int redirectCount = 0; redirectCount < MAX_REDIRECTS; redirectCount++) {
                URL url = new URL(currentUrl);
                conn = (HttpURLConnection) url.openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
                conn.setReadTimeout(READ_TIMEOUT_MS);
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36");

                int status = conn.getResponseCode();
                if (status == HttpURLConnection.HTTP_MOVED_PERM
                        || status == HttpURLConnection.HTTP_MOVED_TEMP
                        || status == 303
                        || status == 307
                        || status == 308) {
                    String location = conn.getHeaderField("Location");
                    conn.disconnect();
                    conn = null;
                    if (location == null || location.isEmpty()) return false;
                    currentUrl = new URL(url, location).toString();
                    continue;
                }

                if (status < 200 || status >= 300) {
                    conn.disconnect();
                    conn = null;
                    return false;
                }

                String contentType = conn.getContentType();
                long contentLength = conn.getContentLengthLong();

                // Read first chunk to inspect whether server returned PDF or Google Drive virus-scan HTML confirm form
                try (InputStream rawIn = new BufferedInputStream(conn.getInputStream())) {
                    byte[] headerBuf = new byte[4096];
                    int firstRead = rawIn.read(headerBuf);
                    if (firstRead <= 0) {
                        return false;
                    }

                    if (!containsPdfSignature(headerBuf, firstRead)) {
                        // Might be Google Drive confirmation HTML page
                        if (driveId != null && (contentType == null || contentType.contains("html"))) {
                            ByteArrayOutputStream htmlOut = new ByteArrayOutputStream();
                            htmlOut.write(headerBuf, 0, firstRead);
                            byte[] restBuf = new byte[4096];
                            int r;
                            int totalHtml = firstRead;
                            while (totalHtml < 128 * 1024 && (r = rawIn.read(restBuf)) != -1) {
                                htmlOut.write(restBuf, 0, r);
                                totalHtml += r;
                            }
                            String html = htmlOut.toString(StandardCharsets.UTF_8.name());
                            String confirmUrl = extractDriveConfirmUrl(html, driveId);
                            if (confirmUrl != null && !confirmUrl.equals(currentUrl)) {
                                conn.disconnect();
                                conn = null;
                                currentUrl = confirmUrl;
                                continue;
                            }
                        }
                        return false;
                    }

                    // Verified PDF stream: write atomically to tempFile
                    if (tempFile.exists()) {
                        //noinspection ResultOfMethodCallIgnored
                        tempFile.delete();
                    }

                    try (FileOutputStream out = new FileOutputStream(tempFile)) {
                        out.write(headerBuf, 0, firstRead);
                        long totalWritten = firstRead;
                        int lastReportedPct = 0;

                        byte[] buf = new byte[16 * 1024];
                        int n;
                        while ((n = rawIn.read(buf)) != -1) {
                            out.write(buf, 0, n);
                            totalWritten += n;
                            if (contentLength > 0) {
                                int pct = (int) Math.min(99, (totalWritten * 100L) / contentLength);
                                if (pct - lastReportedPct >= 5) {
                                    lastReportedPct = pct;
                                    postProgress(callback, pct);
                                }
                            }
                        }
                        out.getFD().sync();
                    }

                    if (targetFile.exists()) {
                        //noinspection ResultOfMethodCallIgnored
                        targetFile.delete();
                    }
                    if (tempFile.renameTo(targetFile)) {
                        postProgress(callback, 100);
                        return true;
                    }
                    return false;
                }
            }
            return false;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private String extractDriveConfirmUrl(String html, String driveId) {
        if (html == null || html.isEmpty()) return null;

        String confirm = "t";
        String uuid = null;
        String authToken = null;

        Matcher inputMatcher = INPUT_TAG_PATTERN.matcher(html);
        while (inputMatcher.find()) {
            String attrs = inputMatcher.group(1);
            if (attrs == null) continue;
            Matcher nm = NAME_ATTR_PATTERN.matcher(attrs);
            Matcher vm = VALUE_ATTR_PATTERN.matcher(attrs);
            if (nm.find() && vm.find()) {
                String name = nm.group(1);
                String val = vm.group(1);
                if ("confirm".equalsIgnoreCase(name)) {
                    confirm = val;
                } else if ("uuid".equalsIgnoreCase(name)) {
                    uuid = val;
                } else if ("at".equalsIgnoreCase(name)) {
                    authToken = val;
                }
            }
        }

        if ("t".equals(confirm)) {
            Matcher cpm = CONFIRM_PARAM_PATTERN.matcher(html);
            if (cpm.find()) {
                confirm = cpm.group(1);
            }
        }

        if (uuid != null && !uuid.isEmpty()) {
            String url = "https://drive.usercontent.google.com/download?id=" + driveId
                    + "&export=download&confirm=" + Uri.encode(confirm) + "&uuid=" + Uri.encode(uuid);
            if (authToken != null && !authToken.isEmpty()) {
                url += "&at=" + Uri.encode(authToken);
            }
            return url;
        }
        return null;
    }

    public static boolean containsPdfSignature(byte[] buffer, int length) {
        int limit = Math.min(length, 1024) - 4;
        for (int i = 0; i <= limit; i++) {
            if (buffer[i] == 0x25 && buffer[i + 1] == 0x50 && buffer[i + 2] == 0x44 && buffer[i + 3] == 0x46) {
                return true;
            }
        }
        return false;
    }

    public static boolean hasPdfHeader(File file) {
        if (file == null || !file.exists() || file.length() < 5) return false;
        byte[] buf = new byte[1024];
        try (FileInputStream in = new FileInputStream(file)) {
            int read = in.read(buf);
            return read >= 4 && containsPdfSignature(buf, read);
        } catch (IOException e) {
            return false;
        }
    }

    private void evictIfExceedsCap() {
        File[] files = cacheDir.listFiles((dir, name) -> name.endsWith(".pdf"));
        if (files == null || files.length == 0) return;

        long totalBytes = 0;
        for (File f : files) {
            totalBytes += f.length();
        }
        if (totalBytes <= MAX_CACHE_BYTES) return;

        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (File f : files) {
            if (totalBytes <= MAX_CACHE_BYTES) break;
            long len = f.length();
            if (f.delete()) {
                totalBytes -= len;
            }
        }
    }

    /**
     * Exports an offline-cached PDF directly into the device's Downloads folder without any network request.
     */
    public boolean copyCachedToDownloads(String docId, String desiredFileName) {
        File cached = getCachedFile(docId);
        if (!cached.exists() || !hasPdfHeader(cached)) {
            return false;
        }

        String safeName = sanitizeDownloadFilename(desiredFileName);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = appContext.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
            values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
            values.put(MediaStore.Downloads.IS_PENDING, 1);

            Uri itemUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (itemUri == null) return false;

            try (InputStream in = new FileInputStream(cached);
                 OutputStream out = resolver.openOutputStream(itemUri)) {
                if (out == null) return false;
                byte[] buf = new byte[16 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                }
                out.flush();
            } catch (IOException e) {
                resolver.delete(itemUri, null, null);
                return false;
            }

            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(itemUri, values, null, null);
            return true;
        } else {
            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!downloadsDir.exists()) {
                //noinspection ResultOfMethodCallIgnored
                downloadsDir.mkdirs();
            }
            File dest = new File(downloadsDir, safeName);
            try (InputStream in = new FileInputStream(cached);
                 OutputStream out = new FileOutputStream(dest)) {
                byte[] buf = new byte[16 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                }
                out.flush();
                MediaScannerConnection.scanFile(appContext, new String[]{dest.getAbsolutePath()}, new String[]{"application/pdf"}, null);
                return true;
            } catch (IOException e) {
                return false;
            }
        }
    }

    public static String sanitizeDownloadFilename(String rawName) {
        String name = (rawName == null || rawName.trim().isEmpty()) ? "NoteBase_Document.pdf" : rawName.trim();
        name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (!name.toLowerCase(Locale.US).endsWith(".pdf")) {
            name = name + ".pdf";
        }
        return name;
    }

    public void shutdown() {
        downloadExecutor.shutdownNow();
    }

    private void postProgress(LoadCallback callback, int pct) {
        if (callback == null) return;
        mainHandler.post(() -> callback.onProgress(pct));
    }

    private void postSuccess(LoadCallback callback, File file, boolean fromCache) {
        if (callback == null) return;
        mainHandler.post(() -> callback.onSuccess(file, fromCache));
    }

    private void postFallback(LoadCallback callback, String reason) {
        if (callback == null) return;
        mainHandler.post(() -> callback.onFallbackToWeb(reason));
    }
}
