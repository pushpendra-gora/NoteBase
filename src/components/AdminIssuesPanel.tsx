'use client';

import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  MessageSquareWarning,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';

export interface AdminIssueEntry {
  id: string;
  senderName: string;
  year: string;
  branch: string;
  subject: string;
  description: string;
  status: 'Open' | 'Resolved';
  admin_reply?: string | null;
  created_at: string;
}

interface AdminIssuesPanelProps {
  title: string;
  subtitle: string;
  missingTableName: string;
  missingTableSql: string;
  replyPlaceholder: string;
  emptyTitle: string;
  emptySubtitle: string;
  loadingText: string;
  issues: AdminIssueEntry[];
  isLoading: boolean;
  tableMissing: boolean;
  error: string | null;
  statusFilter: 'All' | 'Open' | 'Resolved';
  onStatusFilterChange: (next: 'All' | 'Open' | 'Resolved') => void;
  replyDrafts: Record<string, string>;
  onReplyDraftChange: (id: string, value: string) => void;
  busyId: string | null;
  onRefresh: () => void;
  onBulkDelete: (mode: 'resolved' | 'all') => void;
  onToggleResolve: (id: string, nextStatus: 'Open' | 'Resolved') => void;
  onDeleteSingle: (id: string) => void;
  onCopySql: (sql: string) => void;
}

/**
 * Reusable Admin panel for viewing, solving, adding resolution notes, and permanently deleting
 * Coordinator Issues or Student Issues from Supabase.
 */
export default function AdminIssuesPanel({
  title,
  subtitle,
  missingTableName,
  missingTableSql,
  replyPlaceholder,
  emptyTitle,
  emptySubtitle,
  loadingText,
  issues,
  isLoading,
  tableMissing,
  error,
  statusFilter,
  onStatusFilterChange,
  replyDrafts,
  onReplyDraftChange,
  busyId,
  onRefresh,
  onBulkDelete,
  onToggleResolve,
  onDeleteSingle,
  onCopySql,
}: AdminIssuesPanelProps) {
  const openCount = issues.filter((i) => i.status === 'Open').length;
  const resolvedCount = issues.filter((i) => i.status === 'Resolved').length;
  const filteredIssues = issues.filter((i) =>
    statusFilter === 'All' ? true : i.status === statusFilter
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-100/90 p-5 sm:p-8 shadow-[0_2px_14px_rgba(0,0,0,0.02)] space-y-5">
        {/* Header & Action Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <MessageSquareWarning className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {title} ({issues.length})
              </h2>
              <p className="text-xs text-slate-400">{subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            {resolvedCount > 0 && (
              <button
                type="button"
                onClick={() => onBulkDelete('resolved')}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Solved ({resolvedCount})</span>
              </button>
            )}

            {issues.length > 0 && (
              <button
                type="button"
                onClick={() => onBulkDelete('all')}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete All ({issues.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => onStatusFilterChange('All')}
            className={`px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
              statusFilter === 'All'
                ? 'bg-[#3b49df] text-white shadow-sm'
                : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            All ({issues.length})
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange('Open')}
            className={`px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
              statusFilter === 'Open'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            Open ({openCount})
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange('Resolved')}
            className={`px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
              statusFilter === 'Resolved'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            Solved ({resolvedCount})
          </button>
        </div>

        {/* Setup Notice if table hasn't been created in Supabase yet */}
        {tableMissing && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 space-y-2.5 text-xs text-red-800">
            <div className="font-bold flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>Supabase Table &quot;{missingTableName}&quot; Missing</span>
            </div>
            <p>
              Run the SQL below inside your Supabase Dashboard &rarr; <strong>SQL Editor</strong> so issues are stored and synced in the database:
            </p>
            <button
              type="button"
              onClick={() => onCopySql(missingTableSql)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Issues Table SQL</span>
            </button>
          </div>
        )}

        {error && !tableMissing && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-100 text-xs text-red-700 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Issues List */}
        {isLoading && issues.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 font-medium">
            {loadingText}
          </div>
        ) : filteredIssues.length > 0 ? (
          <div className="space-y-4">
            {filteredIssues.map((issue) => {
              const replyValue =
                replyDrafts[issue.id] !== undefined
                  ? replyDrafts[issue.id]
                  : issue.admin_reply || '';
              const isBusy = busyId === issue.id;

              return (
                <div
                  key={issue.id}
                  className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white transition-colors space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {issue.senderName}
                        </span>
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {issue.year} • {issue.branch}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {new Date(issue.created_at).toLocaleString()}
                        </span>
                      </div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 break-words">
                        {issue.subject}
                      </h3>
                    </div>

                    <span
                      className={`self-start inline-flex items-center space-x-1 text-[11px] font-bold px-3 py-1 rounded-full border shrink-0 ${
                        issue.status === 'Resolved'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {issue.status === 'Resolved' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5" />
                      )}
                      <span>{issue.status === 'Resolved' ? 'Solved' : 'Open'}</span>
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap break-words bg-white p-3.5 rounded-xl border border-slate-100 leading-relaxed">
                    {issue.description}
                  </p>

                  {/* Admin Note + Actions */}
                  <div className="flex flex-col md:flex-row md:items-center gap-2.5 pt-1">
                    <input
                      type="text"
                      value={replyValue}
                      onChange={(e) => onReplyDraftChange(issue.id, e.target.value)}
                      placeholder={replyPlaceholder}
                      className="flex-1 h-10 px-3.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />

                    <div className="flex items-center gap-2 shrink-0">
                      {issue.status === 'Open' ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onToggleResolve(issue.id, 'Resolved')}
                          className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-60"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>Mark Solved</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onToggleResolve(issue.id, 'Open')}
                          className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reopen</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onDeleteSingle(issue.id)}
                        className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center space-y-1.5">
            <p className="text-sm font-bold text-slate-700">{emptyTitle}</p>
            <p className="text-xs text-slate-400">{emptySubtitle}</p>
          </div>
        )}
      </div>
    </div>
  );
}
