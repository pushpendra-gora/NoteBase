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
  Loader2,
  MoreVertical,
  Info,
  X,
  Eye,
  Download,
  WifiOff
} from 'lucide-react';
import { 
  FIRST_YEAR_GROUPS, 
  STANDARD_BRANCHES, 
  YEAR_SEMESTER_MAP, 
  YEARS 
} from '../data/notesData';
import { BranchOption, NoteDocument, SemesterOption, YearOption } from '../types';
import {
  getAllOfflineBlobIds,
  getOfflineFileBlob,
  getSavedCachedIdSet,
  getSavedOfflineDocsMap,
  isAndroidStudentApp,
  isDeviceOffline,
} from '../lib/offlineCache';
import { detectPreviewFileCategory, resolveDocumentFilename } from '../lib/fileValidation';
import PdfPreviewModal from '../components/PdfPreviewModal';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [isAndroidApp, setIsAndroidApp] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [showOpenedFilesPanel, setShowOpenedFilesPanel] = useState(false);
  const [savedSearchQuery, setSavedSearchQuery] = useState('');
  const [offlineSavedDocs, setOfflineSavedDocs] = useState<NoteDocument[]>([]);
  const [offlineActiveDoc, setOfflineActiveDoc] = useState<NoteDocument | null>(null);

  useEffect(() => {
    const appMode = isAndroidStudentApp();
    setIsAndroidApp(appMode);
    if (!appMode) {
      setIsOffline(false);
      setOfflineSavedDocs([]);
      return;
    }

    const refreshOfflineDocs = async () => {
      const offline = isDeviceOffline();
      setIsOffline(offline);

      const bridge = (window as any).NoteBaseAndroid;
      const savedMap = getSavedOfflineDocsMap();
      const cachedIds = getSavedCachedIdSet();
      const idbIds = await getAllOfflineBlobIds().catch(() => [] as string[]);
      idbIds.forEach((id) => cachedIds.add(id));

      const verified = Object.values(savedMap).filter((doc) => {
        if (!doc || !doc.id) return false;
        if (!doc.file_url && !doc.file_path) return false;
        return cachedIds.has(doc.id) || Boolean(bridge?.isPdfCachedOnDisk?.(doc.id));
      });
      setOfflineSavedDocs(verified);
    };

    refreshOfflineDocs();
    const onOnline = () => {
      setIsOffline(false);
      refreshOfflineDocs();
    };
    const onOffline = () => {
      refreshOfflineDocs();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', refreshOfflineDocs);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', refreshOfflineDocs);
    };
  }, []);

  const filteredOpenedDocs = useMemo(() => {
    const q = savedSearchQuery.trim().toLowerCase();
    if (!q) return offlineSavedDocs;
    return offlineSavedDocs.filter(
      (d) =>
        (d.title || '').toLowerCase().includes(q) ||
        (d.subject || '').toLowerCase().includes(q) ||
        (d.semester || '').toLowerCase().includes(q) ||
        (d.year || '').toLowerCase().includes(q)
    );
  }, [offlineSavedDocs, savedSearchQuery]);

  const handleOfflineDownload = async (doc: NoteDocument) => {
    const safeTitle = (doc.title || 'document').replace(/[/\\?%*:|"<>]/g, '_');
    const filename = resolveDocumentFilename(safeTitle);
    const cached = await getOfflineFileBlob(doc.id);
    if (cached) {
      const blobUrl = URL.createObjectURL(cached.blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        try {
          document.body.removeChild(link);
        } catch {}
        URL.revokeObjectURL(blobUrl);
      }, 500);
      return;
    }
    const bridge = (window as any).NoteBaseAndroid;
    const rawUrl = doc.file_url || doc.file_path || '';
    if (bridge?.downloadPdf && rawUrl) {
      bridge.downloadPdf(doc.id, rawUrl, filename);
    }
  };

  const yearRef = useRef<HTMLDivElement>(null);
  const branchRef = useRef<HTMLDivElement>(null);
  const semesterRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    // Close any open dropdown or modal on mobile back button
    const handlePopState = () => {
      setYearOpen(false);
      setBranchOpen(false);
      setSemesterOpen(false);
      setTypeOpen(false);
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
          <div ref={menuRef} className="absolute top-4 right-4 sm:top-6 sm:right-6 z-40">
            <button
              type="button"
              onClick={() => {
                setMenuOpen((prev) => !prev);
                setYearOpen(false);
                setBranchOpen(false);
                setSemesterOpen(false);
                setTypeOpen(false);
              }}
              aria-label="More options"
              title="More options"
              className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer shadow-xs"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl border border-slate-100 shadow-[0_12px_30px_rgba(0,0,0,0.12)] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-0.5">
                {isAndroidApp && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowOpenedFilesPanel((v) => !v);
                    }}
                    className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>My Opened Files</span>
                    </span>
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      {offlineSavedDocs.length}
                    </span>
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

          {/* Quick Trigger ONLY in Android Student App to view previously opened files anytime (Online or Offline) */}
          {isAndroidApp && !isOffline && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setShowOpenedFilesPanel((v) => !v)}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-50/80 hover:bg-emerald-100/80 border border-emerald-200/80 text-emerald-800 text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition-colors cursor-pointer"
              >
                <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  {showOpenedFilesPanel ? 'Hide' : 'View'} My Opened Files ({offlineSavedDocs.length})
                </span>
              </button>
            </div>
          )}

        </div>

        {/* APP-ONLY PREVIOUSLY OPENED FILES SECTION (Available Anytime Inside Android App — Never in Browser) */}
        {isAndroidApp && (isOffline || showOpenedFilesPanel) && (
          <div
            className={`w-full mt-4 bg-white rounded-[28px] border shadow-[0_12px_36px_rgba(15,23,42,0.06)] p-5 sm:p-7 space-y-4 animate-in fade-in duration-200 ${
              isOffline ? 'border-amber-200/90' : 'border-emerald-200/80'
            }`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    isOffline
                      ? 'bg-amber-50 text-amber-600 border-amber-200'
                      : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                  }`}
                >
                  {isOffline ? <WifiOff className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                    {isOffline
                      ? `Offline Mode • My Opened Files (${offlineSavedDocs.length})`
                      : `My Opened Files (${offlineSavedDocs.length})`}
                  </h2>
                  <p className="text-[11px] text-slate-500 truncate">
                    Files you previously opened in NoteBase App (available anytime, even offline)
                  </p>
                </div>
              </div>
              <span className="shrink-0 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                {isOffline ? 'No Network Needed' : 'Saved in App'}
              </span>
            </div>

            {offlineSavedDocs.length > 3 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={savedSearchQuery}
                  onChange={(e) => setSavedSearchQuery(e.target.value)}
                  placeholder="Search your saved files..."
                  className="w-full h-10 pl-9 pr-8 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                {savedSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setSavedSearchQuery('')}
                    className="p-1 text-slate-400 hover:text-slate-600 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {filteredOpenedDocs.length > 0 ? (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {filteredOpenedDocs.map((doc) => {
                  const cat = detectPreviewFileCategory(doc.title, doc.file_url, doc.file_path);
                  const badgeLabel = cat === 'image' ? 'IMG' : cat === 'html' ? 'HTML' : 'PDF';
                  const badgeColor =
                    cat === 'image'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : cat === 'html'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-red-50 text-red-700 border-red-200';

                  return (
                    <div
                      key={`home-offline-${doc.id}`}
                      onClick={() => setOfflineActiveDoc(doc)}
                      className="p-3.5 rounded-2xl border border-slate-100 hover:border-indigo-200 bg-slate-50/70 hover:bg-white transition-all flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <span className={`px-2 py-1 rounded-lg border text-[10px] font-extrabold shrink-0 ${badgeColor}`}>
                          {badgeLabel}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-indigo-600 truncate">
                            {doc.title}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {doc.subject} • {doc.semester} • {doc.year}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOfflineDownload(doc);
                          }}
                          title="Save / Download Offline Copy"
                          className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 flex items-center justify-center cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <span className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-[#3b49df] text-white text-[11px] font-bold">
                          <Eye className="w-3.5 h-3.5" />
                          <span>Open</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : offlineSavedDocs.length > 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">
                No saved files match &ldquo;{savedSearchQuery}&rdquo;.
              </p>
            ) : (
              <div className="p-5 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-1">
                <p className="text-xs font-bold text-slate-700">No Previously Opened Files Saved Yet</p>
                <p className="text-[11px] text-slate-500">
                  Open any Notes, PYQ, Image, or HTML file in the app once — it will automatically appear here anytime, even without internet.
                </p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* App-Only Saved File Preview Modal right from Home Page */}
      {isAndroidApp && (
        <PdfPreviewModal
          doc={
            offlineActiveDoc
              ? {
                  id: offlineActiveDoc.id,
                  title: offlineActiveDoc.title,
                  type: offlineActiveDoc.type,
                  subtitle: `${offlineActiveDoc.year} • ${offlineActiveDoc.branch} • ${offlineActiveDoc.semester}`,
                  file_url: offlineActiveDoc.file_url,
                  file_path: offlineActiveDoc.file_path,
                  missingAttachmentMessage: 'This file is not cached locally in app storage yet.',
                }
              : null
          }
          isCached={true}
          onClose={() => setOfflineActiveDoc(null)}
          onDownload={offlineActiveDoc ? () => handleOfflineDownload(offlineActiveDoc) : undefined}
        />
      )}

      {/* About Modal */}
      {aboutOpen && (
        <div
          onClick={() => setAboutOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
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
        </div>
      )}

    </div>
  );
}
