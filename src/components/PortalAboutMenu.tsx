'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  MessageSquareWarning,
  MoreVertical,
  Send,
  X,
} from 'lucide-react';
import { FIRST_YEAR_GROUPS, STANDARD_BRANCHES, YEARS } from '../data/notesData';

interface PortalAboutMenuProps {
  onOpenMenu?: () => void;
  enableStudentIssue?: boolean;
}

/**
 * Shared top-right 3-dot menu + About NoteBase modal (and optional Student Issue modal)
 * used across Student, Coordinator, and Admin portals.
 */
export default function PortalAboutMenu({
  onOpenMenu,
  enableStudentIssue = false,
}: PortalAboutMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Ephemeral Student Issue form state (never persisted in browser storage, never fetches issues)
  const [issueName, setIssueName] = useState('');
  const [issueYear, setIssueYear] = useState('');
  const [issueBranch, setIssueBranch] = useState('');
  const [issueSubject, setIssueSubject] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueError, setIssueError] = useState('');
  const [issueSent, setIssueSent] = useState(false);

  const availableBranches = useMemo<readonly string[]>(() => {
    if (issueYear === '1st Year') return FIRST_YEAR_GROUPS;
    if (issueYear) return STANDARD_BRANCHES;
    return [];
  }, [issueYear]);

  const resetIssueForm = () => {
    setIssueName('');
    setIssueYear('');
    setIssueBranch('');
    setIssueSubject('');
    setIssueDescription('');
    setIssueError('');
    setIssueSent(false);
  };

  const closeIssueModal = () => {
    setIssueOpen(false);
    resetIssueForm();
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handlePopState = () => {
      setMenuOpen(false);
      setAboutOpen(false);
      setIssueOpen(false);
      resetIssueForm();
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('popstate', handlePopState);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || (!aboutOpen && !issueOpen && !menuOpen)) return;
    const prevHandler = (window as any).__closeNoteBaseModalIfOpen;
    (window as any).__closeNoteBaseModalIfOpen = () => {
      if (issueOpen) {
        if (!issueSubmitting) closeIssueModal();
        return true;
      }
      if (aboutOpen) {
        setAboutOpen(false);
        return true;
      }
      if (menuOpen) {
        setMenuOpen(false);
        return true;
      }
      return typeof prevHandler === 'function' ? prevHandler() : false;
    };
    return () => {
      if (prevHandler) {
        (window as any).__closeNoteBaseModalIfOpen = prevHandler;
      } else {
        delete (window as any).__closeNoteBaseModalIfOpen;
      }
    };
  }, [aboutOpen, issueOpen, issueSubmitting, menuOpen]);

  const handleSubmitStudentIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (issueSubmitting) return;
    setIssueError('');

    const cleanName = issueName.trim();
    const cleanSubject = issueSubject.trim();
    const cleanDesc = issueDescription.trim();

    if (cleanName.length < 2) {
      setIssueError('Please enter your Name.');
      return;
    }
    if (!issueYear) {
      setIssueError('Please select your Year.');
      return;
    }
    if (!issueBranch) {
      setIssueError('Please select your Branch / Group.');
      return;
    }
    if (cleanSubject.length < 2) {
      setIssueError('Please enter a short Issue Title.');
      return;
    }
    if (cleanDesc.length < 4) {
      setIssueError('Please describe your issue clearly.');
      return;
    }

    setIssueSubmitting(true);
    try {
      const res = await fetch('/api/student-issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_name: cleanName,
          year: issueYear,
          branch: issueBranch,
          subject: cleanSubject,
          description: cleanDesc,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setIssueError(data?.error || 'Could not send issue right now. Please try again.');
        setIssueSubmitting(false);
        return;
      }

      // Clear all entered student details immediately so nothing stays on the student's side
      setIssueName('');
      setIssueYear('');
      setIssueBranch('');
      setIssueSubject('');
      setIssueDescription('');
      setIssueSent(true);
    } catch {
      setIssueError('Network error. Please check your internet connection and try again.');
    } finally {
      setIssueSubmitting(false);
    }
  };

  return (
    <>
      <div ref={menuRef} className="absolute top-4 right-4 sm:top-6 sm:right-6 z-40">
        <button
          type="button"
          onClick={() => {
            setMenuOpen((prev) => {
              const next = !prev;
              if (next) onOpenMenu?.();
              return next;
            });
          }}
          aria-label="More options"
          title="More options"
          className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer shadow-xs"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-44 bg-white rounded-2xl border border-slate-100 shadow-[0_12px_30px_rgba(0,0,0,0.12)] p-1.5 z-50 space-y-0.5 animate-in fade-in zoom-in-95 duration-150">
            {enableStudentIssue && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  resetIssueForm();
                  setIssueOpen(true);
                }}
                className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-800 transition-colors flex items-center space-x-2.5 cursor-pointer"
              >
                <MessageSquareWarning className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Issue</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setAboutOpen(true);
              }}
              className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center space-x-2.5 cursor-pointer"
            >
              <Info className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>About</span>
            </button>
          </div>
        )}
      </div>

      {/* Student Issue Modal */}
      {mounted &&
        issueOpen &&
        createPortal(
          <div
            onClick={() => {
              if (!issueSubmitting) closeIssueModal();
            }}
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)] px-4 overflow-y-auto animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-md w-full my-auto p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
                    <MessageSquareWarning className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">Report an Issue</h2>
                    <p className="text-[11px] text-slate-400 font-medium">Send directly to NoteBase Admin</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={issueSubmitting}
                  onClick={closeIssueModal}
                  aria-label="Close Issue Form"
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {issueSent ? (
                <div className="py-4 text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-extrabold text-slate-900">Issue Sent to Admin</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Thank you! Your issue has been forwarded to the NoteBase Admin team for review.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeIssueModal}
                    className="w-full py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitStudentIssue} className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Your Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      placeholder="Enter your name"
                      value={issueName}
                      onChange={(e) => {
                        setIssueName(e.target.value);
                        setIssueError('');
                      }}
                      className="w-full h-11 px-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 block">
                        Year <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={issueYear}
                        onChange={(e) => {
                          const nextYr = e.target.value;
                          setIssueYear(nextYr);
                          const validList: readonly string[] =
                            nextYr === '1st Year' ? FIRST_YEAR_GROUPS : nextYr ? STANDARD_BRANCHES : [];
                          if (!validList.includes(issueBranch)) {
                            setIssueBranch('');
                          }
                          setIssueError('');
                        }}
                        className="w-full h-11 px-3 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        <option value="">Select Year</option>
                        {YEARS.map((yr) => (
                          <option key={yr} value={yr}>
                            {yr}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 block">
                        Branch <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        disabled={!issueYear}
                        value={issueBranch}
                        onChange={(e) => {
                          setIssueBranch(e.target.value);
                          setIssueError('');
                        }}
                        className="w-full h-11 px-3 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
                      >
                        <option value="">{issueYear ? 'Select Branch' : 'Select Year first'}</option>
                        {availableBranches.map((br) => (
                          <option key={br} value={br}>
                            {br}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Issue Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={160}
                      placeholder="e.g. Missing Unit 2 PDF / Broken link"
                      value={issueSubject}
                      onChange={(e) => {
                        setIssueSubject(e.target.value);
                        setIssueError('');
                      }}
                      className="w-full h-11 px-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Issue Details <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={3}
                      maxLength={2000}
                      placeholder="Write complete details so Admin can fix it quickly..."
                      value={issueDescription}
                      onChange={(e) => {
                        setIssueDescription(e.target.value);
                        setIssueError('');
                      }}
                      className="w-full p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                    />
                  </div>

                  {issueError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{issueError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end space-x-2 pt-1">
                    <button
                      type="button"
                      disabled={issueSubmitting}
                      onClick={closeIssueModal}
                      className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={issueSubmitting}
                      className="px-5 py-2.5 rounded-xl bg-[#3b49df] hover:bg-[#323fc0] text-white text-xs sm:text-sm font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center space-x-1.5"
                    >
                      {issueSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Send to Admin</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* About Modal */}
      {mounted &&
        aboutOpen &&
        createPortal(
          <div
            onClick={() => setAboutOpen(false)}
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)] px-4 overflow-y-auto animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-sm w-full my-auto p-6 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-150"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                <div className="flex items-center space-x-2.5">
                  <img src="/logo.png?v=2" alt="NoteBase Logo" className="w-8 h-8 object-contain" />
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">About NoteBase</h2>
                    <p className="text-[11px] text-slate-400 font-medium">Student Notes &amp; Study Portal</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAboutOpen(false)}
                  aria-label="Close About"
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-center">
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  All college notes, previous year question papers (PYQs), and video lectures are available here in one place, organized by Year, Branch, and Semester.
                </p>

                <div className="p-3.5 rounded-2xl bg-indigo-50/80 border border-indigo-100">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-indigo-500">Created With Care</p>
                  <p className="text-sm font-extrabold text-indigo-900 mt-0.5">
                    Made by Pushpendra Gora
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAboutOpen(false)}
                className="w-full py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
