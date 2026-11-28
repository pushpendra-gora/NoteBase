'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Calendar, 
  Layers, 
  Lock, 
  ChevronDown, 
  Check, 
  Eye, 
  EyeOff, 
  LogIn, 
  ShieldCheck, 
  ArrowLeft,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { 
  FIRST_YEAR_GROUPS, 
  STANDARD_BRANCHES, 
  YEARS 
} from '../../data/notesData';
import { BranchOption, YearOption } from '../../types';
import { getStoredCoordinators, isBranchMatch } from '../../lib/coordinatorService';
import PortalAboutMenu from '../../components/PortalAboutMenu';

export default function CoordinatorLoginPage() {
  const router = useRouter();

  const [selectedYear, setSelectedYear] = useState<YearOption | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<BranchOption | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Dropdown states
  const [yearOpen, setYearOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);

  // Submission feedback
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);

  const yearRef = useRef<HTMLDivElement>(null);
  const branchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('timeout') === '1') {
        setErrorMsg('Session expired after 1 hour of inactivity. Please login again.');
      }
    }
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (yearRef.current && !yearRef.current.contains(event.target as Node)) {
        setYearOpen(false);
      }
      if (branchRef.current && !branchRef.current.contains(event.target as Node)) {
        setBranchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isYearSelected = selectedYear !== null;

  // Available branches / groups based on Year
  const availableBranches = useMemo<BranchOption[]>(() => {
    if (selectedYear === '1st Year') {
      return FIRST_YEAR_GROUPS;
    }
    return STANDARD_BRANCHES;
  }, [selectedYear]);

  // Handle Year Selection
  const handleSelectYear = (yr: YearOption) => {
    setSelectedYear(yr);
    setSelectedBranch(null);
    setYearOpen(false);
    setErrorMsg('');
  };

  // Handle Branch Selection
  const handleSelectBranch = (br: BranchOption) => {
    setSelectedBranch(br);
    setBranchOpen(false);
    setErrorMsg('');
  };

  // Branch button label text
  const branchLabel = useMemo(() => {
    if (selectedBranch) return selectedBranch;
    return 'Branch';
  }, [selectedBranch]);

  // Handle Login Submission (Authenticates against Admin-managed coordinators in Supabase / LocalStorage)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn) return;
    setErrorMsg('');

    if (!selectedYear) {
      setErrorMsg('Please select Year.');
      return;
    }
    if (!selectedBranch) {
      setErrorMsg('Please select Branch / Group.');
      return;
    }
    if (!password.trim()) {
      setErrorMsg('Please enter Coordinator Password.');
      return;
    }

    setIsLoggingIn(true);

    // Authenticate securely via server-side /api/coordinator/auth (No passwords exposed to browser)
    try {
      const response = await fetch('/api/coordinator/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          year: selectedYear,
          branch: selectedBranch,
          password: password.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok && data.success && data.coordinator) {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('notehub_active_coordinator', JSON.stringify({
            id: data.coordinator.id,
            name: data.coordinator.name,
            branch: selectedBranch,
            year: selectedYear,
          }));
          try {
            localStorage.setItem('notebase_coord_last_activity', String(Date.now()));
          } catch {}
        }

        setLoginSuccess(true);
        router.push('/coordinator/dashboard');
        return;
      }

      setErrorMsg(data.error || 'Authentication failed.');
      setIsLoggingIn(false);
      return;
    } catch {
      setErrorMsg('Unable to reach authentication server. Please check your internet connection and try again.');
      setIsLoggingIn(false);
      return;
    }
  };

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full max-w-[100vw] bg-[#f3effb] relative flex flex-col items-center justify-start pt-[max(env(safe-area-inset-top),1.25rem)] pb-[max(env(safe-area-inset-bottom),1.25rem)] px-4 sm:p-6 overflow-y-auto overflow-x-hidden overscroll-none overscroll-x-none touch-pan-y select-none selection:bg-purple-200">
      
      {/* Background Soft Pastel Blobs contained strictly inside viewport */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-80px] left-[-80px] w-96 h-96 bg-[#e8dcfa]/60 rounded-full blur-3xl" />
        <div className="absolute bottom-[-100px] right-[-100px] w-[450px] h-[450px] bg-[#dfd4f6]/50 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-[-150px] w-80 h-80 bg-[#ede4fc]/40 rounded-full blur-3xl" />
      </div>

      {/* Main Container */}
      <div className="w-full max-w-xl mx-auto my-auto flex flex-col items-center relative z-10 py-4 sm:py-8">
        
        {/* Same White Card UI from Reference */}
        <div className="relative w-full bg-white rounded-[32px] sm:rounded-[36px] shadow-[0_20px_50px_rgba(79,70,229,0.06),0_4px_16px_rgba(0,0,0,0.03)] border border-slate-100/90 p-8 sm:p-12 transition-all">
          
          {/* Top-Right 3-Dot Menu */}
          <PortalAboutMenu
            onOpenMenu={() => {
              setYearOpen(false);
              setBranchOpen(false);
            }}
          />

          {/* Logo Section */}
          <div className="flex flex-col items-center text-center mb-8">
            {/* NoteBase 3D App Icon */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center mb-2 transition-transform hover:scale-105 duration-200">
              <img 
                src="/logo.png?v=2" 
                alt="NoteBase Logo" 
                className="w-full h-full object-contain"
              />
            </div>

            {/* NoteBase Title with bottom curved swoosh */}
            <div className="relative inline-block">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111827]">
                Note<span className="bg-gradient-to-r from-[#2563eb] via-[#4f46e5] to-[#7c3aed] bg-clip-text text-transparent">Base</span>
              </h1>
              {/* Bottom decorative curved swoosh */}
              <div className="w-20 h-1.5 mx-auto mt-1 rounded-full bg-gradient-to-r from-[#2563eb] via-[#4f46e5] to-[#7c3aed]" />
            </div>

            {/* Subtitle / Coordinator Badge */}
            <div className="mt-3 inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Coordinator Access Portal</span>
            </div>
          </div>

          {/* Form */}
          {!loginSuccess ? (
            <form onSubmit={handleLogin} className="space-y-4">
              
              {/* 1. Year Dropdown */}
              <div className="relative" ref={yearRef}>
                <button
                  type="button"
                  onClick={() => {
                    setYearOpen(!yearOpen);
                    setBranchOpen(false);
                  }}
                  className={`w-full h-14 sm:h-16 px-5 sm:px-6 bg-white rounded-2xl border transition-all flex items-center justify-between shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-md ${
                    yearOpen 
                      ? 'border-indigo-400 ring-2 ring-indigo-50' 
                      : 'border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-3.5 sm:space-x-4">
                    <div className="text-slate-700">
                      <Calendar className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
                    </div>
                    <span className={`text-base sm:text-lg font-medium ${
                      selectedYear ? 'text-slate-900 font-semibold' : 'text-slate-800'
                    }`}>
                      {selectedYear || 'Year'}
                    </span>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-slate-700 transition-transform duration-200 ${
                    yearOpen ? 'rotate-180' : ''
                  }`} />
                </button>

                {/* Year Dropdown Menu (1st Year to 4th Year) */}
                {yearOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-100 shadow-[0_12px_30px_rgba(0,0,0,0.1)] p-2 z-30 animate-in fade-in zoom-in-95 duration-150">
                    {YEARS.map((yr) => (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => handleSelectYear(yr)}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-between ${
                          selectedYear === yr
                            ? 'bg-indigo-50 text-indigo-700 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span>{yr}</span>
                        {selectedYear === yr && <Check className="w-4 h-4 text-indigo-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Branch / Group Dropdown */}
              <div className="relative" ref={branchRef}>
                <button
                  type="button"
                  disabled={!isYearSelected}
                  onClick={() => {
                    if (!isYearSelected) return;
                    setBranchOpen(!branchOpen);
                    setYearOpen(false);
                  }}
                  className={`w-full h-14 sm:h-16 px-5 sm:px-6 rounded-2xl border transition-all flex items-center justify-between ${
                    !isYearSelected
                      ? 'opacity-40 cursor-not-allowed bg-slate-50/70 border-slate-200/50 text-slate-400 shadow-none'
                      : branchOpen
                        ? 'bg-white border-indigo-400 ring-2 ring-indigo-50 shadow-md'
                        : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-md cursor-pointer'
                  }`}
                >
                  <div className="flex items-center space-x-3.5 sm:space-x-4 overflow-hidden">
                    <div className={isYearSelected ? 'text-slate-700' : 'text-slate-400'}>
                      <Layers className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
                    </div>
                    <span className={`text-base sm:text-lg font-medium truncate ${
                      selectedBranch 
                        ? 'text-slate-900 font-semibold' 
                        : isYearSelected 
                          ? 'text-slate-800' 
                          : 'text-slate-400'
                    }`}>
                      {branchLabel}
                    </span>
                  </div>
                  <ChevronDown className={`w-5 h-5 transition-transform duration-200 ${
                    !isYearSelected ? 'text-slate-300' : 'text-slate-700'
                  } ${branchOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Branch / Group Dropdown Menu */}
                {branchOpen && isYearSelected && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-100 shadow-[0_12px_30px_rgba(0,0,0,0.1)] p-2 z-30 max-h-72 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
                    {availableBranches.map((br) => (
                      <button
                        key={br}
                        type="button"
                        onClick={() => handleSelectBranch(br)}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-between ${
                          selectedBranch === br
                            ? 'bg-indigo-50 text-indigo-700 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate pr-2 font-medium">{br}</span>
                        {selectedBranch === br && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Password Input */}
              <div className="relative">
                <div className="w-full h-14 sm:h-16 px-5 sm:px-6 bg-white rounded-2xl border border-slate-200/80 hover:border-slate-300 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-50 transition-all flex items-center justify-between shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                  <div className="flex items-center space-x-3.5 sm:space-x-4 flex-1">
                    <div className="text-slate-700">
                      <Lock className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setErrorMsg('');
                      }}
                      className="w-full text-base sm:text-lg font-medium text-slate-900 placeholder:text-slate-400 bg-transparent focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-slate-400 hover:text-slate-700 transition-colors p-1"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="flex items-center space-x-1.5 text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 animate-in fade-in duration-150">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Login Action Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className={`relative overflow-hidden w-full h-14 sm:h-16 rounded-2xl font-bold text-base sm:text-lg flex items-center justify-center space-x-2.5 transition-all duration-200 ${
                    isLoggingIn
                      ? 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-slate-900 text-white shadow-lg ring-2 ring-indigo-300/70 scale-[0.99] cursor-wait'
                      : 'bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white shadow-md hover:shadow-xl hover:-translate-y-0.5 cursor-pointer'
                  }`}
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="w-5 h-5 text-indigo-200 animate-spin shrink-0" />
                      <span className="animate-pulse">Logging in...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-5 h-5 text-indigo-400" />
                      <span>Login</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          ) : (
            /* Logged in state / Confirmation */
            <div className="space-y-6 text-center py-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                <Check className="w-8 h-8 stroke-[2.5]" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                  Coordinator Logged In
                </h2>
                <p className="text-sm text-slate-500">
                  Access granted for <strong>{selectedYear}</strong> — <strong>{selectedBranch}</strong>.
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-600 text-left space-y-1">
                <div><strong>Assigned Year:</strong> {selectedYear}</div>
                <div><strong>Assigned Branch:</strong> {selectedBranch}</div>
                <div><strong>Role:</strong> Academic Department Coordinator</div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setLoginSuccess(false);
                  setPassword('');
                }}
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                <span>Logout / Switch User</span>
              </button>
            </div>
          )}



        </div>

      </div>

    </div>
  );
}
