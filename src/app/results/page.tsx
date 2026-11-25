'use client';

import React, { Suspense, useState, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Eye, 
  Download, 
  Check, 
  ShieldCheck, 
  FileText, 
  HelpCircle, 
  X, 
  Calendar, 
  Layers, 
  GraduationCap, 
  Search,
  BookOpen,
  Sparkles,
  FileDown,
  Maximize2,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  Video,
  Play,
  PlayCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { getDocumentsFor, getSubjectsFor, saveSubjectsFor, SubjectMeta } from '../../data/notesData';
import { BranchOption, NoteDocument, SemesterOption, YearOption, LectureItem } from '../../types';
import { isSupabaseConfigured } from '../../lib/supabase';
import { fetchDocumentsFromSupabase, fetchLecturesFromSupabase, fetchSubjectsFromSupabase } from '../../lib/supabaseService';

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const year = searchParams.get('year') as YearOption | null;
  const branch = searchParams.get('branch') as BranchOption | null;
  const semester = searchParams.get('semester') as SemesterOption | null;
  const type = searchParams.get('type') as 'Notes' | 'PYQ' | 'Lectures' | null;
  const isLectures = type === 'Lectures';

  // Active document modal state (Only loaded on-demand when student clicks a PDF)
  const [activeDoc, setActiveDoc] = useState<NoteDocument | null>(null);
  const [activeLecture, setActiveLecture] = useState<LectureItem | null>(null);

  // Sync mobile native back button / gestures with modals (closes modals on back)
  useEffect(() => {
    const handlePopState = () => {
      setActiveDoc(null);
      setActiveLecture(null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const openDocModal = (doc: NoteDocument) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'pdf' }, '');
    }
    setActiveDoc(doc);
  };

  const closeDocModal = () => {
    if (typeof window !== 'undefined' && window.history.state?.modal) {
      window.history.back();
    } else {
      setActiveDoc(null);
    }
  };

  const openLectureModal = (lec: LectureItem) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'video' }, '');
    }
    setActiveLecture(lec);
  };

  const closeLectureModal = () => {
    if (typeof window !== 'undefined' && window.history.state?.modal) {
      window.history.back();
    } else {
      setActiveLecture(null);
    }
  };
  const [isIframeLoading, setIsIframeLoading] = useState(true);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [subjectsVersion, setSubjectsVersion] = useState(0);

  // Local device storage cache for already-opened PDFs (instant offline reopening)
  const [cachedPdfIds, setCachedPdfIds] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('notebase_cached_pdf_ids');
        if (saved) return new Set(JSON.parse(saved));
      } catch {}
    }
    return new Set<string>();
  });

  // Reset iframe loading state whenever student opens a new PDF
  useEffect(() => {
    if (activeDoc) {
      // If already cached locally, skip waiting spinner
      setIsIframeLoading(!cachedPdfIds.has(activeDoc.id));
    }
  }, [activeDoc, cachedPdfIds]);

  // Listen for dynamic subject updates made by coordinators
  useEffect(() => {
    const handleUpdate = () => setSubjectsVersion((v) => v + 1);
    window.addEventListener('notehub_subjects_changed', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('notehub_subjects_changed', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  // Supabase cloud subjects
  const [cloudSubjects, setCloudSubjects] = useState<SubjectMeta[]>([]);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && year && branch && semester) {
      const local = getSubjectsFor(year, branch, semester);
      if (local && local.length > 0) return false;
    }
    return true;
  });

  // Fetch subjects from Supabase cloud on mount if configured
  useEffect(() => {
    let isMounted = true;
    if (!year || !branch || !semester) {
      setIsLoadingSubjects(false);
      return;
    }

    const local = getSubjectsFor(year, branch, semester);
    if (!local || local.length === 0) {
      setIsLoadingSubjects(true);
    }

    if (isSupabaseConfigured()) {
      fetchSubjectsFromSupabase(year, branch, semester).then((cloudSubjs) => {
        if (isMounted) {
          if (cloudSubjs && cloudSubjs.length > 0) {
            setCloudSubjects(cloudSubjs);
            saveSubjectsFor(year, branch, semester, cloudSubjs);
            setSubjectsVersion((v) => v + 1);
          }
          setIsLoadingSubjects(false);
        }
      }).catch(() => {
        if (isMounted) setIsLoadingSubjects(false);
      });
    } else {
      setIsLoadingSubjects(false);
    }
    return () => {
      isMounted = false;
    };
  }, [year, branch, semester]);

  // Retrieve subjects belonging to this Year, Branch, and Semester (only coordinator-added)
  const subjectsList = useMemo(() => {
    if (!year || !branch || !semester) return [];
    const local = getSubjectsFor(year, branch, semester);
    const localTitles = new Set(local.map((s) => s.title.toLowerCase()));
    const extra = cloudSubjects.filter((s) => !localTitles.has(s.title.toLowerCase()));
    return [...local, ...extra];
  }, [year, branch, semester, subjectsVersion, cloudSubjects]);

  // Selected subject filter: defaults to the 1st subject
  const [selectedSubject, setSelectedSubject] = useState<string>('');

  // Supabase cloud documents
  const [supabaseDocs, setSupabaseDocs] = useState<NoteDocument[]>([]);

  // Lecture items (from LocalStorage and Supabase Cloud)
  const [localLectures, setLocalLectures] = useState<LectureItem[]>([]);
  const [cloudLectures, setCloudLectures] = useState<LectureItem[]>([]);
  const [isLoadingLectures, setIsLoadingLectures] = useState<boolean>(() => type === 'Lectures');

  useEffect(() => {
    let isMounted = true;
    if (type !== 'Lectures') {
      setIsLoadingLectures(false);
      return;
    }

    // 1. LocalStorage
    const loadLocalLectures = () => {
      try {
        const raw = localStorage.getItem('notehub_custom_lectures');
        if (raw) {
          const parsed: LectureItem[] = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setLocalLectures(parsed);
          }
        }
      } catch {}
    };

    loadLocalLectures();
    window.addEventListener('storage', loadLocalLectures);

    // 2. Supabase Cloud
    if (year && branch && isSupabaseConfigured()) {
      setIsLoadingLectures(true);
      fetchLecturesFromSupabase(year, branch).then((cloudData) => {
        if (isMounted) {
          if (cloudData && cloudData.length > 0) {
            setCloudLectures(
              cloudData.map((l) => ({
                id: l.id,
                title: l.title,
                subject: l.subject,
                semester: l.semester,
                faculty: l.faculty,
                link: l.link,
                date: l.date
              }))
            );
          }
          setIsLoadingLectures(false);
        }
      }).catch(() => {
        if (isMounted) setIsLoadingLectures(false);
      });
    } else {
      setIsLoadingLectures(false);
    }

    return () => {
      isMounted = false;
      window.removeEventListener('storage', loadLocalLectures);
    };
  }, [year, branch, semester, type]);

  // Active selected subject (defaults to the first subject in list)
  const activeSubject = useMemo(() => {
    if (selectedSubject && subjectsList.some((s) => s.title === selectedSubject)) {
      return selectedSubject;
    }
    return subjectsList[0]?.title || '';
  }, [selectedSubject, subjectsList]);

  // Per-subject lazy-load cache: with persistent localStorage fallback
  const [subjectDocsCache, setSubjectDocsCache] = useState<Record<string, NoteDocument[]>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const key = `notebase_docs_${year || ''}_${branch || ''}_${semester || ''}_${type || ''}`;
        const saved = localStorage.getItem(key);
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return {};
  });
  const [isLoadingSubjectDocs, setIsLoadingSubjectDocs] = useState<boolean>(false);

  // Sync subject documents to localStorage whenever updated
  useEffect(() => {
    if (typeof window !== 'undefined' && year && branch && semester && type && Object.keys(subjectDocsCache).length > 0) {
      try {
        const key = `notebase_docs_${year}_${branch}_${semester}_${type}`;
        localStorage.setItem(key, JSON.stringify(subjectDocsCache));
      } catch {}
    }
  }, [subjectDocsCache, year, branch, semester, type]);

  // Lazy-load metadata strictly for the active subject currently viewed by the student
  useEffect(() => {
    let isMounted = true;
    if (!year || !branch || !semester || !activeSubject || type === 'Lectures') {
      return;
    }

    // If metadata for this subject was already loaded, reuse it instantly (0 network cost)
    if (subjectDocsCache[activeSubject] && subjectDocsCache[activeSubject].length > 0) {
      return;
    }

    setIsLoadingSubjectDocs(true);
    const targetType = type === 'PYQ' ? 'PYQ' : 'Notes';

    const loadSubjectMetadata = async () => {
      let fetchedDocs: NoteDocument[] = [];
      try {
        // Query server API for this specific subject only
        const res = await fetch(
          `/api/documents?year=${encodeURIComponent(year)}&branch=${encodeURIComponent(branch)}&semester=${encodeURIComponent(semester)}&type=${encodeURIComponent(targetType)}&subject=${encodeURIComponent(activeSubject)}`
        );
        const data = await res.json();
        if (res.ok && data.success && Array.isArray(data.documents)) {
          fetchedDocs = data.documents;
        } else if (isSupabaseConfigured()) {
          fetchedDocs = await fetchDocumentsFromSupabase(year, branch, semester, targetType, activeSubject);
        }
      } catch {
        if (isSupabaseConfigured()) {
          fetchedDocs = await fetchDocumentsFromSupabase(year, branch, semester, targetType, activeSubject);
        }
      }

      // Merge with any local documents created for this exact subject
      const localDocs = getDocumentsFor(year, branch, semester).filter(
        (d) => d.type === targetType && d.subject === activeSubject
      );
      const fetchedIds = new Set(fetchedDocs.map((d) => d.id));
      const combined = [...fetchedDocs, ...localDocs.filter((d) => !fetchedIds.has(d.id))];

      if (isMounted) {
        setSubjectDocsCache((prev) => ({
          ...prev,
          [activeSubject]: combined
        }));
        setIsLoadingSubjectDocs(false);
      }
    };

    loadSubjectMetadata();

    return () => {
      isMounted = false;
    };
  }, [year, branch, semester, type, activeSubject, subjectsVersion]);

  // Filtered lectures for current activeSubject and semester (Supabase Cloud is primary)
  const displayedLectures = useMemo(() => {
    if (!activeSubject) return [];

    const cloudIds = new Set(cloudLectures.map((l) => l.id));
    const merged = [...cloudLectures, ...localLectures.filter((l) => !cloudIds.has(l.id))];

    return merged.filter((l) => {
      const matchSubj = l.subject.trim().toLowerCase() === activeSubject.trim().toLowerCase();
      const matchSem = !semester || l.semester.trim().toLowerCase() === semester.trim().toLowerCase();
      return matchSubj && matchSem;
    });
  }, [localLectures, cloudLectures, activeSubject, semester]);

  // Displayed documents strictly for the currently viewed subject
  const displayedDocuments = useMemo(() => {
    if (!activeSubject) return [];
    return subjectDocsCache[activeSubject] || [];
  }, [subjectDocsCache, activeSubject]);

  // Check if documents for the active subject are currently being loaded/checked
  const isDocLoadingForActive = useMemo(() => {
    if (type === 'Lectures') return false;
    if (isLoadingSubjects) return true;
    if (!activeSubject) return false;
    if (isLoadingSubjectDocs) return true;
    return subjectDocsCache[activeSubject] === undefined;
  }, [type, isLoadingSubjects, activeSubject, isLoadingSubjectDocs, subjectDocsCache]);

  // Helper to convert Google Drive or direct link to embeddable preview iframe URL
  const getPdfEmbedUrl = (url?: string): string => {
    if (!url) return '';
    // Handle gdrive:// protocol
    const gdriveProtocol = url.match(/^gdrive:\/\/([a-zA-Z0-9_-]+)/);
    if (gdriveProtocol && gdriveProtocol[1]) {
      return `https://drive.google.com/file/d/${gdriveProtocol[1]}/preview`;
    }
    // Standard Google Drive file view link
    const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    }
    // Google Drive open?id= link
    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1] && url.includes('drive.google.com')) {
      return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
    }
    return url;
  };

  // Helper to convert any YouTube URL into a seamless embedded in-app player URL
  const getYouTubeEmbedUrl = (url?: string): string => {
    if (!url) return '';
    const trimmed = url.trim();

    // Already an embed URL
    if (trimmed.includes('youtube.com/embed/')) {
      const glue = trimmed.includes('?') ? '&' : '?';
      return `${trimmed}${glue}autoplay=1&playsinline=1&rel=0&modestbranding=1`;
    }

    let videoId = '';
    const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch && watchMatch[1]) {
      videoId = watchMatch[1];
    } else {
      const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      if (shortMatch && shortMatch[1]) {
        videoId = shortMatch[1];
      } else {
        const shortsMatch = trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
        if (shortsMatch && shortsMatch[1]) {
          videoId = shortsMatch[1];
        }
      }
    }

    if (videoId) {
      return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1`;
    }

    return trimmed;
  };

  const handleDownload = (doc: NoteDocument) => {
    let targetUrl = doc.file_url;
    if (targetUrl && targetUrl.startsWith('gdrive://')) {
      const fId = targetUrl.replace('gdrive://', '');
      targetUrl = `https://drive.google.com/file/d/${fId}/view?usp=sharing`;
    } else if (!targetUrl && doc.file_path && doc.file_path.startsWith('gdrive://')) {
      const fId = doc.file_path.replace('gdrive://', '');
      targetUrl = `https://drive.google.com/file/d/${fId}/view?usp=sharing`;
    }

    // If real PDF URL exists, open direct download link
    if (targetUrl) {
      let downloadUrl = targetUrl;
      const fileIdMatch = targetUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        downloadUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
      }

      setDownloadSuccess(true);

      const safeTitle = (doc.title || 'document').replace(/[/\\?%*:|"<>]/g, '_');
      const filename = safeTitle.toLowerCase().endsWith('.pdf') ? safeTitle : `${safeTitle}.pdf`;

      // Trigger direct download via invisible anchor tag for mobile browsers & WebView
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', filename);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        try {
          document.body.removeChild(link);
        } catch {}
      }, 300);

      setTimeout(() => setDownloadSuccess(false), 2500);
      return;
    }

    // No fake dummy PDF generated: alert student cleanly
    alert(`The actual PDF for "${doc.title}" has not been uploaded to Google Drive yet. Please contact your Branch Coordinator.`);
  };

  if (!year || !branch || !semester || !type) {
    return (
      <div className="min-h-screen bg-[#f3effb] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-lg border border-slate-100 space-y-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
            <Search className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">No Filters Selected</h2>
          <p className="text-sm text-slate-500">
            Please select Year, Branch, Semester, and Type on the home page first.
          </p>
          <Link
            href="/"
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-all shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go to NoteBase Search</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3effb] relative flex flex-col items-center pt-[max(env(safe-area-inset-top),2.25rem)] pb-6 px-3.5 sm:p-8 overflow-x-hidden selection:bg-purple-200">
      
      {/* Background Soft Blobs */}
      <div className="absolute top-[-80px] left-[-80px] w-96 h-96 bg-[#e8dcfa]/60 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-100px] right-[-100px] w-[450px] h-[450px] bg-[#dfd4f6]/50 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-4xl mx-auto space-y-5 sm:space-y-6 relative z-10 py-2 sm:py-4">
        
        {/* Top Header & Breadcrumbs Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1 sm:py-2 px-1">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors w-fit group"
          >
            <img src="/logo.png?v=2" alt="NoteBase" className="w-6 h-6 object-contain" />
            <span className="font-extrabold text-slate-900">Note<span className="text-blue-600">Base</span></span>
            <span className="text-slate-300">/</span>
            <ArrowLeft className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-xs text-slate-600 font-medium">Back to Search</span>
          </Link>

          {/* Active Filter Badges */}
          <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
            <span className="bg-white/80 border border-slate-200/80 px-2.5 sm:px-3 py-1 rounded-full text-slate-700 font-medium shadow-sm">
              📅 {year}
            </span>
            <span className="bg-white/80 border border-slate-200/80 px-2.5 sm:px-3 py-1 rounded-full text-slate-700 font-medium shadow-sm truncate max-w-[160px] sm:max-w-[240px]">
              📚 {branch}
            </span>
            <span className="bg-white/80 border border-slate-200/80 px-2.5 sm:px-3 py-1 rounded-full text-slate-700 font-medium shadow-sm">
              🎓 {semester}
            </span>
            <span className={`px-2.5 sm:px-3 py-1 rounded-full font-bold shadow-sm ${
              type === 'Notes' 
                ? 'bg-blue-600 text-white' 
                : type === 'PYQ'
                ? 'bg-amber-600 text-white'
                : 'bg-purple-600 text-white'
            }`}>
              {type === 'Notes' ? '📄 Notes' : type === 'PYQ' ? '❓ PYQs' : '🎬 Lectures'}
            </span>
          </div>
        </div>

        {/* 1. SUBJECTS SECTION (Right Above Notes/PYQs as requested) */}
        <div className="bg-white rounded-3xl border border-slate-100/90 p-4 sm:p-7 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
          
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Select Subject
                </h2>
                <p className="text-xs text-slate-500 truncate">
                  {isLoadingSubjects ? 'Checking curriculum subjects...' : `${subjectsList.length} subjects found for ${semester} (${branch})`}
                </p>
              </div>
            </div>

            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 hidden sm:inline-block shrink-0">
              {isLectures ? 'Click subject to view Video Lectures' : 'Click subject to view PDFs'}
            </span>
          </div>

          {/* Subject Cards / Buttons Grid */}
          {isLoadingSubjects ? (
            <div className="py-8 px-4 text-center rounded-2xl bg-slate-50/70 border border-slate-100 flex flex-col items-center justify-center space-y-2">
              <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
              <p className="text-xs font-semibold text-slate-600">Loading curriculum subjects for {branch}...</p>
            </div>
          ) : subjectsList.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
              {/* Individual Subjects */}
              {subjectsList.map((subj) => {
                const isSelected = activeSubject === subj.title;

                return (
                  <button
                    key={subj.code}
                    type="button"
                    onClick={() => setSelectedSubject(subj.title)}
                    className={`p-3 sm:p-3.5 rounded-2xl text-left transition-all border flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-[#3b49df] text-white border-[#3b49df] shadow-md shadow-indigo-100 ring-2 ring-indigo-200'
                        : 'bg-slate-50/70 hover:bg-white border-slate-200/70 hover:border-indigo-300 text-slate-800 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-[10px] ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/60 text-slate-700'
                      }`}>
                        {subj.code.slice(0, 3)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm font-bold truncate" title={subj.title}>
                          {subj.title}
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-white shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-10 px-4 text-center rounded-2xl bg-slate-50/70 border border-dashed border-slate-200 space-y-2">
              <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-slate-800">No Subjects Added Yet</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No subjects have been added by the coordinator for {branch} ({semester}). Subjects will appear here once the branch coordinator adds them.
              </p>
            </div>
          )}

        </div>

        {/* 2. MAIN CONTENT SECTION: VIDEO LECTURES OR PDF DOCUMENTS */}
        {isLoadingSubjects ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-10 sm:p-14 text-center shadow-sm space-y-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-sm">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm sm:text-base font-bold text-slate-800">
                Checking Available Notes & Materials...
              </h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Please wait a moment while we retrieve verified curriculum documents for {branch}.
              </p>
            </div>
          </div>
        ) : subjectsList.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
              <BookOpen className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-800">
              No Materials Available
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Materials will appear here as soon as the coordinator adds subjects and uploads verified lecture notes, PYQs, or videos.
            </p>
          </div>
        ) : isLectures ? (
          <div className="space-y-4">
            {/* Section Sub-heading */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 px-1">
              <div className="flex items-center space-x-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600 shrink-0" />
                <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                  {activeSubject} - Video Lectures ({displayedLectures.length})
                </h3>
              </div>
              <span className="text-[11px] sm:text-xs text-slate-500 pl-4 sm:pl-0">
                Click any lecture to Watch or Open Link
              </span>
            </div>

            {/* Video Lectures Cards List */}
            <div className="space-y-3">
              {isLoadingLectures ? (
                <div className="bg-white rounded-3xl border border-slate-100 p-8 sm:p-12 text-center shadow-sm space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                  </div>
                  <h4 className="text-sm sm:text-base font-bold text-slate-800">
                    Checking Video Lectures for {activeSubject}...
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Connecting to verified lecture library...
                  </p>
                </div>
              ) : displayedLectures.length > 0 ? (
                displayedLectures.map((lec) => (
                  <div
                    key={lec.id}
                    onClick={() => lec.link && openLectureModal(lec)}
                    className="bg-white rounded-3xl border border-slate-100/90 p-4 sm:p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_rgba(147,51,234,0.08)] hover:border-purple-200 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 group cursor-pointer"
                  >
                    {/* Left: Video Icon & Title Only (No small subtitle text) */}
                    <div className="flex items-center space-x-3.5 sm:space-x-4 min-w-0 flex-1">
                      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-purple-50 text-purple-600 flex flex-col items-center justify-center font-bold text-xs tracking-wider shrink-0 border border-purple-100 group-hover:bg-purple-600 group-hover:text-white transition-colors shadow-sm">
                        <Video className="w-4 h-4 sm:w-5 sm:h-5 mb-0.5" />
                        <span className="text-[8px] sm:text-[9px] leading-none">VIDEO</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-purple-600 transition-colors truncate" title={lec.title}>
                          {lec.title}
                        </h4>
                      </div>
                    </div>

                    {/* Right: Watch / In-App Play Button */}
                    <div className="flex items-center justify-end space-x-2.5 shrink-0 w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      {lec.link ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openLectureModal(lec);
                          }}
                          className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-2xl bg-[#3b49df] hover:bg-[#323fc0] text-white text-xs sm:text-sm font-semibold transition-all shadow-sm hover:shadow cursor-pointer"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>Watch in App</span>
                        </button>
                      ) : (
                        <span className="px-4 py-2.5 rounded-2xl bg-slate-100 text-slate-500 text-xs font-semibold">
                          Link coming soon
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-white rounded-3xl border border-slate-100 p-8 sm:p-12 text-center shadow-sm space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
                    <Video className="w-6 h-6" />
                  </div>
                  <h4 className="text-base font-bold text-slate-800">
                    No Video Lectures Uploaded Yet for {activeSubject}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Please check back soon or browse notes & PYQs for this subject.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Section Sub-heading */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 px-1">
              <div className="flex items-center space-x-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0" />
                <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                  {activeSubject} - {type === 'Notes' ? 'Study Notes' : 'PYQ'} PDFs ({displayedDocuments.length})
                </h3>
              </div>
              <span className="text-[11px] sm:text-xs text-slate-500 pl-4 sm:pl-0">
                Click any PDF to Open & Read
              </span>
            </div>

            {/* Documents Cards List */}
            <div className="space-y-3">
              {isDocLoadingForActive ? (
                <div className="bg-white rounded-3xl border border-slate-100 p-8 sm:p-12 text-center shadow-sm space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                  <h4 className="text-sm sm:text-base font-bold text-slate-800">
                    Loading {activeSubject} PDFs...
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Fetching study notes and PYQs for {activeSubject}...
                  </p>
                </div>
              ) : displayedDocuments.length > 0 ? (
                displayedDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => openDocModal(doc)}
                    className="bg-white rounded-3xl border border-slate-100/90 p-4 sm:p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_rgba(79,70,229,0.08)] hover:border-indigo-200 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 group"
                  >
                    {/* Left: Red PDF Icon & Document Info */}
                    <div className="flex items-start sm:items-center space-x-3.5 sm:space-x-4 min-w-0 flex-1">
                      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-red-50 text-red-600 flex flex-col items-center justify-center font-bold text-xs tracking-wider shrink-0 border border-red-100 group-hover:bg-red-600 group-hover:text-white transition-colors shadow-sm">
                        <FileText className="w-4 h-4 sm:w-5 sm:h-5 mb-0.5" />
                        <span className="text-[8px] sm:text-[9px] leading-none">PDF</span>
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center space-x-2 min-w-0">
                          <h4 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                            {doc.title}
                          </h4>
                          {cachedPdfIds.has(doc.id) && (
                            <span 
                              className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 inline-block ring-2 ring-emerald-200" 
                              title="Cached on Device" 
                            />
                          )}
                        </div>

                        <p className="text-[11px] sm:text-xs text-slate-500 font-medium flex items-center gap-x-1.5 gap-y-1 flex-wrap">
                          <strong className="text-slate-700 font-semibold">{doc.owner || 'Department Faculty'}</strong>
                          <span>• {doc.pages} Pages • {doc.size}</span>
                        </p>
                      </div>
                    </div>

                    {/* Right: Clickable Open & Download Buttons */}
                    <div className="flex items-center justify-end space-x-2.5 shrink-0 w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      
                      {/* Quick Download */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(doc);
                        }}
                        title="Download PDF file"
                        className="w-10 h-10 rounded-2xl bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 border border-slate-200/80 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      >
                        <Download className="w-4 h-4" />
                      </button>

                      {/* Open & View PDF */}
                      <button
                        type="button"
                        onClick={() => openDocModal(doc)}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center space-x-2 px-4 sm:px-5 py-2.5 rounded-2xl bg-[#3b49df] hover:bg-[#323fc0] text-white text-xs sm:text-sm font-semibold shadow-sm hover:shadow transition-all cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Open PDF</span>
                      </button>

                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-white rounded-3xl border border-slate-100 p-8 sm:p-12 text-center shadow-sm space-y-3">
                  <p className="text-base font-bold text-slate-800">
                    No documents found for this subject
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Please select another subject from above.
                  </p>
                </div>
              )}
            </div>

          </div>
        )}

      </div>

      {/* 3. FULL REAL PDF VIEWER MODAL (Mobile-Optimized Clean Experience) */}
      {activeDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 md:p-6 animate-in fade-in duration-200">
          <div className="bg-white w-full h-[100dvh] sm:h-[90vh] max-w-5xl rounded-none sm:rounded-3xl border-0 sm:border border-slate-100 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            
            {/* Modal Top Bar (Mobile-first compact header with safe notch padding) */}
            <div className="pt-[max(env(safe-area-inset-top),2.5rem)] pb-3 px-3.5 sm:py-3.5 sm:px-6 border-b border-slate-100 flex items-center justify-between bg-white gap-2 shrink-0">
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="flex items-center space-x-1.5 min-w-0">
                  <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded shrink-0 ${
                    activeDoc.type === 'PYQ' 
                      ? 'bg-amber-100 text-amber-800' 
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {activeDoc.type}
                  </span>
                  <span className="text-[10px] sm:text-xs font-medium text-slate-500 truncate">
                    {activeDoc.year} • {activeDoc.branch} • {activeDoc.semester}
                  </span>
                  {cachedPdfIds.has(activeDoc.id) && (
                    <span 
                      className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 inline-block ring-2 ring-emerald-200" 
                      title="Cached on Device" 
                    />
                  )}
                </div>
                <h3 className="text-xs sm:text-base font-bold text-slate-900 truncate">
                  {activeDoc.title}
                </h3>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                {activeDoc.file_url && (
                  <button
                    type="button"
                    onClick={() => handleDownload(activeDoc)}
                    className="inline-flex items-center space-x-1.5 px-3 sm:px-4 py-1.5 rounded-xl bg-[#3b49df] hover:bg-[#323fc0] text-white text-xs font-semibold transition-all shadow-sm cursor-pointer"
                    title="Download PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                )}
                <button
                  onClick={closeDocModal}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  aria-label="Close Preview"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            {/* REAL PDF EMBEDDED VIEWER (Google Drive iframe loaded strictly on-demand) */}
            <div className="flex-1 w-full bg-slate-100 relative overflow-hidden flex flex-col">
              {(activeDoc.file_url || (activeDoc.file_path && activeDoc.file_path.startsWith('gdrive://'))) ? (
                <>
                  {isIframeLoading && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white space-y-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
                        <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
                      </div>
                      <div className="space-y-1 text-center">
                        <p className="text-xs sm:text-sm font-bold text-slate-800">Streaming Verified PDF...</p>
                        <p className="text-[10px] sm:text-[11px] text-slate-400">Loading document securely from Google Drive</p>
                      </div>
                    </div>
                  )}
                  <iframe
                    src={getPdfEmbedUrl(activeDoc.file_url || activeDoc.file_path)}
                    title={activeDoc.title}
                    onLoad={() => {
                      setIsIframeLoading(false);
                      if (activeDoc && typeof window !== 'undefined') {
                        setCachedPdfIds((prev) => {
                          const next = new Set(prev);
                          next.add(activeDoc.id);
                          try {
                            localStorage.setItem('notebase_cached_pdf_ids', JSON.stringify(Array.from(next)));
                          } catch {}
                          return next;
                        });
                      }
                    }}
                    className="w-full h-full flex-1 border-0 bg-white"
                    allow="autoplay; fullscreen"
                  />
                </>
              ) : (
                <div className="flex-1 p-6 sm:p-16 flex flex-col items-center justify-center text-center space-y-4 bg-slate-50">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-sm">
                    <AlertCircle className="w-6 h-6 sm:w-7 sm:h-7" />
                  </div>
                  <div className="space-y-1.5 max-w-md">
                    <h4 className="text-sm sm:text-lg font-bold text-slate-900">
                      Actual PDF File Not Uploaded Yet
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      The PDF document for <strong>&quot;{activeDoc.title}&quot;</strong> ({activeDoc.subject}) has not been attached or uploaded to Google Drive yet. Please contact your Year/Branch Coordinator to upload the document file.
                    </p>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* 4. IN-APP YOUTUBE / VIDEO LECTURE PLAYER MODAL */}
      {activeLecture && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 md:p-6 animate-in fade-in duration-200">
          <div className="bg-slate-900 w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] max-w-4xl rounded-none sm:rounded-3xl border-0 sm:border border-slate-800 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            
            {/* Modal Top Bar */}
            <div className="pt-[max(env(safe-area-inset-top),1.75rem)] pb-3 px-4 sm:py-3.5 sm:px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900 text-white gap-2 shrink-0">
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                    🎬 Video Lecture
                  </span>
                  <span className="text-[11px] font-medium text-slate-400 truncate">
                    {activeLecture.subject} • {activeLecture.semester}
                  </span>
                </div>
                <h3 className="text-xs sm:text-base font-bold text-slate-100 truncate">
                  {activeLecture.title}
                </h3>
              </div>

              <button
                type="button"
                onClick={closeLectureModal}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Close Video"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* Video Player 16:9 Aspect Ratio Container */}
            <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
              <iframe
                src={getYouTubeEmbedUrl(activeLecture.link)}
                title={activeLecture.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowFullScreen
              />
            </div>

            {/* Bottom Info Bar */}
            <div className="p-3.5 sm:p-5 bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400 border-t border-slate-800/80 pb-[max(env(safe-area-inset-bottom),1rem)] sm:pb-5">
              <div className="space-y-0.5 min-w-0">
                <p className="text-slate-200 font-semibold text-xs sm:text-sm truncate">
                  {activeLecture.faculty || 'Department Faculty'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {activeLecture.date ? `Uploaded on ${activeLecture.date}` : 'Verified Curriculum Lecture'}
                </p>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                {activeLecture.link && (
                  <a
                    href={activeLecture.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    <span>External Link</span>
                    <ExternalLink className="w-3 h-3 ml-0.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={closeLectureModal}
                  className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  Close Player
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f3effb] flex items-center justify-center p-6 text-slate-600 text-sm font-medium">
        Loading matching documents...
      </div>
    }>
      <ResultsContent />
    </Suspense>
  );
}
