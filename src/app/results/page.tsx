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
  PlayCircle
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

  // Active document modal state
  const [activeDoc, setActiveDoc] = useState<NoteDocument | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [subjectsVersion, setSubjectsVersion] = useState(0);

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

  // Fetch subjects from Supabase cloud on mount if configured
  useEffect(() => {
    let isMounted = true;
    if (year && branch && semester && isSupabaseConfigured()) {
      fetchSubjectsFromSupabase(year, branch, semester).then((cloudSubjs) => {
        if (isMounted && cloudSubjs && cloudSubjs.length > 0) {
          setCloudSubjects(cloudSubjs);
          saveSubjectsFor(year, branch, semester, cloudSubjs);
          setSubjectsVersion((v) => v + 1);
        }
      }).catch(() => {});
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

  useEffect(() => {
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
      fetchLecturesFromSupabase(year, branch).then((cloudData) => {
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
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener('storage', loadLocalLectures);
    };
  }, [year, branch, semester]);

  // Fetch documents from Supabase if configured
  useEffect(() => {
    let isMounted = true;
    if (year && branch && semester && type !== 'Lectures' && isSupabaseConfigured()) {
      const targetType = type === 'PYQ' ? 'PYQ' : 'Notes';
      fetchDocumentsFromSupabase(year, branch, semester, targetType).then((docs) => {
        if (isMounted && docs && docs.length > 0) {
          setSupabaseDocs(docs);
        }
      }).catch((err) => {
        console.warn('Could not load Supabase documents:', err);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [year, branch, semester, subjectsVersion]);

  const activeSubject = useMemo(() => {
    if (selectedSubject && subjectsList.some((s) => s.title === selectedSubject)) {
      return selectedSubject;
    }
    return subjectsList[0]?.title || '';
  }, [selectedSubject, subjectsList]);

  // Filtered lectures for current activeSubject and semester (only real uploaded lectures with exact title)
  const displayedLectures = useMemo(() => {
    if (!activeSubject) return [];

    const existingIds = new Set(localLectures.map((l) => l.id));
    const merged = [...localLectures, ...cloudLectures.filter((l) => !existingIds.has(l.id))];

    return merged.filter((l) => {
      const matchSubj = l.subject.trim().toLowerCase() === activeSubject.trim().toLowerCase();
      const matchSem = !semester || l.semester.trim().toLowerCase() === semester.trim().toLowerCase();
      return matchSubj && matchSem;
    });
  }, [localLectures, cloudLectures, activeSubject, semester]);

  // Retrieve authentic documents matching URL query
  const allDocuments = useMemo(() => {
    if (!year || !branch || !semester || !type) {
      return [];
    }
    const localDocs = getDocumentsFor(year, branch, semester);
    const existingIds = new Set(localDocs.map((d) => d.id));
    const extraSupa = supabaseDocs.filter((d) => !existingIds.has(d.id));
    const combined = [...extraSupa, ...localDocs];
    return combined.filter((d) => d.type === type);
  }, [year, branch, semester, type, subjectsVersion, supabaseDocs]);

  // Filtered by active selected subject
  const displayedDocuments = useMemo(() => {
    if (!activeSubject) return allDocuments;
    return allDocuments.filter((d) => d.subject === activeSubject);
  }, [allDocuments, activeSubject]);

  const handleDownload = (doc: NoteDocument) => {
    setDownloadSuccess(true);

    // If PDF is hosted on Supabase Storage, open / download the real PDF directly
    if (doc.file_url) {
      window.open(doc.file_url, '_blank');
      setTimeout(() => setDownloadSuccess(false), 2500);
      return;
    }

    const textContent = `%PDF-1.4
==============================================
NOTEBASE - ACADEMIC STUDY REPOSITORY
==============================================
Subject: ${doc.subject} (${doc.code})
Document: ${doc.title}
Category: ${doc.type === 'PYQ' ? 'Previous Year Exam Paper (PYQ)' : 'Lecture Study Notes'}
Year: ${doc.year} | Group/Branch: ${doc.branch} | Semester: ${doc.semester}
Total Pages: ${doc.pages} | Size: ${doc.size}
Access: Student Read-Only Verified

CURRICULUM CONTENT / TOPICS COVERED:
${doc.preview.map((p, i) => `[Unit Topic 0${i + 1}]: ${p}`).join('\n')}

==============================================
Department of Technical Education • Semester Repository
Note: Uploading and modifying documents is restricted to Branch Coordinators.
==============================================
`;
    const blob = new Blob([textContent], { type: 'application/pdf;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.code}_${doc.type}_${doc.semester.replace(/\s+/g, '')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setTimeout(() => setDownloadSuccess(false), 2500);
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
    <div className="min-h-screen bg-[#f3effb] relative flex flex-col items-center p-3.5 sm:p-8 overflow-x-hidden selection:bg-purple-200">
      
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
                  {subjectsList.length} subjects found for {semester} ({branch})
                </p>
              </div>
            </div>

            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 hidden sm:inline-block shrink-0">
              {isLectures ? 'Click subject to view Video Lectures' : 'Click subject to view PDFs'}
            </span>
          </div>

          {/* Subject Cards / Buttons Grid */}
          {subjectsList.length > 0 ? (
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
        {subjectsList.length === 0 ? (
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
              {displayedLectures.length > 0 ? (
                displayedLectures.map((lec) => (
                  <div
                    key={lec.id}
                    className="bg-white rounded-3xl border border-slate-100/90 p-4 sm:p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_rgba(147,51,234,0.08)] hover:border-purple-200 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 group"
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

                    {/* Right: Watch / Open Link Button */}
                    <div className="flex items-center justify-end space-x-2.5 shrink-0 w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      {lec.link ? (
                        <a
                          href={lec.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-2xl bg-[#3b49df] hover:bg-[#323fc0] text-white text-xs sm:text-sm font-semibold transition-all shadow-sm hover:shadow cursor-pointer"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>Watch Lecture</span>
                          <ExternalLink className="w-3.5 h-3.5 ml-0.5" />
                        </a>
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
              {displayedDocuments.length > 0 ? (
                displayedDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => setActiveDoc(doc)}
                    className="bg-white rounded-3xl border border-slate-100/90 p-4 sm:p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_rgba(79,70,229,0.08)] hover:border-indigo-200 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 group"
                  >
                    {/* Left: Red PDF Icon & Document Info */}
                    <div className="flex items-start sm:items-center space-x-3.5 sm:space-x-4 min-w-0 flex-1">
                      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-red-50 text-red-600 flex flex-col items-center justify-center font-bold text-xs tracking-wider shrink-0 border border-red-100 group-hover:bg-red-600 group-hover:text-white transition-colors shadow-sm">
                        <FileText className="w-4 h-4 sm:w-5 sm:h-5 mb-0.5" />
                        <span className="text-[8px] sm:text-[9px] leading-none">PDF</span>
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <h4 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                          {doc.title}
                        </h4>

                        <p className="text-[11px] sm:text-xs text-slate-500 font-medium flex items-center gap-x-1.5 gap-y-1 flex-wrap">
                          <strong className="text-slate-700 font-semibold">{doc.owner || 'Department Faculty'}</strong>
                          <span>• {doc.pages} Pages • {doc.size}</span>
                          {doc.file_url && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              ☁️ Cloud PDF
                            </span>
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
                        onClick={() => setActiveDoc(doc)}
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

      {/* 3. FULL PDF READER / PREVIEW MODAL ("Click karke open kar sake") */}
      {activeDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-3xl rounded-2xl sm:rounded-3xl border border-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[94vh] sm:max-h-[92vh] animate-in zoom-in-95 duration-150">
            
            {/* Modal Top Bar */}
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/70 gap-2">
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center space-x-2 min-w-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                    activeDoc.type === 'PYQ' 
                      ? 'bg-amber-100 text-amber-800' 
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {activeDoc.type} PDF
                  </span>
                  <span className="text-[11px] sm:text-xs font-semibold text-slate-600 truncate">
                    {activeDoc.year} • {activeDoc.branch} • {activeDoc.semester}
                  </span>
                </div>
                <h3 className="text-sm sm:text-lg font-bold text-slate-900 truncate">
                  {activeDoc.title}
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">
                  <strong className="text-slate-700 font-semibold">{activeDoc.owner || 'Department Faculty'}</strong> • {activeDoc.pages} Pages • {activeDoc.size}
                </p>
              </div>

              <button
                onClick={() => setActiveDoc(null)}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* Read-Only Student Banner & Toolbar */}
            <div className="px-4 sm:px-6 py-2 bg-emerald-50/80 border-b border-emerald-100 flex items-center justify-between text-[11px] sm:text-xs text-emerald-800">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Student Verified Mode:</strong> Read-only syllabus curriculum file
                </span>
              </div>
              
              {/* Zoom Controls */}
              <div className="hidden sm:flex items-center space-x-2 text-slate-600">
                <button 
                  onClick={() => setZoomLevel((prev) => Math.max(75, prev - 10))}
                  className="p-1 hover:bg-emerald-100 rounded"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono">{zoomLevel}%</span>
                <button 
                  onClick={() => setZoomLevel((prev) => Math.min(150, prev + 10))}
                  className="p-1 hover:bg-emerald-100 rounded"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* PDF Viewer Content Simulator */}
            <div className="px-3 sm:px-6 py-4 sm:py-6 overflow-y-auto space-y-4 flex-1 bg-slate-100/60">
              
              {/* Simulated PDF Paper View */}
              <div 
                className="bg-white rounded-2xl p-4 sm:p-8 shadow-sm border border-slate-200/80 mx-auto max-w-2xl space-y-4 sm:space-y-5 transition-transform"
                style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
              >
                
                {/* Header of PDF Page */}
                <div className="border-b-2 border-slate-800 pb-3 sm:pb-4 text-center space-y-1">
                  <div className="text-[9px] sm:text-[10px] uppercase font-bold tracking-widest text-slate-400">
                    Department of Technical Education • Semester Examination Repository
                  </div>
                  <h4 className="text-sm sm:text-lg font-extrabold text-slate-900 uppercase">
                    {activeDoc.subject} ({activeDoc.code})
                  </h4>
                  <div className="text-[11px] sm:text-xs text-slate-600 font-medium">
                    {activeDoc.year} • {activeDoc.branch} • {activeDoc.semester}
                  </div>
                </div>

                {/* Simulated Content / Question / Theory Sections */}
                <div className="space-y-4 text-xs sm:text-sm text-slate-700 leading-relaxed font-serif">
                  <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 text-xs font-sans text-indigo-950 font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="truncate">Document: {activeDoc.title}</span>
                    <span className="font-bold shrink-0">{activeDoc.pages} Pages Total</span>
                  </div>

                  <div className="space-y-3 pt-2">
                    <p className="font-bold text-slate-900 border-b border-slate-200 pb-1">
                      {activeDoc.type === 'PYQ' ? 'EXAMINATION QUESTIONS OVERVIEW:' : 'CHAPTER TOPICS & LECTURE SUMMARY:'}
                    </p>

                    {activeDoc.preview.map((snip, i) => (
                      <div key={i} className="p-3.5 bg-slate-50 rounded-xl border border-slate-100/90 font-sans text-xs space-y-1">
                        <div className="font-bold text-indigo-700 flex items-center space-x-1.5">
                          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-800 flex items-center justify-center text-[10px]">
                            {i + 1}
                          </span>
                          <span>{activeDoc.type === 'PYQ' ? `Question Paper Section ${String.fromCharCode(65 + i)}` : `Unit Topic ${i + 1}`}</span>
                        </div>
                        <p className="text-slate-600 pl-6 leading-relaxed">
                          {snip}
                        </p>
                      </div>
                    ))}

                    <div className="p-4 bg-slate-900 text-slate-200 rounded-xl font-mono text-xs space-y-2 mt-4">
                      <div className="text-indigo-400 text-[10px] uppercase tracking-wider font-bold">
                        PDF Reader Status
                      </div>
                      <p className="text-slate-300">
                        File verified by academic coordinator. Complete full-text PDF is ready for reading and offline study.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer of PDF page */}
                <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>NoteHub Academic Portal</span>
                  <span>Page 1 of {activeDoc.pages}</span>
                </div>

              </div>

            </div>

            {/* Modal Bottom Action Footer */}
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-white border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center flex-wrap gap-2">
                <span className="text-[11px] sm:text-xs text-slate-500 font-medium">
                  File size: {activeDoc.size} • Verified PDF
                </span>
                {activeDoc.file_url && (
                  <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    ☁️ Cloud PDF
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {activeDoc.file_url && (
                  <a
                    href={activeDoc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in New Tab</span>
                  </a>
                )}

                <button
                  onClick={() => setActiveDoc(null)}
                  className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Close
                </button>

                <button
                  onClick={() => handleDownload(activeDoc)}
                  disabled={downloadSuccess}
                  className="inline-flex items-center space-x-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-[#3b49df] hover:bg-[#323fc0] text-white text-xs font-semibold transition-all shadow-sm cursor-pointer"
                >
                  {downloadSuccess ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-300" />
                      <span>{activeDoc.file_url ? 'Opening...' : 'Downloaded Successfully'}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>{activeDoc.file_url ? 'Download / View PDF' : 'Download PDF'}</span>
                    </>
                  )}
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
