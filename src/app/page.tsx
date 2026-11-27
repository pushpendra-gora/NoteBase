'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Calendar, 
  Layers, 
  GraduationCap, 
  ChevronDown, 
  Check, 
  FileText,
  Search,
  RotateCcw,
  Video,
  Loader2
} from 'lucide-react';
import { 
  FIRST_YEAR_GROUPS, 
  STANDARD_BRANCHES, 
  YEAR_SEMESTER_MAP, 
  YEARS 
} from '../data/notesData';
import { BranchOption, SemesterOption, YearOption } from '../types';
import PortalAboutMenu from '../components/PortalAboutMenu';

export default function NoteBaseHome() {
  const router = useRouter();

  // Persistent filters: restore on mount so back navigation never resets choices
  const [selectedYear, setSelectedYear] = useState<YearOption | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('notebase_filter_year');
        if (saved && YEARS.includes(saved as YearOption)) return saved as YearOption;
      } catch {}
    }
    return null;
  });
  const [selectedBranch, setSelectedBranch] = useState<BranchOption | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('notebase_filter_branch');
        if (saved) return saved as BranchOption;
      } catch {}
    }
    return null;
  });
  const [selectedSemester, setSelectedSemester] = useState<SemesterOption | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('notebase_filter_semester');
        if (saved) return saved as SemesterOption;
      } catch {}
    }
    return null;
  });
  const [selectedType, setSelectedType] = useState<'Notes' | 'PYQ' | 'Lectures' | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('notebase_filter_type');
        if (saved && ['Notes', 'PYQ', 'Lectures'].includes(saved)) return saved as 'Notes' | 'PYQ' | 'Lectures';
      } catch {}
    }
    return null;
  });
  const [isSearching, setIsSearching] = useState(false);

  // Sync selected filters to local storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        if (selectedYear) localStorage.setItem('notebase_filter_year', selectedYear);
        else localStorage.removeItem('notebase_filter_year');

        if (selectedBranch) localStorage.setItem('notebase_filter_branch', selectedBranch);
        else localStorage.removeItem('notebase_filter_branch');

        if (selectedSemester) localStorage.setItem('notebase_filter_semester', selectedSemester);
        else localStorage.removeItem('notebase_filter_semester');

        if (selectedType) localStorage.setItem('notebase_filter_type', selectedType);
        else localStorage.removeItem('notebase_filter_type');
      } catch {}
    }
  }, [selectedYear, selectedBranch, selectedSemester, selectedType]);

  // Reset search button spinner when returning back to Home and prefetch results shell for offline speed
  useEffect(() => {
    setIsSearching(false);
    try {
      router.prefetch('/results');
    } catch {}
  }, [router]);

  // Dropdown open states
  const [yearOpen, setYearOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [semesterOpen, setSemesterOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);

  const yearRef = useRef<HTMLDivElement>(null);
  const branchRef = useRef<HTMLDivElement>(null);
  const semesterRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (yearRef.current && !yearRef.current.contains(event.target as Node)) {
        setYearOpen(false);
      }
      if (branchRef.current && !branchRef.current.contains(event.target as Node)) {
        setBranchOpen(false);
      }
      if (semesterRef.current && !semesterRef.current.contains(event.target as Node)) {
        setSemesterOpen(false);
      }
      if (typeRef.current && !typeRef.current.contains(event.target as Node)) {
        setTypeOpen(false);
      }
    }

    // Close any open dropdown or modal on mobile back button
    const handlePopState = () => {
      setYearOpen(false);
      setBranchOpen(false);
      setSemesterOpen(false);
      setTypeOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('popstate', handlePopState);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Sequential Unlock Conditions (Top-to-Bottom order)
  const isYearSelected = selectedYear !== null;
  const isBranchSelected = isYearSelected && selectedBranch !== null;
  const isSemesterSelected = isBranchSelected && selectedSemester !== null;
  const allFiltersSelected = isSemesterSelected && selectedType !== null;

  // Compute available Semesters based on selected Year
  const availableSemesters = useMemo<SemesterOption[]>(() => {
    if (!selectedYear) return [];
    return YEAR_SEMESTER_MAP[selectedYear];
  }, [selectedYear]);

  // Compute available Branches or Groups based on Year
  const availableBranches = useMemo<BranchOption[]>(() => {
    if (selectedYear === '1st Year') {
      return FIRST_YEAR_GROUPS;
    }
    return STANDARD_BRANCHES;
  }, [selectedYear]);

  // 1. Handle Year Selection (Resets all subsequent downstream filters)
  const handleSelectYear = (yr: YearOption) => {
    setSelectedYear(yr);
    setSelectedBranch(null);
    setSelectedSemester(null);
    setSelectedType(null);
    setYearOpen(false);
  };

  // 2. Handle Branch Selection (Resets Semester and Type)
  const handleSelectBranch = (br: BranchOption) => {
    setSelectedBranch(br);
    setSelectedSemester(null);
    setSelectedType(null);
    setBranchOpen(false);
  };

  // 3. Handle Semester Selection (Resets Type)
  const handleSelectSemester = (sem: SemesterOption) => {
    setSelectedSemester(sem);
    setSelectedType(null);
    setSemesterOpen(false);
  };

  // 4. Handle Type Selection
  const handleSelectType = (t: 'Notes' | 'PYQ' | 'Lectures') => {
    setSelectedType(t);
    setTypeOpen(false);
  };

  // Clear all selections
  const handleClearFilters = () => {
    setSelectedYear(null);
    setSelectedBranch(null);
    setSelectedSemester(null);
    setSelectedType(null);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('notebase_filter_year');
        localStorage.removeItem('notebase_filter_branch');
        localStorage.removeItem('notebase_filter_semester');
        localStorage.removeItem('notebase_filter_type');
      } catch {}
    }
  };

  // Search Navigation: Opens the new results page with query params
  const handleSearch = () => {
    if (!allFiltersSelected || !selectedYear || !selectedBranch || !selectedSemester || !selectedType) {
      return;
    }
    setIsSearching(true);
    const query = new URLSearchParams({
      year: selectedYear,
      branch: selectedBranch,
      semester: selectedSemester,
      type: selectedType
    }).toString();

    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(`notebase_active_subj_${selectedYear}_${selectedBranch}_${selectedSemester}`);
      } catch {}
    }

    const targetUrl = `/results?${query}`;
    const bridge = typeof window !== 'undefined' ? (window as any).NoteBaseAndroid : null;
    const isOffline =
      typeof navigator !== 'undefined' && (!navigator.onLine || (bridge?.isNetworkConnected && !bridge.isNetworkConnected()));

    if (isOffline) {
      window.location.assign(targetUrl);
      return;
    }

    router.push(targetUrl);
  };

  // Branch button label text
  const branchLabel = useMemo(() => {
    if (selectedBranch) return selectedBranch;
    return 'Branch';
  }, [selectedBranch]);

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full max-w-[100vw] bg-[#f3effb] relative flex flex-col items-center overflow-x-hidden overflow-y-auto overscroll-none overscroll-x-none overscroll-y-none touch-pan-y pt-[max(env(safe-area-inset-top),2rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)] px-3.5 sm:p-6 select-none selection:bg-purple-200">
      
      {/* Background Soft Pastel Blobs contained strictly inside viewport so horizontal scrolling never appears */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-80px] left-[-80px] w-96 h-96 bg-[#e8dcfa]/60 rounded-full blur-3xl" />
        <div className="absolute bottom-[-100px] right-[-100px] w-[450px] h-[450px] bg-[#dfd4f6]/50 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-[-150px] w-80 h-80 bg-[#ede4fc]/40 rounded-full blur-3xl" />
      </div>

      {/* Main Container */}
      <div className="w-full max-w-xl mx-auto my-auto flex flex-col items-center relative z-10 py-4 sm:py-8">
        
        {/* The Exact White Card from the Reference Image */}
        <div className="relative w-full bg-white rounded-[28px] sm:rounded-[36px] shadow-[0_20px_50px_rgba(79,70,229,0.06),0_4px_16px_rgba(0,0,0,0.03)] border border-slate-100/90 p-5 sm:p-12 transition-all">
          
          {/* Top-Right 3-Dot Menu */}
          <PortalAboutMenu
            enableStudentIssue
            onOpenMenu={() => {
              setYearOpen(false);
              setBranchOpen(false);
              setSemesterOpen(false);
              setTypeOpen(false);
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
          </div>

          {/* 4 Cascading Dropdown Filters: Year -> Branch -> Semester -> Type */}
          <div className="space-y-4">
            
            {/* Step 1. Year Dropdown */}
            <div className="relative" ref={yearRef}>
              <button
                type="button"
                onClick={() => {
                  setYearOpen(!yearOpen);
                  setBranchOpen(false);
                  setSemesterOpen(false);
                  setTypeOpen(false);
                }}
                className={`w-full h-14 sm:h-16 px-4 sm:px-6 bg-white rounded-2xl border transition-all flex items-center justify-between gap-2 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-md ${
                  yearOpen 
                    ? 'border-indigo-400 ring-2 ring-indigo-50' 
                    : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                  <div className="text-slate-700 shrink-0">
                    <Calendar className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
                  </div>
                  <span className={`text-[15px] sm:text-lg font-medium truncate ${
                    selectedYear ? 'text-slate-900 font-semibold' : 'text-slate-800'
                  }`}>
                    {selectedYear || 'Year'}
                  </span>
                </div>
                <ChevronDown className={`w-5 h-5 text-slate-700 shrink-0 transition-transform duration-200 ${
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

            {/* Step 2. Branch / Group Dropdown */}
            <div className="relative" ref={branchRef}>
              <button
                type="button"
                disabled={!isYearSelected}
                onClick={() => {
                  if (!isYearSelected) return;
                  setBranchOpen(!branchOpen);
                  setYearOpen(false);
                  setSemesterOpen(false);
                  setTypeOpen(false);
                }}
                className={`w-full h-14 sm:h-16 px-4 sm:px-6 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                  !isYearSelected
                    ? 'opacity-40 cursor-not-allowed bg-slate-50/70 border-slate-200/50 text-slate-400 shadow-none'
                    : branchOpen
                      ? 'bg-white border-indigo-400 ring-2 ring-indigo-50 shadow-md'
                      : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-md cursor-pointer'
                }`}
              >
                <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                  <div className={`shrink-0 ${isYearSelected ? 'text-slate-700' : 'text-slate-400'}`}>
                    <Layers className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
                  </div>
                  <span className={`text-[15px] sm:text-lg font-medium truncate ${
                    selectedBranch 
                      ? 'text-slate-900 font-semibold' 
                      : isYearSelected 
                        ? 'text-slate-800' 
                        : 'text-slate-400'
                  }`}>
                    {branchLabel}
                  </span>
                </div>
                <ChevronDown className={`w-5 h-5 shrink-0 transition-transform duration-200 ${
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
                      className={`w-full text-left px-3.5 sm:px-4 py-3 rounded-xl text-xs sm:text-sm font-medium transition-colors flex items-center justify-between gap-2 ${
                        selectedBranch === br
                          ? 'bg-indigo-50 text-indigo-700 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="leading-snug font-medium">{br}</span>
                      {selectedBranch === br && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 3. Semester Dropdown */}
            <div className="relative" ref={semesterRef}>
              <button
                type="button"
                disabled={!isBranchSelected}
                onClick={() => {
                  if (!isBranchSelected) return;
                  setSemesterOpen(!semesterOpen);
                  setYearOpen(false);
                  setBranchOpen(false);
                  setTypeOpen(false);
                }}
                className={`w-full h-14 sm:h-16 px-4 sm:px-6 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                  !isBranchSelected
                    ? 'opacity-40 cursor-not-allowed bg-slate-50/70 border-slate-200/50 text-slate-400 shadow-none'
                    : semesterOpen
                      ? 'bg-white border-indigo-400 ring-2 ring-indigo-50 shadow-md'
                      : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-md cursor-pointer'
                }`}
              >
                <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                  <div className={`shrink-0 ${isBranchSelected ? 'text-slate-700' : 'text-slate-400'}`}>
                    <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
                  </div>
                  <span className={`text-[15px] sm:text-lg font-medium truncate ${
                    selectedSemester 
                      ? 'text-slate-900 font-semibold' 
                      : isBranchSelected 
                        ? 'text-slate-800' 
                        : 'text-slate-400'
                  }`}>
                    {selectedSemester || 'Semester'}
                  </span>
                </div>
                <ChevronDown className={`w-5 h-5 shrink-0 transition-transform duration-200 ${
                  !isBranchSelected ? 'text-slate-300' : 'text-slate-700'
                } ${semesterOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Semester Dropdown Menu */}
              {semesterOpen && isBranchSelected && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-100 shadow-[0_12px_30px_rgba(0,0,0,0.1)] p-2 z-30 max-h-64 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
                  {availableSemesters.map((sem) => (
                    <button
                      key={sem}
                      type="button"
                      onClick={() => handleSelectSemester(sem)}
                      className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-between ${
                        selectedSemester === sem
                          ? 'bg-indigo-50 text-indigo-700 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{sem}</span>
                      {selectedSemester === sem && <Check className="w-4 h-4 text-indigo-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 4. Type Dropdown */}
            <div className="relative" ref={typeRef}>
              <button
                type="button"
                disabled={!isSemesterSelected}
                onClick={() => {
                  if (!isSemesterSelected) return;
                  setTypeOpen(!typeOpen);
                  setYearOpen(false);
                  setBranchOpen(false);
                  setSemesterOpen(false);
                }}
                className={`w-full h-14 sm:h-16 px-4 sm:px-6 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                  !isSemesterSelected
                    ? 'opacity-40 cursor-not-allowed bg-slate-50/70 border-slate-200/50 text-slate-400 shadow-none'
                    : typeOpen
                      ? 'bg-white border-indigo-400 ring-2 ring-indigo-50 shadow-md'
                      : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-md cursor-pointer'
                }`}
              >
                <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                  <div className={`shrink-0 ${isSemesterSelected ? 'text-slate-700' : 'text-slate-400'}`}>
                    {selectedType === 'Lectures' ? (
                      <Video className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2] text-purple-600" />
                    ) : (
                      <FileText className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
                    )}
                  </div>
                  <span className={`text-[15px] sm:text-lg font-medium truncate ${
                    selectedType 
                      ? 'text-slate-900 font-semibold' 
                      : isSemesterSelected 
                        ? 'text-slate-800' 
                        : 'text-slate-400'
                  }`}>
                    {selectedType || 'Type (Notes / PYQ / Lectures)'}
                  </span>
                </div>
                <ChevronDown className={`w-5 h-5 shrink-0 transition-transform duration-200 ${
                  !isSemesterSelected ? 'text-slate-300' : 'text-slate-700'
                } ${typeOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Type Dropdown Menu (Notes, PYQ, or Lectures) */}
              {typeOpen && isSemesterSelected && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-100 shadow-[0_12px_30px_rgba(0,0,0,0.1)] p-2 z-30 animate-in fade-in zoom-in-95 duration-150">
                  {(['Notes', 'PYQ', 'Lectures'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleSelectType(t)}
                      className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-between ${
                        selectedType === t
                          ? 'bg-indigo-50 text-indigo-700 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className={`w-2 h-2 rounded-full ${
                          t === 'Notes' ? 'bg-blue-500' : t === 'PYQ' ? 'bg-amber-500' : 'bg-purple-500'
                        }`} />
                        <span className="font-medium">{t}</span>
                      </div>
                      {selectedType === t && <Check className="w-4 h-4 text-indigo-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Action Row below: Small Search button on the Right Side once Type is selected */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between min-h-[46px]">
            {isYearSelected ? (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-700 font-medium transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            ) : (
              <div />
            )}

            {allFiltersSelected && (
              <button
                type="button"
                onClick={handleSearch}
                disabled={isSearching}
                className="inline-flex items-center space-x-1.5 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-xs sm:text-sm shadow-sm hover:shadow hover:-translate-y-0.5 transition-all duration-150 animate-in fade-in zoom-in-95 cursor-pointer ml-auto disabled:opacity-80"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 text-indigo-400" />
                    <span>Search</span>
                  </>
                )}
              </button>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
