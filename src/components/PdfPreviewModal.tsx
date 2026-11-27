'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, Loader2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { normalizeSafeEmbedUrl } from '../lib/urlSafety';
import { detectPreviewFileCategory } from '../lib/fileValidation';
import {
  getOfflineFileBlob,
  isAndroidStudentApp,
  isDeviceOffline,
  markDocAsCachedOffline,
  saveOfflineFileBlob,
} from '../lib/offlineCache';

export interface PdfPreviewDoc {
  id: string;
  title: string;
  type: 'Notes' | 'PYQ' | 'PYQs' | 'Lectures' | string;
  subtitle: string;
  file_url?: string;
  file_path?: string;
  missingAttachmentMessage?: string;
}

interface PdfPreviewModalProps {
  doc: PdfPreviewDoc | null;
  isCached?: boolean;
  onClose: () => void;
  onDownload?: () => void;
  onNativeReady?: (
    docId: string,
    fromCache?: boolean,
    pageCount?: number,
    fileSizeBytes?: number
  ) => void;
  onWebLoaded?: (docId: string) => void;
}

function getAndroidBridge(): any {
  if (typeof window !== 'undefined' && (window as any).NoteBaseAndroid) {
    return (window as any).NoteBaseAndroid;
  }
  return null;
}

function resolveRawPdfSourceUrl(doc: PdfPreviewDoc): string {
  const candidate = doc.file_url || doc.file_path || '';
  return normalizeSafeEmbedUrl(candidate) || '';
}

function extractGoogleDriveId(url?: string): string | null {
  if (!url) return null;
  const gdriveProtocol = url.match(/^gdrive:\/\/([a-zA-Z0-9_-]+)/);
  if (gdriveProtocol?.[1]) return gdriveProtocol[1];
  const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch?.[1]) return driveMatch[1];
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch?.[1] && url.includes('drive.google.com')) return idMatch[1];
  return null;
}

function getPdfEmbedUrl(url?: string): string {
  if (!url) return '';
  const driveId = extractGoogleDriveId(url);
  if (driveId) {
    return `https://drive.google.com/file/d/${driveId}/preview`;
  }
  return normalizeSafeEmbedUrl(url) || '';
}

export default function PdfPreviewModal({
  doc,
  isCached = false,
  onClose,
  onDownload,
  onNativeReady,
  onWebLoaded,
}: PdfPreviewModalProps) {
  const [useWebPdfFallback, setUseWebPdfFallback] = useState(false);
  const [isIframeLoading, setIsIframeLoading] = useState(true);
  const [nativePdfProgress, setNativePdfProgress] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [imageFallbackStep, setImageFallbackStep] = useState(0);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [offlineBlobUrl, setOfflineBlobUrl] = useState<string | null>(null);

  const fileCategory = useMemo(
    () => (doc ? detectPreviewFileCategory(doc.title, doc.file_url, doc.file_path) : 'pdf'),
    [doc?.title, doc?.file_url, doc?.file_path]
  );

  const rawSourceUrl = useMemo(() => (doc ? resolveRawPdfSourceUrl(doc) : ''), [doc]);
  const driveFileId = useMemo(
    () => extractGoogleDriveId(doc?.file_url || doc?.file_path || rawSourceUrl),
    [doc?.file_url, doc?.file_path, rawSourceUrl]
  );

  const imageCandidates = useMemo(() => {
    if (fileCategory !== 'image') return [];
    if (driveFileId) {
      return [
        `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w2400`,
        `https://drive.google.com/uc?export=view&id=${driveFileId}`,
        `/api/preview-file?mode=image&url=${encodeURIComponent(rawSourceUrl || doc?.file_url || doc?.file_path || '')}`,
      ];
    }
    return rawSourceUrl ? [rawSourceUrl] : [];
  }, [fileCategory, driveFileId, rawSourceUrl, doc?.file_url, doc?.file_path]);

  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const isPinchingRef = useRef(false);
  const initialTouchDistRef = useRef(0);
  const initialTouchZoomRef = useRef(100);
  const zoomLevelFloatRef = useRef(100);
  const lastTouchPosRef = useRef({ x: 0, y: 0 });
  const lastTapTimeRef = useRef(0);

  const onNativeReadyRef = useRef(onNativeReady);
  onNativeReadyRef.current = onNativeReady;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!doc || typeof window === 'undefined') return;
    const prevModalHandler = (window as any).__closeNoteBaseModalIfOpen;
    const prevPdfHandler = (window as any).__closeNoteBasePdfIfOpen;

    const closeThisPdf = () => {
      try {
        getAndroidBridge()?.closeNativePdf?.();
      } catch {}
      onCloseRef.current();
      return true;
    };

    if (!prevModalHandler) {
      (window as any).__closeNoteBaseModalIfOpen = closeThisPdf;
    }
    if (!prevPdfHandler) {
      (window as any).__closeNoteBasePdfIfOpen = closeThisPdf;
    }

    return () => {
      if (!prevModalHandler) {
        delete (window as any).__closeNoteBaseModalIfOpen;
      }
      if (!prevPdfHandler) {
        delete (window as any).__closeNoteBasePdfIfOpen;
      }
    };
  }, [doc]);

  const getTouchesDistance = (e: React.TouchEvent) => {
    if (e.touches.length < 2) return 0;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handlePdfTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      isPinchingRef.current = true;
      initialTouchDistRef.current = getTouchesDistance(e);
      initialTouchZoomRef.current = zoomLevelFloatRef.current;
    } else if (e.touches.length === 1) {
      isPinchingRef.current = false;
      lastTouchPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      const now = Date.now();
      if (now - lastTapTimeRef.current < 300) {
        setZoomLevel((prev) => {
          const next = prev === 100 ? 175 : 100;
          zoomLevelFloatRef.current = next;
          if (next === 100) setPanPosition({ x: 0, y: 0 });
          return next;
        });
        lastTapTimeRef.current = 0;
      } else {
        lastTapTimeRef.current = now;
      }
    }
  };

  const handlePdfTouchMove = (e: React.TouchEvent) => {
    if (isPinchingRef.current && e.touches.length === 2 && initialTouchDistRef.current > 0) {
      const currentDist = getTouchesDistance(e);
      const ratio = currentDist / initialTouchDistRef.current;
      const target = Math.min(300, Math.max(100, Math.round(initialTouchZoomRef.current * ratio)));
      zoomLevelFloatRef.current = target;
      setZoomLevel(target);
      if (target === 100) {
        setPanPosition({ x: 0, y: 0 });
      }
    } else if (!isPinchingRef.current && e.touches.length === 1) {
      const currentZoom = zoomLevelFloatRef.current;
      if (currentZoom <= 100) {
        return;
      }
      const deltaX = e.touches[0].clientX - lastTouchPosRef.current.x;
      const deltaY = e.touches[0].clientY - lastTouchPosRef.current.y;
      lastTouchPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      const maxPanX = Math.max(0, ((currentZoom - 100) / 100) * 220);
      const maxPanY = Math.max(0, ((currentZoom - 100) / 100) * 320);
      setPanPosition((prev) => ({
        x: Math.max(-maxPanX, Math.min(maxPanX, prev.x + deltaX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, prev.y + deltaY)),
      }));
    }
  };

  const handlePdfTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      isPinchingRef.current = false;
    }
  };

  useEffect(() => {
    (window as any).onNativePinchZoom = (scaleFactor: number) => {
      if (!doc) return;
      if (typeof scaleFactor !== 'number' || isNaN(scaleFactor)) return;
      const target = zoomLevelFloatRef.current * scaleFactor;
      const clamped = Math.min(300, Math.max(100, target));
      zoomLevelFloatRef.current = clamped;
      const rounded = Math.round(clamped);
      setZoomLevel(rounded);
      if (rounded === 100) {
        setPanPosition({ x: 0, y: 0 });
      }
    };
    return () => {
      delete (window as any).onNativePinchZoom;
    };
  }, [doc]);

  useEffect(() => {
    if (!doc) return;

    zoomLevelFloatRef.current = 100;
    setZoomLevel(100);
    setPanPosition({ x: 0, y: 0 });
    setNativePdfProgress(0);
    setImageFallbackStep(0);
    setHtmlContent(null);
    setPreviewError(null);

    let cancelled = false;
    let activeObjectUrl: string | null = null;
    const bgController = new AbortController();
    setOfflineBlobUrl(null);

    const bridge = getAndroidBridge();
    const isApp = isAndroidStudentApp();
    const rawUrl = resolveRawPdfSourceUrl(doc);
    const offlineNow = isDeviceOffline();

    const cleanupEffect = () => {
      cancelled = true;
      bgController.abort();
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
        activeObjectUrl = null;
      }
    };

    if (fileCategory === 'image') {
      setUseWebPdfFallback(true);
      setIsIframeLoading(Boolean(rawUrl));

      if (!isApp) {
        if (offlineNow) {
          setIsIframeLoading(false);
          setPreviewError('You are currently offline. Please reconnect to view this image.');
        }
        return cleanupEffect;
      }

      (async () => {
        const cached = await getOfflineFileBlob(doc.id);
        if (cancelled) return;
        if (cached) {
          activeObjectUrl = URL.createObjectURL(cached.blob);
          setOfflineBlobUrl(activeObjectUrl);
          setIsIframeLoading(false);
          onWebLoaded?.(doc.id);
          return;
        }
        if (offlineNow) {
          setIsIframeLoading(false);
          setPreviewError(
            'This image is not saved in your offline app cache yet. Please connect to the internet once to open and cache it.'
          );
          return;
        }
        // Online inside Android App: silently cache image blob in app storage for future offline access
        const cacheFetchUrl = driveFileId
          ? `/api/preview-file?mode=image&url=${encodeURIComponent(rawUrl)}`
          : rawUrl;
        if (cacheFetchUrl) {
          fetch(cacheFetchUrl, { signal: bgController.signal })
            .then(async (r) => {
              if (!r.ok) return;
              const blob = await r.blob();
              if (cancelled || blob.size <= 0) return;
              const saved = await saveOfflineFileBlob(
                doc.id,
                blob,
                blob.type || 'image/png',
                doc.title
              );
              if (saved && !cancelled) {
                markDocAsCachedOffline(doc.id);
                onWebLoaded?.(doc.id);
              }
            })
            .catch(() => {});
        }
      })();

      return cleanupEffect;
    }

    if (fileCategory === 'html') {
      setUseWebPdfFallback(true);
      setIsIframeLoading(Boolean(rawUrl));

      (async () => {
        if (isApp) {
          const cached = await getOfflineFileBlob(doc.id);
          if (cancelled) return;
          if (cached) {
            const text = await cached.blob.text().catch(() => '');
            if (cancelled) return;
            if (text) {
              setHtmlContent(text);
              setIsIframeLoading(false);
              onWebLoaded?.(doc.id);
              return;
            }
          }
        }
        if (!rawUrl) {
          setIsIframeLoading(false);
          return;
        }
        if (offlineNow) {
          setIsIframeLoading(false);
          setPreviewError(
            isApp
              ? 'This HTML file is not saved in your offline app cache yet. Please connect to the internet once to open and cache it.'
              : 'You are currently offline. Please reconnect to view this HTML file.'
          );
          return;
        }
        if (!driveFileId) {
          setIsIframeLoading(true);
          return;
        }

        try {
          const res = await fetch(
            `/api/preview-file?mode=html&url=${encodeURIComponent(rawUrl)}`,
            { signal: bgController.signal, cache: 'no-store' }
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.success || typeof data?.html !== 'string') {
            throw new Error(data?.error || 'Could not load HTML preview.');
          }
          if (cancelled) return;
          setHtmlContent(data.html);
          setIsIframeLoading(false);
          if (isApp) {
            const htmlBlob = new Blob([data.html], { type: 'text/html' });
            const saved = await saveOfflineFileBlob(doc.id, htmlBlob, 'text/html', doc.title);
            if (saved && !cancelled) {
              markDocAsCachedOffline(doc.id);
            }
          }
          onWebLoaded?.(doc.id);
        } catch (err: any) {
          if (cancelled || err?.name === 'AbortError') return;
          setPreviewError(err?.message || 'Could not load HTML preview.');
          setIsIframeLoading(false);
        }
      })();

      return cleanupEffect;
    }

    if (!bridge || !bridge.openNativePdf || !rawUrl) {
      setUseWebPdfFallback(true);
      setIsIframeLoading(true);

      if (!isApp) {
        if (offlineNow && rawUrl) {
          setIsIframeLoading(false);
          setPreviewError('You are currently offline. Please reconnect to view this PDF.');
        }
        return cleanupEffect;
      }

      (async () => {
        const cached = await getOfflineFileBlob(doc.id);
        if (cancelled) return;
        if (cached) {
          activeObjectUrl = URL.createObjectURL(cached.blob);
          setOfflineBlobUrl(activeObjectUrl);
          setIsIframeLoading(false);
          markDocAsCachedOffline(doc.id);
          onWebLoaded?.(doc.id);
          return;
        }
        if (offlineNow) {
          setIsIframeLoading(false);
          setPreviewError(
            'This PDF is not saved in your offline app cache yet. Please connect to the internet once to open and store it offline.'
          );
          return;
        }
        if (driveFileId && rawUrl) {
          fetch(`/api/preview-file?mode=pdf&url=${encodeURIComponent(rawUrl)}`, {
            signal: bgController.signal,
          })
            .then(async (r) => {
              if (!r.ok) return;
              const blob = await r.blob();
              if (cancelled || blob.size <= 0) return;
              const saved = await saveOfflineFileBlob(doc.id, blob, 'application/pdf', doc.title);
              if (saved && !cancelled) {
                markDocAsCachedOffline(doc.id);
                onWebLoaded?.(doc.id);
              }
            })
            .catch(() => {});
        }
      })();

      return cleanupEffect;
    }

    setUseWebPdfFallback(false);
    const alreadyOnDisk = bridge.isPdfCachedOnDisk ? bridge.isPdfCachedOnDisk(doc.id) : false;
    setIsIframeLoading(!alreadyOnDisk);

    const computeRatios = () => {
      const el = pdfContainerRef.current;
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      if (!el) return { left: 0.03, top: 0.14, width: 0.94, height: 0.8 };
      const r = el.getBoundingClientRect();
      return {
        left: Math.max(0, r.left / vw),
        top: Math.max(0, r.top / vh),
        width: Math.max(0.05, r.width / vw),
        height: Math.max(0.05, r.height / vh),
      };
    };

    (window as any).onNativePdfProgress = (docId: string, pct: number) => {
      if (docId === doc.id) {
        setNativePdfProgress(Math.max(0, Math.min(100, pct)));
      }
    };

    (window as any).onNativePdfReady = (
      docId: string,
      fromCache?: boolean,
      pageCount?: number,
      fileSizeBytes?: number
    ) => {
      if (docId !== doc.id) return;
      setIsIframeLoading(false);
      setUseWebPdfFallback(false);
      onNativeReadyRef.current?.(docId, fromCache, pageCount, fileSizeBytes);
    };

    (window as any).onNativePdfFallback = (docId: string) => {
      if (docId !== doc.id) return;
      setUseWebPdfFallback(true);
      setIsIframeLoading(true);
    };

    const rafId = window.requestAnimationFrame(() => {
      const ratios = computeRatios();
      try {
        bridge.openNativePdf(doc.id, rawUrl, ratios.left, ratios.top, ratios.width, ratios.height);
      } catch {
        setUseWebPdfFallback(true);
      }
    });

    const syncBounds = () => {
      if (!pdfContainerRef.current || !bridge.updatePdfBounds) return;
      const ratios = computeRatios();
      try {
        bridge.updatePdfBounds(ratios.left, ratios.top, ratios.width, ratios.height);
      } catch {}
    };

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && pdfContainerRef.current) {
      ro = new ResizeObserver(syncBounds);
      ro.observe(pdfContainerRef.current);
    }
    window.addEventListener('resize', syncBounds);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', syncBounds);
      if (ro) ro.disconnect();
      delete (window as any).onNativePdfProgress;
      delete (window as any).onNativePdfReady;
      delete (window as any).onNativePdfFallback;
      try {
        bridge.closeNativePdf?.();
      } catch {}
    };
  }, [doc?.id, doc?.file_url, doc?.file_path, fileCategory, driveFileId]);

  if (!doc) return null;

  const safeEmbedUrl = getPdfEmbedUrl(doc.file_url || doc.file_path);
  const hasPdfSource = Boolean(safeEmbedUrl || rawSourceUrl || offlineBlobUrl || htmlContent !== null);
  const isPyq = doc.type === 'PYQ' || doc.type === 'PYQs';
  const currentImageSrc = offlineBlobUrl || imageCandidates[imageFallbackStep] || '';
  const usingDriveIframeFallbackForImage =
    !offlineBlobUrl && fileCategory === 'image' && imageFallbackStep >= imageCandidates.length && Boolean(driveFileId && safeEmbedUrl);

  const adjustZoom = (delta: number) => {
    setZoomLevel((prev) => {
      const next = Math.min(300, Math.max(100, prev + delta));
      zoomLevelFloatRef.current = next;
      if (next === 100) setPanPosition({ x: 0, y: 0 });
      return next;
    });
  };

  return (
    <div
      onTouchStart={fileCategory === 'html' ? undefined : handlePdfTouchStart}
      onTouchMove={fileCategory === 'html' ? undefined : handlePdfTouchMove}
      onTouchEnd={fileCategory === 'html' ? undefined : handlePdfTouchEnd}
      className={`fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center pt-[max(env(safe-area-inset-top),0.75rem)] pb-[max(env(safe-area-inset-bottom),0.75rem)] px-2.5 sm:p-5 md:p-8 animate-in fade-in duration-200 overflow-hidden ${
        fileCategory === 'html' ? '' : 'select-none'
      }`}
    >
      {/* Framed Container: Continuous Solid 4-Sided Neutral Slate Border */}
      <div className="w-full h-full max-h-full max-w-5xl rounded-2xl sm:rounded-3xl border-2 sm:border-[3px] border-slate-700 bg-white shadow-2xl overflow-hidden flex flex-col relative z-10">
        {/* Static Header inside Framed Border */}
        <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2.5 sm:px-6 sm:py-3.5 flex items-center justify-between gap-2 shrink-0 z-30 select-none">
          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="flex items-center space-x-1.5 min-w-0">
              <span
                className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded shrink-0 ${
                  isPyq ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                }`}
              >
                {doc.type}
              </span>
              {fileCategory !== 'pdf' && (
                <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-indigo-100 text-indigo-700 uppercase">
                  {fileCategory}
                </span>
              )}
              <span className="text-[10px] sm:text-xs font-medium text-slate-500 truncate">
                {doc.subtitle}
              </span>
              {isCached && (
                <span
                  className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 inline-block ring-2 ring-emerald-200"
                  title="Cached on Device"
                />
              )}
            </div>
            <h3 className="text-xs sm:text-base font-bold text-slate-900 truncate" title={doc.title}>
              {doc.title}
            </h3>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {fileCategory === 'image' && hasPdfSource && (
              <div className="hidden sm:inline-flex items-center bg-slate-200/70 rounded-xl p-0.5 mr-1">
                <button
                  type="button"
                  onClick={() => adjustZoom(-25)}
                  disabled={zoomLevel <= 100}
                  className="p-1.5 rounded-lg hover:bg-white disabled:opacity-40 text-slate-700 transition-colors cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    zoomLevelFloatRef.current = 100;
                    setZoomLevel(100);
                    setPanPosition({ x: 0, y: 0 });
                  }}
                  className="px-2 text-[11px] font-bold text-slate-700 tabular-nums cursor-pointer"
                  title="Reset Zoom"
                >
                  {zoomLevel}%
                </button>
                <button
                  type="button"
                  onClick={() => adjustZoom(25)}
                  disabled={zoomLevel >= 300}
                  className="p-1.5 rounded-lg hover:bg-white disabled:opacity-40 text-slate-700 transition-colors cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {hasPdfSource && onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="inline-flex items-center space-x-1.5 px-3 sm:px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-all shadow-sm cursor-pointer"
                title="Download File"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const bridge = getAndroidBridge();
                try {
                  bridge?.closeNativePdf?.();
                } catch {}
                onClose();
              }}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              aria-label="Close Preview"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* FILE VIEWER BODY (PDF, Image, or Sandboxed HTML strictly inside the 4-sided border) */}
        <div
          ref={pdfContainerRef}
          className={`flex-1 min-h-0 w-full bg-slate-100 relative overflow-hidden flex flex-col ${
            fileCategory === 'html' ? '' : 'select-none'
          }`}
          style={{ touchAction: fileCategory === 'html' ? 'auto' : 'none' }}
        >
          {hasPdfSource ? (
            <>
              {isIframeLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white space-y-3 pointer-events-none">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
                    <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
                  </div>
                  <div className="space-y-1 text-center px-4">
                    <p className="text-xs sm:text-sm font-bold text-slate-800">
                      {fileCategory === 'image'
                        ? 'Loading Image Preview...'
                        : fileCategory === 'html'
                        ? 'Loading HTML Preview...'
                        : isCached
                        ? 'Opening Cached PDF...'
                        : nativePdfProgress > 0
                        ? `Caching Verified PDF (${nativePdfProgress}%)...`
                        : 'Streaming Verified PDF...'}
                    </p>
                    <p className="text-[10px] sm:text-[11px] text-slate-400">
                      {isCached && fileCategory === 'pdf'
                        ? 'Loading instantaneously from local device storage'
                        : 'Loading official document preview'}
                    </p>
                  </div>
                </div>
              )}

              {previewError ? (
                <div className="flex-1 p-6 sm:p-14 flex flex-col items-center justify-center text-center space-y-4 bg-slate-50">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-sm">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5 max-w-md">
                    <h4 className="text-sm sm:text-base font-bold text-slate-900">
                      Could Not Render Preview Inline
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">{previewError}</p>
                  </div>
                  {onDownload && (
                    <button
                      type="button"
                      onClick={onDownload}
                      className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download File Instead</span>
                    </button>
                  )}
                </div>
              ) : fileCategory === 'image' ? (
                <>
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      transform: `scale(${zoomLevel / 100}) translate(${panPosition.x}px, ${panPosition.y}px)`,
                      transformOrigin: 'center center',
                      transition: isPinchingRef.current ? 'none' : 'transform 0.08s ease-out',
                    }}
                    className="flex-1 w-full h-full flex items-center justify-center p-2 sm:p-6 bg-slate-900/95"
                  >
                    {usingDriveIframeFallbackForImage ? (
                      <iframe
                        src={safeEmbedUrl}
                        title={doc.title}
                        loading="eager"
                        onLoad={() => {
                          setIsIframeLoading(false);
                          onWebLoaded?.(doc.id);
                        }}
                        className="w-full h-full flex-1 border-0 bg-white rounded-lg"
                      />
                    ) : currentImageSrc ? (
                      <img
                        src={currentImageSrc}
                        alt={doc.title}
                        draggable={false}
                        onLoad={() => {
                          setIsIframeLoading(false);
                          onWebLoaded?.(doc.id);
                        }}
                        onError={() => {
                          if (imageFallbackStep < imageCandidates.length - 1) {
                            setImageFallbackStep((s) => s + 1);
                          } else if (driveFileId && safeEmbedUrl) {
                            setImageFallbackStep(imageCandidates.length);
                          } else {
                            setIsIframeLoading(false);
                            setPreviewError('Image could not be loaded for inline preview.');
                          }
                        }}
                        className="max-w-full max-h-full object-contain rounded-lg shadow-xl select-none"
                      />
                    ) : null}
                  </div>

                  {!usingDriveIframeFallbackForImage && (
                    <div
                      onTouchStart={handlePdfTouchStart}
                      onTouchMove={handlePdfTouchMove}
                      onTouchEnd={handlePdfTouchEnd}
                      className={`absolute inset-0 z-20 cursor-grab active:cursor-grabbing ${
                        zoomLevel <= 100 ? 'pointer-events-none' : ''
                      }`}
                      style={{ touchAction: 'none' }}
                    />
                  )}
                </>
              ) : fileCategory === 'html' ? (
                <div className="flex-1 w-full h-full flex flex-col bg-white">
                  {htmlContent !== null ? (
                    <iframe
                      title={doc.title}
                      srcDoc={htmlContent}
                      sandbox="allow-scripts"
                      onLoad={() => {
                        setIsIframeLoading(false);
                        onWebLoaded?.(doc.id);
                      }}
                      className="w-full h-full flex-1 border-0 bg-white"
                    />
                  ) : !driveFileId && rawSourceUrl ? (
                    <iframe
                      title={doc.title}
                      src={rawSourceUrl}
                      sandbox="allow-scripts"
                      onLoad={() => {
                        setIsIframeLoading(false);
                        onWebLoaded?.(doc.id);
                      }}
                      className="w-full h-full flex-1 border-0 bg-white"
                    />
                  ) : null}
                </div>
              ) : useWebPdfFallback ? (
                <>
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      transform: `scale(${zoomLevel / 100}) translate(${panPosition.x}px, ${panPosition.y}px)`,
                      transformOrigin: 'center center',
                      transition: isPinchingRef.current ? 'none' : 'transform 0.08s ease-out',
                    }}
                    className="flex-1 w-full h-full flex flex-col"
                  >
                    <iframe
                      src={offlineBlobUrl || safeEmbedUrl}
                      title={doc.title}
                      loading="eager"
                      onLoad={() => {
                        setIsIframeLoading(false);
                        onWebLoaded?.(doc.id);
                      }}
                      className="w-full h-full flex-1 border-0 bg-white"
                      allow="autoplay; fullscreen; clipboard-read; clipboard-write"
                    />
                  </div>

                  {/* Web Pinch/Pan Overlay */}
                  <div
                    onTouchStart={handlePdfTouchStart}
                    onTouchMove={handlePdfTouchMove}
                    onTouchEnd={handlePdfTouchEnd}
                    className={`absolute inset-0 z-20 cursor-grab active:cursor-grabbing ${
                      zoomLevel <= 100 ? 'pointer-events-none' : ''
                    }`}
                    style={{ touchAction: 'none' }}
                  />
                </>
              ) : null}
            </>
          ) : (
            <div className="flex-1 p-6 sm:p-16 flex flex-col items-center justify-center text-center space-y-4 bg-slate-50">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-sm">
                <AlertCircle className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div className="space-y-1.5 max-w-md">
                <h4 className="text-sm sm:text-lg font-bold text-slate-900">
                  Actual File Not Uploaded Yet
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {doc.missingAttachmentMessage ||
                    `The document for "${doc.title}" has not been attached or uploaded to Google Drive yet.`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
