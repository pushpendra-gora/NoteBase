'use client';

import React, { Suspense, useState, useMemo, useEffect, useRef } from 'react';
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
  ExternalLink,
  Video,
  Play,
  PlayCircle,
  Loader2
} from 'lucide-react';
import { getDocumentsFor, getSubjectsFor, saveSubjectsFor, deleteCustomUploadedDocument, SubjectMeta } from '../../data/notesData';
import { BranchOption, NoteDocument, SemesterOption, YearOption, LectureItem } from '../../types';
import { isSupabaseConfigured } from '../../lib/supabase';
import { fetchDocumentsFromSupabase, fetchLecturesFromSupabase, fetchSubjectsFromSupabase } from '../../lib/supabaseService';
import { formatFileSize } from '../../lib/pdfMetadata';
import { openSafeExternalUrl } from '../../lib/urlSafety';
import PdfPreviewModal from '../../components/PdfPreviewModal';

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

  const getAndroidBridge = () => {
    if (typeof window !== 'undefined' && (window as any).NoteBaseAndroid) {
      return (window as any).NoteBaseAndroid;
    }
    return null;
  };

  const openDocModal = (doc: NoteDocument) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'pdf' }, '');

      // Save document metadata to local device storage for offline listing
      try {
        const raw = localStorage.getItem('notebase_cached_pdf_docs');
        const map = raw ? JSON.parse(raw) : {};
        map[doc.id] = doc;
        localStorage.setItem('notebase_cached_pdf_docs', JSON.stringify(map));

        // Only mark cached immediately in browser mode; in Android App, mark after actual PDF file is cached
        if (!getAndroidBridge()) {
          const idSetRaw = localStorage.getItem('notebase_cached_pdf_ids');
          const idSet: string[] = idSetRaw ? JSON.parse(idSetRaw) : [];
          if (!idSet.includes(doc.id)) {
            idSet.push(doc.id);
            localStorage.setItem('notebase_cached_pdf_ids', JSON.stringify(idSet));
            setCachedPdfIds(new Set(idSet));
          }
        }
      } catch {}
    }
    setActiveDoc(doc);
  };

  const closeDocModal = () => {
    const bridge = getAndroidBridge();
    if (bridge?.closeNativePdf) {
      try {
        bridge.closeNativePdf();
      } catch {}
    }
    if (typeof window !== 'undefined' && window.history.state?.modal) {
      window.history.back();
    } else {
      setActiveDoc(null);
    }
  };

  // Expose synchronous close helper for Android hardware back button (closes PDF or Video modal)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).__closeNoteBaseModalIfOpen = () => {
      if (activeDoc) {
        closeDocModal();
        return true;
      }
      if (activeLecture) {
        closeLectureModal();
        return true;
      }
      return false;
    };
    (window as any).__closeNoteBasePdfIfOpen = () => {
      if (activeDoc) {
        closeDocModal();
        return true;
      }
      return false;
    };
    return () => {
      delete (window as any).__closeNoteBaseModalIfOpen;
      delete (window as any).__closeNoteBasePdfIfOpen;
    };
  }, [activeDoc, activeLecture]);

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

  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [subjectsVersion, setSubjectsVersion] = useState(0);

  // Network online/offline monitor
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const bridge = getAndroidBridge();
      const online = navigator.onLine && (!bridge?.isNetworkConnected || bridge.isNetworkConnected());
      setIsOffline(!online);
      const onOnline = () => setIsOffline(false);
      const onOffline = () => setIsOffline(true);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      return () => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    }
  }, []);

  // Video container & fullscreen state
  const videoPlayerContainerRef = useRef<HTMLDivElement>(null);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsVideoFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const toggleVideoFullscreen = () => {
    if (!document.fullscreenElement) {
      const el = videoPlayerContainerRef.current as any;
      if (el) {
        if (el.requestFullscreen) {
          el.requestFullscreen().catch(() => {});
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        }
      }
      try {
        if (screen.orientation && 'lock' in screen.orientation) {
          (screen.orientation as any).lock('landscape').catch(() => {});
        }
      } catch {}
    } else {
      const doc = document as any;
      if (doc.exitFullscreen) {
        doc.exitFullscreen().catch(() => {});
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      }
      try {
        if (screen.orientation && 'unlock' in screen.orientation) {
          (screen.orientation as any).unlock();
        }
      } catch {}
    }
  };

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

  // Real PDF metadata (exact page count & size measured from actual PDF files)
  const [realPdfMeta, setRealPdfMeta] = useState<Record<string, { pages: number; size: string }>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('notebase_real_pdf_meta');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return {};
  });

  const saveRealPdfMeta = (docId: string, pages: number, fileSizeBytes?: number) => {
    if (!docId || (pages <= 0 && (!fileSizeBytes || fileSizeBytes <= 0))) return;
    const formattedSize = fileSizeBytes && fileSizeBytes > 0 ? formatFileSize(fileSizeBytes) : '';
    setRealPdfMeta((prev) => {
      const existing = prev[docId] || { pages: 0, size: '' };
      const nextEntry = {
        pages: pages > 0 ? pages : existing.pages,
        size: formattedSize || existing.size,
      };
      if (existing.pages === nextEntry.pages && existing.size === nextEntry.size) return prev;
      const next = { ...prev, [docId]: nextEntry };
      try {
        localStorage.setItem('notebase_real_pdf_meta', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

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
  const [cloudSubjects, setCloudSubjects] = useState<SubjectMeta[]>(() => {
    if (typeof window !== 'undefined' && year && branch && semester) {
      try {
        const saved = localStorage.getItem(`notebase_cloud_subjs_${year}_${branch}_${semester}`);
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });
  const [isLoadingSubjects, setIsLoadingSubjects] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && year && branch && semester) {
      const local = getSubjectsFor(year, branch, semester);
      if (local && local.length > 0) return false;
      const cached = localStorage.getItem(`notebase_cloud_subjs_${year}_${branch}_${semester}`);
      if (cached) return false;
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
    const hasCached = cloudSubjects.length > 0 || (local && local.length > 0);
    if (!hasCached) {
      setIsLoadingSubjects(true);
    }

    if (isSupabaseConfigured()) {
      fetchSubjectsFromSupabase(year, branch, semester).then((cloudSubjs) => {
        if (isMounted) {
          if (cloudSubjs && cloudSubjs.length > 0) {
            setCloudSubjects(cloudSubjs);
            try {
              localStorage.setItem(`notebase_cloud_subjs_${year}_${branch}_${semester}`, JSON.stringify(cloudSubjs));
            } catch {}
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

  // Selected subject filter: defaults to the 1st subject, with localStorage persistence across back navigation
  const [selectedSubject, setSelectedSubject] = useState<string>(() => {
    if (typeof window !== 'undefined' && year && branch && semester) {
      try {
        const saved = localStorage.getItem(`notebase_active_subj_${year}_${branch}_${semester}`);
        if (saved) return saved;
      } catch {}
    }
    return '';
  });

  const handleSelectSubject = (subjTitle: string) => {
    setSelectedSubject(subjTitle);
    if (fetchedSubjectsRef.current.has(subjTitle)) {
      setIsLoadingSubjectDocs(false);
    }
    if (typeof window !== 'undefined' && year && branch && semester) {
      try {
        localStorage.setItem(`notebase_active_subj_${year}_${branch}_${semester}`, subjTitle);
      } catch {}
    }
  };

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

  // Per-subject progressive cache: initializes with localStorage + local verified documents for zero-wait display
  const [subjectDocsCache, setSubjectDocsCache] = useState<Record<string, NoteDocument[]>>(() => {
    const initial: Record<string, NoteDocument[]> = {};
    if (typeof window !== 'undefined' && year && branch && semester && type) {
      try {
        const key = `notebase_docs_${year}_${branch}_${semester}_${type}`;
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved);
          Object.assign(initial, parsed);
        }
      } catch {}

      // Pre-seed with any local verified documents for this semester
      if (type !== 'Lectures') {
        const targetType = type === 'PYQ' ? 'PYQ' : 'Notes';
        const localDocs = getDocumentsFor(year, branch, semester).filter((d) => d.type === targetType);
        for (const doc of localDocs) {
          if (doc.subject) {
            const existing = initial[doc.subject] || [];
            if (!existing.some((d) => d.id === doc.id)) {
              initial[doc.subject] = [...existing, doc];
            }
          }
        }
      }
    }
    return initial;
  });
  const [isLoadingSubjectDocs, setIsLoadingSubjectDocs] = useState<boolean>(false);
  // Tracks subjects whose metadata has already been fetched in this session so switching back never re-loads
  const fetchedSubjectsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetchedSubjectsRef.current.clear();
  }, [year, branch, semester, type]);

  // Shared helper to reconcile server docs with localStorage + Android disk cache
  const reconcileServerDocsWithLocal = (fetchedDocs: NoteDocument[], scopedSubject?: string) => {
    if (!year || !branch || !semester || !type) return;
    const targetType = type === 'PYQ' ? 'PYQ' : 'Notes';
    const fetchedIds = new Set(fetchedDocs.map((d) => d.id));
    const deletedIds = new Set<string>();
    const bridge = getAndroidBridge();

    try {
      const subjectsToCheck = scopedSubject ? [scopedSubject] : Object.keys(subjectDocsCache);
      for (const subj of subjectsToCheck) {
        const prevDocs = subjectDocsCache[subj] || [];
        for (const prevDoc of prevDocs) {
          if (!fetchedIds.has(prevDoc.id)) {
            deletedIds.add(prevDoc.id);
          }
        }
      }

      const cachedDocsRaw = localStorage.getItem('notebase_cached_pdf_docs');
      if (cachedDocsRaw) {
        const cachedDocsMap: Record<string, NoteDocument> = JSON.parse(cachedDocsRaw);
        let mapChanged = false;
        for (const [id, doc] of Object.entries(cachedDocsMap)) {
          const matchesScope = scopedSubject ? doc.subject === scopedSubject : true;
          if (
            matchesScope &&
            doc.year === year &&
            doc.branch === branch &&
            doc.semester === semester &&
            doc.type === targetType &&
            !fetchedIds.has(id)
          ) {
            deletedIds.add(id);
            delete cachedDocsMap[id];
            mapChanged = true;
          }
        }
        if (mapChanged) {
          localStorage.setItem('notebase_cached_pdf_docs', JSON.stringify(cachedDocsMap));
        }
      }

      if (deletedIds.size > 0) {
        for (const deletedId of Array.from(deletedIds)) {
          deleteCustomUploadedDocument(deletedId);
          if (bridge?.removeCachedPdf) {
            try {
              bridge.removeCachedPdf(deletedId);
            } catch {}
          }
        }
      }

      setCachedPdfIds((prev) => {
        const next = new Set<string>();
        for (const id of Array.from(prev)) {
          if (deletedIds.has(id)) continue;
          next.add(id);
        }
        if (bridge?.isPdfCachedOnDisk) {
          for (const doc of fetchedDocs) {
            try {
              if (bridge.isPdfCachedOnDisk(doc.id)) {
                next.add(doc.id);
                if (bridge.getCachedPdfMeta) {
                  const rawMeta = bridge.getCachedPdfMeta(doc.id);
                  if (rawMeta) {
                    const parsed = JSON.parse(rawMeta);
                    saveRealPdfMeta(doc.id, parsed?.pages || 0, parsed?.sizeBytes || 0);
                  }
                }
              } else {
                next.delete(doc.id);
              }
            } catch {}
          }
        }
        try {
          localStorage.setItem('notebase_cached_pdf_ids', JSON.stringify(Array.from(next)));
        } catch {}
        return next;
      });
    } catch {}
  };

  // Sync subject documents to localStorage whenever updated
  useEffect(() => {
    if (typeof window !== 'undefined' && year && branch && semester && type && Object.keys(subjectDocsCache).length > 0) {
      try {
        const key = `notebase_docs_${year}_${branch}_${semester}_${type}`;
        localStorage.setItem(key, JSON.stringify(subjectDocsCache));
      } catch {}
    }
  }, [subjectDocsCache, year, branch, semester, type]);

  // Warm cache for all subjects of this semester ONCE so switching subjects (and back) is instant with zero reload
  useEffect(() => {
    let isMounted = true;
    if (!year || !branch || !semester || !type || type === 'Lectures') return;

    const targetType = type === 'PYQ' ? 'PYQ' : 'Notes';

    const warmSemesterDocs = async () => {
      let allDocs: NoteDocument[] = [];
      let succeeded = false;
      try {
        const res = await fetch(
          `/api/documents?year=${encodeURIComponent(year)}&branch=${encodeURIComponent(branch)}&semester=${encodeURIComponent(semester)}&type=${encodeURIComponent(targetType)}`
        );
        const data = await res.json();
        if (res.ok && data.success && Array.isArray(data.documents)) {
          allDocs = data.documents;
          succeeded = true;
        } else if (isSupabaseConfigured()) {
          allDocs = await fetchDocumentsFromSupabase(year, branch, semester, targetType);
          succeeded = true;
        }
      } catch {
        if (isSupabaseConfigured()) {
          try {
            allDocs = await fetchDocumentsFromSupabase(year, branch, semester, targetType);
            succeeded = true;
          } catch {}
        }
      }

      if (!isMounted || !succeeded) return;

      const grouped: Record<string, NoteDocument[]> = {};
      for (const subj of subjectsList) {
        if (subj.title) {
          grouped[subj.title] = [];
          fetchedSubjectsRef.current.add(subj.title);
        }
      }
      for (const doc of allDocs) {
        if (doc.subject) {
          if (!grouped[doc.subject]) grouped[doc.subject] = [];
          grouped[doc.subject].push(doc);
          fetchedSubjectsRef.current.add(doc.subject);
        }
      }

      reconcileServerDocsWithLocal(allDocs);
      setSubjectDocsCache(grouped);
      setIsLoadingSubjectDocs(false);
    };

    warmSemesterDocs();

    return () => {
      isMounted = false;
    };
  }, [year, branch, semester, type]);

  // Progressive load metadata ONLY if activeSubject has not already been fetched in this session
  useEffect(() => {
    let isMounted = true;
    if (!year || !branch || !semester || !activeSubject || type === 'Lectures') {
      return;
    }

    // Already fetched once this session: keep cached data immediately without re-loading
    if (fetchedSubjectsRef.current.has(activeSubject)) {
      setIsLoadingSubjectDocs(false);
      return;
    }

    const targetType = type === 'PYQ' ? 'PYQ' : 'Notes';

    // Seed local documents immediately if not yet in cache so student never waits
    const localDocs = getDocumentsFor(year, branch, semester).filter(
      (d) => d.type === targetType && d.subject === activeSubject
    );
    if (localDocs.length > 0 && (!subjectDocsCache[activeSubject] || subjectDocsCache[activeSubject].length === 0)) {
      setSubjectDocsCache((prev) => ({
        ...prev,
        [activeSubject]: localDocs
      }));
    }

    // Only trigger network spinner if absolutely zero cached entry exists for this subject
    const alreadyHasEntry = activeSubject in subjectDocsCache || localDocs.length > 0;
    if (!alreadyHasEntry) {
      setIsLoadingSubjectDocs(true);
    }

    const loadSubjectMetadata = async () => {
      let fetchedDocs: NoteDocument[] = [];
      let fetchSucceeded = false;
      try {
        const res = await fetch(
          `/api/documents?year=${encodeURIComponent(year)}&branch=${encodeURIComponent(branch)}&semester=${encodeURIComponent(semester)}&type=${encodeURIComponent(targetType)}&subject=${encodeURIComponent(activeSubject)}`
        );
        const data = await res.json();
        if (res.ok && data.success && Array.isArray(data.documents)) {
          fetchedDocs = data.documents;
          fetchSucceeded = true;
        } else if (isSupabaseConfigured()) {
          fetchedDocs = await fetchDocumentsFromSupabase(year, branch, semester, targetType, activeSubject);
          fetchSucceeded = true;
        }
      } catch {
        if (isSupabaseConfigured()) {
          try {
            fetchedDocs = await fetchDocumentsFromSupabase(year, branch, semester, targetType, activeSubject);
            fetchSucceeded = true;
          } catch {}
        }
      }

      if (fetchSucceeded) {
        fetchedSubjectsRef.current.add(activeSubject);
        reconcileServerDocsWithLocal(fetchedDocs, activeSubject);

        if (isMounted) {
          setSubjectDocsCache((prev) => ({
            ...prev,
            [activeSubject]: fetchedDocs
          }));
          setIsLoadingSubjectDocs(false);
        }
      } else {
        // Offline mode: Network is off, keep existing local storage documents active so student can study
        if (isMounted) {
          setIsLoadingSubjectDocs(false);
        }
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

  // Check if documents for active subject are loading - never blocks if files are already showing or already fetched!
  const isDocLoadingForActive = useMemo(() => {
    if (type === 'Lectures') return false;
    if (displayedDocuments.length > 0) return false;
    if (isLoadingSubjects && subjectsList.length === 0) return true;
    if (!activeSubject) return false;
    if (fetchedSubjectsRef.current.has(activeSubject)) return false;
    return isLoadingSubjectDocs && !(activeSubject in subjectDocsCache);
  }, [type, displayedDocuments.length, isLoadingSubjects, subjectsList.length, activeSubject, isLoadingSubjectDocs, subjectDocsCache]);

  const extractYouTubeVideoId = (url?: string): string => {
    if (!url) return '';
    const trimmed = url.trim();
    const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch && watchMatch[1]) return watchMatch[1];
    const pathMatch = trimmed.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed|shorts|live)\/)([a-zA-Z0-9_-]{11})/);
    if (pathMatch && pathMatch[1]) return pathMatch[1];
    return '';
  };

  // Helper to convert any YouTube URL into a seamless embedded in-app player URL
  const getYouTubeEmbedUrl = (url?: string): string => {
    if (!url) return '';
    const trimmed = url.trim();
    const videoId = extractYouTubeVideoId(trimmed);

    if (videoId) {
      return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&fs=1`;
    }

    if (trimmed.includes('youtube.com/embed/')) {
      const glue = trimmed.includes('?') ? '&' : '?';
      return `${trimmed}${glue}autoplay=1&rel=0&modestbranding=1&fs=1&enablejsapi=1`;
    }

    return trimmed;
  };

  const handleOpenInYouTubeApp = (link?: string) => {
    if (!link) return;
    const bridge = getAndroidBridge();
    if (bridge?.openYouTubeVideo) {
      bridge.openYouTubeVideo(link);
      return;
    }

    const videoId = extractYouTubeVideoId(link);
    if (videoId) {
      const intentUrl = `intent://www.youtube.com/watch?v=${videoId}#Intent;package=com.google.android.youtube;scheme=https;end`;
      window.location.href = intentUrl;
    } else {
      openSafeExternalUrl(link);
    }
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

    // If real PDF URL exists or document is cached locally on Android, initiate direct download
    if (targetUrl || getAndroidBridge()?.isPdfCachedOnDisk?.(doc.id)) {
      const safeTitle = (doc.title || 'document').replace(/[/\\?%*:|"<>]/g, '_');
      const filename = safeTitle.toLowerCase().endsWith('.pdf') ? safeTitle : `${safeTitle}.pdf`;

      let downloadUrl = targetUrl || '';
      const fileIdMatch = downloadUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        downloadUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}&filename=${encodeURIComponent(filename)}&title=${encodeURIComponent(filename)}`;
      }

      setDownloadSuccess(true);
      const bridge = getAndroidBridge();
      if (bridge?.downloadPdf) {
        bridge.downloadPdf(doc.id, downloadUrl, filename);
        setTimeout(() => setDownloadSuccess(false), 2500);
        return;
      }

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
    <div className="h-[100dvh] max-h-[100dvh] w-full max-w-[100vw] bg-[#f3effb] relative flex flex-col items-center overflow-x-hidden overflow-y-auto overscroll-none overscroll-y-none select-none selection:bg-purple-200">
      
      {/* Background Soft Blobs */}
      <div className="absolute top-[-80px] left-[-80px] w-96 h-96 bg-[#e8dcfa]/60 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-100px] right-[-100px] w-[450px] h-[450px] bg-[#dfd4f6]/50 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6 relative z-10 pt-[max(env(safe-area-inset-top),1.25rem)] pb-8 px-3.5 sm:px-8">
        
        {/* Top NoteBase Branding & Filter Badges Bar */}
        <div className="space-y-3 py-1 sm:py-2 px-1">
          {/* NoteBase Brand at Top */}
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center space-x-2 group cursor-pointer"
            >
              <img src="/logo.png?v=2" alt="NoteBase" className="w-7 h-7 sm:w-8 sm:h-8 object-contain transition-transform group-hover:scale-105" />
              <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Note<span className="text-blue-600">Base</span>
              </span>
            </Link>
          </div>

          {/* Active Filter Badges: In 1 Single Line (Strictly in one row, no wrapping into 2nd line) */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-[10.5px] sm:text-xs flex-nowrap overflow-x-auto no-scrollbar py-0.5 w-full">
            <span className="bg-white border border-slate-200/90 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-slate-700 font-semibold shadow-xs shrink-0 whitespace-nowrap">
              📅 {year}
            </span>
            <span className="bg-white border border-slate-200/90 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-slate-700 font-semibold shadow-xs shrink-0 whitespace-nowrap">
              📚 {branch}
            </span>
            <span className="bg-white border border-slate-200/90 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-slate-700 font-semibold shadow-xs shrink-0 whitespace-nowrap">
              🎓 {semester}
            </span>
            <span className={`px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full font-bold shadow-xs shrink-0 whitespace-nowrap ${
              type === 'Notes' 
                ? 'bg-blue-600 text-white' 
                : type === 'PYQ'
                ? 'bg-amber-600 text-white'
                : 'bg-purple-600 text-white'
            }`}>
              {type === 'Notes' ? '📄 Notes' : type === 'PYQ' ? '❓ PYQs' : '🎬 Lectures'}
            </span>
          </div>

          {/* Offline Mode Indicator Banner */}
          {isOffline && (
            <div className="bg-amber-500/15 border border-amber-500/30 rounded-2xl py-2 px-3.5 flex items-center space-x-2 text-amber-800 text-xs font-bold animate-in fade-in duration-150">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span>Offline Mode Active • Saved PDFs & curriculum available without network</span>
            </div>
          )}
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

          {/* Subject Compact Boxes / Chips (Small & neat boxes side by side) */}
          {isLoadingSubjects && subjectsList.length === 0 ? (
            <div className="py-6 px-4 text-center rounded-2xl bg-slate-50/70 border border-slate-100 flex flex-col items-center justify-center space-y-2">
              <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
              <p className="text-xs font-semibold text-slate-600">Loading curriculum subjects for {branch}...</p>
            </div>
          ) : subjectsList.length > 0 ? (
            <div className="flex flex-wrap gap-2 sm:gap-2.5">
              {/* Individual Compact Subject Box */}
              {subjectsList.map((subj) => {
                const isSelected = activeSubject === subj.title;

                return (
                  <button
                    key={subj.code}
                    type="button"
                    onClick={() => handleSelectSubject(subj.title)}
                    className={`px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold transition-all border inline-flex items-center space-x-2 cursor-pointer shadow-xs ${
                      isSelected
                        ? 'bg-[#3b49df] text-white border-[#3b49df] shadow-sm shadow-indigo-100 ring-2 ring-indigo-200 scale-[1.02]'
                        : 'bg-slate-50 hover:bg-white border-slate-200/80 hover:border-indigo-300 text-slate-800 hover:shadow-xs'
                    }`}
                  >
                    <span className={`text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded-md font-extrabold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/70 text-slate-600'
                    }`}>
                      {subj.code.slice(0, 3)}
                    </span>
                    <span className="truncate max-w-[160px] sm:max-w-none">{subj.title}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0 ml-0.5" />}
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
                          <h4 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 sm:truncate">
                            {doc.title}
                          </h4>
                          {cachedPdfIds.has(doc.id) && (
                            <span
                              className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 inline-block ring-2 ring-emerald-200"
                              title="Saved Offline"
                              aria-label="Saved Offline"
                            />
                          )}
                        </div>

                        <p className="text-[11px] sm:text-xs text-slate-500 font-medium flex items-center gap-x-1.5 gap-y-1 flex-wrap">
                          <strong className="text-slate-700 font-semibold">{doc.owner || 'Department Faculty'}</strong>
                          {(realPdfMeta[doc.id]?.pages || doc.pages) > 0 && (
                            <span>• {realPdfMeta[doc.id]?.pages || doc.pages} Pages</span>
                          )}
                          {(realPdfMeta[doc.id]?.size || doc.size) && (
                            <span>• {realPdfMeta[doc.id]?.size || doc.size}</span>
                          )}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          openDocModal(doc);
                        }}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center space-x-2 px-4 sm:px-5 py-2.5 rounded-2xl bg-[#3b49df] hover:bg-[#323fc0] text-white text-xs sm:text-sm font-semibold shadow-sm hover:shadow transition-all cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                        <span>{cachedPdfIds.has(doc.id) ? 'Open Saved PDF' : 'Open PDF'}</span>
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

      {/* 3. FULL REAL PDF VIEWER MODAL (Shared Student/Coordinator/Admin Viewer) */}
      <PdfPreviewModal
        doc={
          activeDoc
            ? {
                id: activeDoc.id,
                title: activeDoc.title,
                type: activeDoc.type,
                subtitle: [
                  `${activeDoc.year} • ${activeDoc.branch} • ${activeDoc.semester}`,
                  (realPdfMeta[activeDoc.id]?.pages || activeDoc.pages) > 0
                    ? `${realPdfMeta[activeDoc.id]?.pages || activeDoc.pages} Pages`
                    : '',
                  realPdfMeta[activeDoc.id]?.size || activeDoc.size || '',
                ]
                  .filter(Boolean)
                  .join(' • '),
                file_url: activeDoc.file_url,
                file_path: activeDoc.file_path,
                missingAttachmentMessage: `The PDF document for "${activeDoc.title}" (${activeDoc.subject}) has not been attached or uploaded to Google Drive yet. Please contact your Year/Branch Coordinator to upload the document file.`,
              }
            : null
        }
        isCached={activeDoc ? cachedPdfIds.has(activeDoc.id) : false}
        onClose={closeDocModal}
        onDownload={activeDoc ? () => handleDownload(activeDoc) : undefined}
        onNativeReady={(docId, _fromCache, pageCount, fileSizeBytes) => {
          if (typeof pageCount === 'number' || typeof fileSizeBytes === 'number') {
            saveRealPdfMeta(docId, pageCount || 0, fileSizeBytes || 0);
          }
          setCachedPdfIds((prev) => {
            if (prev.has(docId)) return prev;
            const next = new Set(prev);
            next.add(docId);
            try {
              localStorage.setItem('notebase_cached_pdf_ids', JSON.stringify(Array.from(next)));
            } catch {}
            return next;
          });
        }}
        onWebLoaded={(docId) => {
          if (typeof window !== 'undefined' && !getAndroidBridge()) {
            setCachedPdfIds((prev) => {
              if (prev.has(docId)) return prev;
              const next = new Set(prev);
              next.add(docId);
              try {
                localStorage.setItem('notebase_cached_pdf_ids', JSON.stringify(Array.from(next)));
              } catch {}
              return next;
            });
          }
        }}
      />

      {/* 4. IN-APP YOUTUBE / VIDEO LECTURE PLAYER MODAL (Adaptive Native Fullscreen in Horizontal / Landscape) */}
      {activeLecture && (
        <div 
          ref={videoPlayerContainerRef}
          className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 md:p-6 animate-in fade-in duration-150"
        >
          <div className="bg-slate-900 w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] max-w-4xl rounded-none sm:rounded-3xl border-0 sm:border border-slate-800 shadow-2xl overflow-hidden flex flex-col landscape:fixed landscape:inset-0 landscape:h-screen landscape:w-screen landscape:max-w-none landscape:rounded-none landscape:z-50 animate-in zoom-in-95 duration-150">
            
            {/* Modal Top Bar: Shown in portrait, auto-collapsed on mobile landscape for immersive 100% video */}
            <div className="pt-[max(env(safe-area-inset-top),1.5rem)] pb-2.5 px-4 sm:py-3.5 sm:px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900 text-white gap-2 shrink-0 landscape:hidden sm:landscape:flex">
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

              <div className="flex items-center space-x-2 shrink-0">
                {/* Dedicated Fullscreen Toggle Button */}
                <button
                  type="button"
                  onClick={toggleVideoFullscreen}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/60 text-purple-200 border border-purple-500/40 text-xs font-semibold transition-all cursor-pointer"
                  title="Toggle Fullscreen"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>{isVideoFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
                </button>

                <button
                  type="button"
                  onClick={closeLectureModal}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  aria-label="Close Video"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            {/* Video Player Container: Expands to edge-to-edge full screen in landscape */}
            <div className="relative w-full flex-1 aspect-video landscape:aspect-auto landscape:h-full bg-black flex items-center justify-center overflow-hidden">
              <iframe
                src={getYouTubeEmbedUrl(activeLecture.link)}
                title={activeLecture.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowFullScreen
              />

              {/* Floating Close Button for Landscape Mode */}
              <button
                type="button"
                onClick={closeLectureModal}
                className="hidden landscape:flex sm:landscape:hidden absolute top-4 right-4 z-30 w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 text-white items-center justify-center backdrop-blur-md border border-white/20 transition-all shadow-xl cursor-pointer"
                aria-label="Exit Fullscreen Video"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bottom Info Bar: Shown in portrait, auto-collapsed in landscape */}
            <div className="p-3.5 sm:p-5 bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400 border-t border-slate-800/80 pb-[max(env(safe-area-inset-bottom),1rem)] sm:pb-5 landscape:hidden sm:landscape:flex">
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
                  <button
                    type="button"
                    onClick={() => handleOpenInYouTubeApp(activeLecture.link)}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-[#cc0000] hover:bg-[#b00] active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-red-950/40 cursor-pointer"
                    title="Open directly in YouTube App"
                  >
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                    <span>Open in YouTube App</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeLectureModal}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
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
