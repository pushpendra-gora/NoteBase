'use client';

import React from 'react';
import { CheckCircle2, Loader2, UploadCloud } from 'lucide-react';
import { formatFileSize } from '../lib/pdfMetadata';

export interface UploadProgressInfo {
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  stageLabel: string;
  startedAt?: number;
}

interface UploadProgressBarProps {
  progress: UploadProgressInfo;
  fileName?: string;
}

export default function UploadProgressBar({ progress, fileName }: UploadProgressBarProps) {
  const clampedPercent = Math.max(0, Math.min(100, Math.round(progress.percent)));
  const isComplete = clampedPercent >= 100;

  let speedText = '';
  if (
    progress.startedAt &&
    progress.loadedBytes > 0 &&
    progress.loadedBytes < progress.totalBytes &&
    !isComplete
  ) {
    const elapsedSec = (Date.now() - progress.startedAt) / 1000;
    if (elapsedSec >= 0.4) {
      const bytesPerSec = Math.round(progress.loadedBytes / elapsedSec);
      const formattedSpeed = formatFileSize(bytesPerSec);
      if (formattedSpeed) {
        speedText = ` • ${formattedSpeed}/s`;
      }
    }
  }

  const uploadedLabel = formatFileSize(Math.min(progress.loadedBytes, progress.totalBytes)) || '0 KB';
  const totalLabel = formatFileSize(progress.totalBytes) || '0 KB';

  return (
    <div
      role="progressbar"
      aria-valuenow={clampedPercent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={progress.stageLabel}
      className="w-full rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-blue-50/70 p-4 shadow-sm space-y-2.5 animate-in fade-in duration-150"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {isComplete ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
          )}
          <span className="text-xs font-bold text-slate-800 truncate">
            {progress.stageLabel}
          </span>
        </div>
        <span
          className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-extrabold tabular-nums ${
            isComplete
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-indigo-100 text-indigo-700'
          }`}
        >
          {clampedPercent}%
        </span>
      </div>

      {/* Animated Track & Fill */}
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-200/80 border border-slate-200">
        <div
          className={`h-full rounded-full transition-all duration-150 ease-out relative overflow-hidden ${
            isComplete
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
              : 'bg-gradient-to-r from-indigo-600 via-blue-500 to-indigo-500'
          }`}
          style={{ width: `${clampedPercent}%` }}
        >
          {!isComplete && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
        <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
          <UploadCloud className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="truncate">{fileName || 'Uploading file'}</span>
        </span>
        {progress.totalBytes > 0 && (
          <span className="shrink-0 tabular-nums text-slate-600">
            {uploadedLabel} / {totalLabel}
            {speedText}
          </span>
        )}
      </div>
    </div>
  );
}
