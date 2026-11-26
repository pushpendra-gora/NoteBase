package com.notebase.student;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.pdf.PdfRenderer;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.util.LruCache;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.widget.OverScroller;

import java.io.File;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Hardware-accelerated native Android PDF viewer backed by PdfRenderer.
 * Features focal-point-locked two-finger pinch zoom, inertial fling scrolling,
 * double-tap zoom, progressive multi-tier bitmap rendering, and strict viewport bounds.
 */
public class NativePdfViewerView extends View {

    public interface OpenListener {
        void onOpened(int pageCount);
        void onOpenFailed(String reason);
    }

    private static final float MIN_SCALE = 1.0f;
    private static final float MAX_SCALE = 4.0f;
    private static final int MAX_RENDER_WIDTH_PX = 1440;
    private static final int MAX_RENDER_HEIGHT_PX = 2040;

    private final ExecutorService renderExecutor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final LruCache<String, Bitmap> bitmapCache;
    private final Set<String> inFlightKeys = new HashSet<>();

    private final ScaleGestureDetector scaleDetector;
    private final GestureDetector gestureDetector;
    private final OverScroller scroller;

    private final Paint bitmapPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Paint pageBgPaint = new Paint();
    private final Paint pageBorderPaint = new Paint();
    private final Paint placeholderPaint = new Paint();
    private final Paint hudBgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint hudTextPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    private final RectF drawRect = new RectF();
    private final RectF hudRect = new RectF();

    private final float density;
    private final float pagePaddingPx;
    private final float pageGapPx;

    // Document metadata owned on UI thread once loaded
    private ParcelFileDescriptor fileDescriptor;
    private PdfRenderer pdfRenderer;
    private int pageCount = 0;
    private int[] pageNaturalWidths = new int[0];
    private int[] pageNaturalHeights = new int[0];

    // Layout coordinates at base scale = 1.0f
    private float[] pageTops = new float[0];
    private float[] pageHeights = new float[0];
    private float basePageWidth = 0f;
    private float totalBaseHeight = 0f;
    private int lastLayoutWidth = 0;

    // Zoom & pan viewport state
    private float scaleFactor = 1.0f;
    private float offsetX = 0f;
    private float offsetY = 0f;
    private boolean isScaling = false;
    private int skipScrollEventsAfterScale = 0;

    // HUD fade visibility
    private boolean showHud = false;
    private final Runnable hideHudRunnable = () -> {
        showHud = false;
        invalidate();
    };

    // High-res re-render debouncer after pinch settles
    private final Runnable settledRerenderRunnable = this::invalidate;

    // Guards against stale callbacks when switching/closing documents
    private long documentGeneration = 0L;
    private volatile boolean isViewDestroyed = false;
    private boolean touchMoved = false;

    public NativePdfViewerView(Context context) {
        super(context);

        this.density = context.getResources().getDisplayMetrics().density;
        this.pagePaddingPx = 8f * density;
        this.pageGapPx = 10f * density;

        // Allocate up to 1/3rd of JVM heap (24 MB - 72 MB) so zoomed ARGB_8888 pages never thrash
        int maxMemKb = (int) (Runtime.getRuntime().maxMemory() / 1024L);
        int cacheSizeKb = Math.min(72 * 1024, Math.max(24 * 1024, maxMemKb / 3));
        this.bitmapCache = new LruCache<String, Bitmap>(cacheSizeKb) {
            @Override
            protected int sizeOf(String key, Bitmap bitmap) {
                return Math.max(1, bitmap.getByteCount() / 1024);
            }
        };

        this.pageBgPaint.setColor(Color.WHITE);
        this.pageBgPaint.setStyle(Paint.Style.FILL);

        this.pageBorderPaint.setColor(Color.parseColor("#CBD5E1"));
        this.pageBorderPaint.setStyle(Paint.Style.STROKE);
        this.pageBorderPaint.setStrokeWidth(Math.max(1f, density));

        this.placeholderPaint.setColor(Color.parseColor("#E2E8F0"));
        this.placeholderPaint.setStyle(Paint.Style.FILL);

        this.hudBgPaint.setColor(Color.argb(195, 15, 23, 42));
        this.hudTextPaint.setColor(Color.WHITE);
        this.hudTextPaint.setTextSize(11.5f * density);
        this.hudTextPaint.setFakeBoldText(true);

        this.scroller = new OverScroller(context);

        this.scaleDetector = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override
            public boolean onScaleBegin(ScaleGestureDetector detector) {
                isScaling = true;
                scroller.forceFinished(true);
                triggerHud();
                return true;
            }

            @Override
            public boolean onScale(ScaleGestureDetector detector) {
                float factor = detector.getScaleFactor();
                if (Float.isNaN(factor) || Float.isInfinite(factor) || factor <= 0f) {
                    return false;
                }

                float prevScale = scaleFactor;
                float nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prevScale * factor));
                if (nextScale >= MAX_SCALE - 0.01f && prevScale >= MAX_SCALE - 0.01f && factor >= 0.985f) {
                    return true;
                }
                if (Math.abs(nextScale - prevScale) < 0.003f) {
                    return true;
                }

                float focusX = detector.getFocusX();
                float focusY = detector.getFocusY();

                // Anchor zoom strictly around the user's two-finger midpoint
                float contentX = (focusX - offsetX) / prevScale;
                float contentY = (focusY - offsetY) / prevScale;

                scaleFactor = nextScale;
                offsetX = focusX - contentX * nextScale;
                offsetY = focusY - contentY * nextScale;

                clampOffsets();
                triggerHud();
                invalidate();
                return true;
            }

            @Override
            public void onScaleEnd(ScaleGestureDetector detector) {
                isScaling = false;
                skipScrollEventsAfterScale = 2;
                mainHandler.removeCallbacks(settledRerenderRunnable);
                mainHandler.postDelayed(settledRerenderRunnable, 120);
            }
        });

        this.gestureDetector = new GestureDetector(context, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onDown(MotionEvent e) {
                scroller.forceFinished(true);
                skipScrollEventsAfterScale = 0;
                return true;
            }

            @Override
            public boolean onScroll(MotionEvent e1, MotionEvent e2, float distanceX, float distanceY) {
                if (isScaling) return false;
                if (skipScrollEventsAfterScale > 0) {
                    skipScrollEventsAfterScale--;
                    return true;
                }
                offsetX -= distanceX;
                offsetY -= distanceY;
                clampOffsets();
                triggerHud();
                invalidate();
                return true;
            }

            @Override
            public boolean onFling(MotionEvent e1, MotionEvent e2, float velocityX, float velocityY) {
                if (isScaling || pageCount == 0) return false;

                int viewW = getWidth();
                int viewH = getHeight();
                float scaledW = viewW * scaleFactor;
                float scaledH = totalBaseHeight * scaleFactor;

                int minX = (int) Math.min(0f, viewW - scaledW);
                int maxX = 0;
                int minY = (int) Math.min(0f, viewH - scaledH);
                int maxY = 0;

                scroller.fling(
                        Math.round(offsetX),
                        Math.round(offsetY),
                        Math.round(velocityX),
                        Math.round(velocityY),
                        minX,
                        maxX,
                        minY,
                        maxY
                );
                triggerHud();
                postInvalidateOnAnimation();
                return true;
            }

            @Override
            public boolean onDoubleTap(MotionEvent e) {
                if (pageCount == 0) return false;
                scroller.forceFinished(true);

                float prevScale = scaleFactor;
                float targetScale = (prevScale > 1.25f) ? 1.0f : 2.25f;

                float tapX = e.getX();
                float tapY = e.getY();
                float contentX = (tapX - offsetX) / prevScale;
                float contentY = (tapY - offsetY) / prevScale;

                scaleFactor = targetScale;
                offsetX = (targetScale == 1.0f) ? 0f : (tapX - contentX * targetScale);
                offsetY = tapY - contentY * targetScale;

                clampOffsets();
                triggerHud();
                invalidate();
                return true;
            }
        });

        setBackgroundColor(Color.parseColor("#F1F5F9"));
    }

    public void openPdfFile(File file, OpenListener listener) {
        if (isViewDestroyed || renderExecutor.isShutdown()) {
            if (listener != null) listener.onOpenFailed("Viewer destroyed");
            return;
        }
        closeDocumentInternal(false);
        final long gen = ++documentGeneration;

        if (file == null || !file.exists()) {
            if (listener != null) listener.onOpenFailed("Cached PDF file missing");
            return;
        }

        try {
            renderExecutor.execute(() -> {
            ParcelFileDescriptor pfd = null;
            PdfRenderer renderer = null;
            try {
                pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
                renderer = new PdfRenderer(pfd);
                int count = renderer.getPageCount();
                if (count <= 0) {
                    renderer.close();
                    pfd.close();
                    mainHandler.post(() -> {
                        if (listener != null) listener.onOpenFailed("Empty PDF document");
                    });
                    return;
                }

                int[] widths = new int[count];
                int[] heights = new int[count];
                for (int i = 0; i < count; i++) {
                    PdfRenderer.Page page = renderer.openPage(i);
                    widths[i] = Math.max(1, page.getWidth());
                    heights[i] = Math.max(1, page.getHeight());
                    page.close();
                }

                final ParcelFileDescriptor finalPfd = pfd;
                final PdfRenderer finalRenderer = renderer;

                mainHandler.post(() -> {
                    if (gen != documentGeneration) {
                        closeQuietlyOnExecutor(finalRenderer, finalPfd);
                        return;
                    }
                    this.fileDescriptor = finalPfd;
                    this.pdfRenderer = finalRenderer;
                    this.pageCount = count;
                    this.pageNaturalWidths = widths;
                    this.pageNaturalHeights = heights;
                    this.scaleFactor = 1.0f;
                    this.offsetX = 0f;
                    this.offsetY = 0f;
                    this.lastLayoutWidth = 0;
                    recomputePageLayout(getWidth());
                    triggerHud();
                    invalidate();
                    if (listener != null) listener.onOpened(count);
                });
            } catch (Exception e) {
                closeQuietly(renderer, pfd);
                mainHandler.post(() -> {
                    if (gen == documentGeneration && listener != null) {
                        listener.onOpenFailed(e.getMessage() != null ? e.getMessage() : "Unable to parse PDF");
                    }
                });
            }
        });
        } catch (java.util.concurrent.RejectedExecutionException ignored) {}
    }

    public void closeDocument() {
        closeDocumentInternal(true);
    }

    private void closeDocumentInternal(boolean invalidateView) {
        documentGeneration++;
        mainHandler.removeCallbacks(hideHudRunnable);
        mainHandler.removeCallbacks(settledRerenderRunnable);
        scroller.forceFinished(true);

        final PdfRenderer rendererToClose = this.pdfRenderer;
        final ParcelFileDescriptor pfdToClose = this.fileDescriptor;

        this.pdfRenderer = null;
        this.fileDescriptor = null;
        this.pageCount = 0;
        this.pageNaturalWidths = new int[0];
        this.pageNaturalHeights = new int[0];
        this.pageTops = new float[0];
        this.pageHeights = new float[0];
        this.scaleFactor = 1.0f;
        this.offsetX = 0f;
        this.offsetY = 0f;
        this.inFlightKeys.clear();
        this.bitmapCache.evictAll();

        closeQuietlyOnExecutor(rendererToClose, pfdToClose);

        if (invalidateView) {
            invalidate();
        }
    }

    public void destroy() {
        isViewDestroyed = true;
        closeDocumentInternal(false);
        renderExecutor.shutdownNow();
    }

    private void closeQuietlyOnExecutor(PdfRenderer r, ParcelFileDescriptor pfd) {
        if (r == null && pfd == null) return;
        if (isViewDestroyed || renderExecutor.isShutdown()) {
            closeQuietly(r, pfd);
            return;
        }
        try {
            renderExecutor.execute(() -> closeQuietly(r, pfd));
        } catch (java.util.concurrent.RejectedExecutionException e) {
            closeQuietly(r, pfd);
        }
    }

    private static void closeQuietly(PdfRenderer r, ParcelFileDescriptor pfd) {
        try {
            if (r != null) r.close();
        } catch (Exception ignored) {}
        try {
            if (pfd != null) pfd.close();
        } catch (Exception ignored) {}
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        if (w > 0 && w != lastLayoutWidth && pageCount > 0) {
            if (oldw > 0 && w != oldw) {
                inFlightKeys.clear();
                bitmapCache.evictAll();
            }
            recomputePageLayout(w);
            clampOffsets();
            invalidate();
        }
    }

    private void recomputePageLayout(int viewWidth) {
        if (viewWidth <= 0 || pageCount == 0) return;
        lastLayoutWidth = viewWidth;
        basePageWidth = Math.max(100f, viewWidth - 2f * pagePaddingPx);

        pageTops = new float[pageCount];
        pageHeights = new float[pageCount];

        float y = pageGapPx;
        for (int i = 0; i < pageCount; i++) {
            float aspect = (float) pageNaturalHeights[i] / (float) pageNaturalWidths[i];
            float h = basePageWidth * aspect;
            pageTops[i] = y;
            pageHeights[i] = h;
            y += h + pageGapPx;
        }
        totalBaseHeight = y;
    }

    private void clampOffsets() {
        int viewW = getWidth();
        int viewH = getHeight();
        if (viewW <= 0 || viewH <= 0) return;

        float scaledW = viewW * scaleFactor;
        if (scaledW <= viewW) {
            offsetX = 0f;
        } else {
            float minX = viewW - scaledW;
            offsetX = Math.max(minX, Math.min(0f, offsetX));
        }

        float scaledH = totalBaseHeight * scaleFactor;
        if (scaledH <= viewH) {
            offsetY = 0f;
        } else {
            float minY = viewH - scaledH;
            offsetY = Math.max(minY, Math.min(0f, offsetY));
        }
    }

    @Override
    public void computeScroll() {
        if (scroller.computeScrollOffset()) {
            offsetX = scroller.getCurrX();
            offsetY = scroller.getCurrY();
            clampOffsets();
            postInvalidateOnAnimation();
        }
    }

    @Override
    public boolean performClick() {
        return super.performClick();
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (getParent() != null) {
            getParent().requestDisallowInterceptTouchEvent(true);
        }
        int action = event.getActionMasked();
        if (action == MotionEvent.ACTION_DOWN) {
            touchMoved = false;
        } else if (action == MotionEvent.ACTION_MOVE || action == MotionEvent.ACTION_POINTER_DOWN) {
            touchMoved = true;
        } else if (action == MotionEvent.ACTION_UP && !touchMoved && !isScaling) {
            performClick();
        }
        boolean handled = scaleDetector.onTouchEvent(event);
        if (!scaleDetector.isInProgress()) {
            handled = gestureDetector.onTouchEvent(event) || handled;
        }
        return handled || super.onTouchEvent(event);
    }

    private int getCurrentResolutionTier() {
        if (scaleFactor <= 1.35f) return 1;
        if (scaleFactor <= 2.35f) return 2;
        return 3;
    }

    private float getTierMultiplier(int tier) {
        switch (tier) {
            case 1: return 1.35f;
            case 2: return 2.25f;
            default: return 3.2f;
        }
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (pageCount == 0 || pageTops.length != pageCount) {
            return;
        }
        if (lastLayoutWidth != getWidth()) {
            recomputePageLayout(getWidth());
        }

        int viewW = getWidth();
        int viewH = getHeight();
        int desiredTier = getCurrentResolutionTier();

        // Visible vertical range in unscaled base coordinates
        float visTop = Math.max(0f, -offsetY / scaleFactor);
        float visBottom = (viewH - offsetY) / scaleFactor;

        int firstVisiblePage = -1;

        for (int i = 0; i < pageCount; i++) {
            float pageTop = pageTops[i];
            float pageH = pageHeights[i];
            float pageBottom = pageTop + pageH;

            if (pageBottom < visTop - viewH * 0.25f) {
                continue;
            }
            if (pageTop > visBottom + viewH * 0.25f) {
                break;
            }

            if (firstVisiblePage == -1 && pageBottom >= visTop) {
                firstVisiblePage = i + 1;
            }

            float left = offsetX + pagePaddingPx * scaleFactor;
            float top = offsetY + pageTop * scaleFactor;
            float right = left + basePageWidth * scaleFactor;
            float bottom = top + pageH * scaleFactor;

            drawRect.set(left, top, right, bottom);
            canvas.drawRect(drawRect, pageBgPaint);

            Bitmap bmp = findBestCachedBitmap(i, desiredTier);
            if (bmp != null && !bmp.isRecycled()) {
                canvas.drawBitmap(bmp, null, drawRect, bitmapPaint);
            } else {
                canvas.drawRect(drawRect, placeholderPaint);
            }
            canvas.drawRect(drawRect, pageBorderPaint);

            // While actively pinching, reuse cached bitmaps for 60fps zero-flicker scaling;
            // only request new high-res tiles after gesture settles (or if page has no bitmap at all)
            String desiredKey = i + "_" + desiredTier;
            if (bmp == null) {
                requestPageRender(i, 1);
            } else if (!isScaling && bitmapCache.get(desiredKey) == null) {
                requestPageRender(i, desiredTier);
            }
        }

        // Pre-render 1 upcoming page cleanly only at base zoom and when cache has headroom
        if (!isScaling && desiredTier == 1 && firstVisiblePage > 0 && firstVisiblePage < pageCount) {
            String nextKey = firstVisiblePage + "_1";
            if (bitmapCache.get(nextKey) == null) {
                requestPageRender(firstVisiblePage, 1);
            }
        }

        // Non-intrusive Page & Zoom Pill at bottom-right
        if (showHud && firstVisiblePage > 0) {
            int pct = Math.round(scaleFactor * 100f);
            String label = pct > 102
                    ? ("Page " + firstVisiblePage + " / " + pageCount + "  •  " + pct + "%")
                    : ("Page " + firstVisiblePage + " / " + pageCount);

            float textW = hudTextPaint.measureText(label);
            Paint.FontMetrics fm = hudTextPaint.getFontMetrics();
            float textH = fm.descent - fm.ascent;
            float padH = 11f * density;
            float padV = 6f * density;
            float margin = 12f * density;

            float pillW = textW + padH * 2f;
            float pillH = textH + padV * 2f;
            hudRect.set(viewW - margin - pillW, viewH - margin - pillH, viewW - margin, viewH - margin);
            canvas.drawRoundRect(hudRect, pillH / 2f, pillH / 2f, hudBgPaint);
            canvas.drawText(label, hudRect.left + padH, hudRect.top + padV - fm.ascent, hudTextPaint);
        }
    }

    private Bitmap findBestCachedBitmap(int pageIndex, int desiredTier) {
        Bitmap exact = bitmapCache.get(pageIndex + "_" + desiredTier);
        if (exact != null && !exact.isRecycled()) return exact;

        for (int t = 3; t >= 1; t--) {
            if (t == desiredTier) continue;
            Bitmap fallback = bitmapCache.get(pageIndex + "_" + t);
            if (fallback != null && !fallback.isRecycled()) return fallback;
        }
        return null;
    }

    private void requestPageRender(final int pageIndex, final int tier) {
        if (isViewDestroyed || renderExecutor.isShutdown()) return;
        final String key = pageIndex + "_" + tier;
        if (inFlightKeys.contains(key)) return;
        final PdfRenderer renderer = this.pdfRenderer;
        if (renderer == null || basePageWidth <= 0f) return;

        final long gen = this.documentGeneration;
        inFlightKeys.add(key);

        final float mult = getTierMultiplier(tier);
        int targetW = Math.max(120, Math.round(basePageWidth * mult));
        float aspect = (float) pageNaturalHeights[pageIndex] / (float) pageNaturalWidths[pageIndex];
        int targetH = Math.max(120, Math.round(targetW * aspect));

        if (targetW > MAX_RENDER_WIDTH_PX) {
            float ratio = (float) MAX_RENDER_WIDTH_PX / targetW;
            targetW = MAX_RENDER_WIDTH_PX;
            targetH = Math.max(120, Math.round(targetH * ratio));
        }
        if (targetH > MAX_RENDER_HEIGHT_PX) {
            float ratio = (float) MAX_RENDER_HEIGHT_PX / targetH;
            targetH = MAX_RENDER_HEIGHT_PX;
            targetW = Math.max(120, Math.round(targetW * ratio));
        }

        final int bmpW = targetW;
        final int bmpH = targetH;

        try {
            renderExecutor.execute(() -> {
            if (gen != documentGeneration || pdfRenderer != renderer) {
                mainHandler.post(() -> inFlightKeys.remove(key));
                return;
            }
            Bitmap bmp = null;
            PdfRenderer.Page page = null;
            try {
                // PdfRenderer strictly requires ARGB_8888 (RGB_565 throws IllegalArgumentException)
                bmp = Bitmap.createBitmap(bmpW, bmpH, Bitmap.Config.ARGB_8888);
                bmp.eraseColor(Color.WHITE);
                page = renderer.openPage(pageIndex);
                page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            } catch (Throwable t) {
                if (bmp != null && !bmp.isRecycled()) {
                    bmp.recycle();
                }
                bmp = null;
            } finally {
                if (page != null) {
                    try {
                        page.close();
                    } catch (Exception ignored) {}
                }
            }

            final Bitmap rendered = bmp;
            mainHandler.post(() -> {
                inFlightKeys.remove(key);
                if (gen == documentGeneration && rendered != null && !rendered.isRecycled()) {
                    bitmapCache.put(key, rendered);
                    invalidate();
                } else if (rendered != null && !rendered.isRecycled()) {
                    rendered.recycle();
                }
            });
        });
        } catch (java.util.concurrent.RejectedExecutionException e) {
            inFlightKeys.remove(key);
        }
    }

    private void triggerHud() {
        showHud = true;
        mainHandler.removeCallbacks(hideHudRunnable);
        mainHandler.postDelayed(hideHudRunnable, 1800);
    }
}
