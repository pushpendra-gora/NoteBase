'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, MoreVertical, X } from 'lucide-react';

interface PortalAboutMenuProps {
  onOpenMenu?: () => void;
}

/**
 * Shared top-right 3-dot menu + About NoteBase modal used across Student, Coordinator, and Admin login screens.
 */
export default function PortalAboutMenu({ onOpenMenu }: PortalAboutMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('popstate', handlePopState);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || (!aboutOpen && !menuOpen)) return;
    const prevHandler = (window as any).__closeNoteBaseModalIfOpen;
    (window as any).__closeNoteBaseModalIfOpen = () => {
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
  }, [aboutOpen, menuOpen]);

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
          <div className="absolute right-0 mt-2 w-40 bg-white rounded-2xl border border-slate-100 shadow-[0_12px_30px_rgba(0,0,0,0.12)] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
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

      {mounted && aboutOpen &&
        createPortal(
          <div
            onClick={() => setAboutOpen(false)}
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)] px-4 overflow-y-auto animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-150"
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
