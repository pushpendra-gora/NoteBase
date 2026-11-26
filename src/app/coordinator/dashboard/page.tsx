'use client';

import React, { Suspense, useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Home, 
  UploadCloud, 
  FileText, 
  HelpCircle, 
  User, 
  Key,
  Lock,
  ChevronDown, 
  Layers, 
  Check, 
  Search, 
  Eye, 
  Edit3, 
  Trash2, 
  Plus, 
  Package, 
  FileCheck, 
  ArrowLeft, 
  X, 
  LogOut,
  Upload,
  Download,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  ArrowRight,
  Video,
  Play,
  PlayCircle,
  BookOpen,
  Database,
  Cloud,
  RefreshCw,
  Settings,
  Menu,
  MoreVertical
} from 'lucide-react';
import { 
  getDocumentsFor, 
  getSubjectsFor, 
  saveSubjectsFor,
  addSubjectFor,
  deleteSubjectFor,
  updateSubjectFor,
  SubjectMeta,
  saveCustomUploadedDocument, 
  deleteCustomUploadedDocument, 
  YEAR_SEMESTER_MAP 
} from '../../../data/notesData';
import { BranchOption, NoteDocument, SemesterOption, YearOption } from '../../../types';
import { isSupabaseConfigured, getSupabaseCredentials } from '../../../lib/supabase';
import { 
  insertDocumentToSupabase, 
  deleteDocumentFromSupabase, 
  fetchDocumentsFromSupabase,
  insertSubjectToSupabase,
  updateSubjectInSupabase,
  deleteSubjectFromSupabase,
  fetchSubjectsFromSupabase,
  insertLectureToSupabase,
  updateLectureInSupabase,
  deleteLectureFromSupabase,
  fetchLecturesFromSupabase,
  updateCoordinatorInSupabase,
  updateCoordinatorPasswordInSupabase,
  fetchCoordinatorsFromSupabase
} from '../../../lib/supabaseService';
import { getStoredCoordinators, saveStoredCoordinators, isBranchMatch } from '../../../lib/coordinatorService';
import { 
  uploadUnifiedPdf, 
  isGoogleDriveConfigured, 
  lastGoogleDriveError,
  getGoogleDriveConfig,
  saveGoogleDriveConfig,
  deleteDocumentEverywhere
} from '../../../lib/googleDriveService';
import { extractPdfPageCount, formatFileSize } from '../../../lib/pdfMetadata';

interface CoordinatorFile {
  id: string;
  name: string;
  subject: string;
  semester: string;
  size: string;
  type: 'Notes' | 'PYQ';
  date: string;
  owner?: string;
  file_url?: string;
  file_path?: string;
}

interface LectureItem {
  id: string;
  title: string;
  subject: string;
  semester: string;
  faculty?: string;
  link?: string;
  videoFileName?: string;
  date: string;
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const yearParam = (searchParams.get('year') as YearOption) || '2nd Year';
  const branchParam = (searchParams.get('branch') as BranchOption) || 'CSE(AI&ML)';

  // Auth Guard: Verify signed coordinator session cookie on mount
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/coordinator/auth')
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (!data?.authenticated) {
          router.replace('/coordinator');
        } else {
          setAuthChecked(true);
        }
      })
      .catch(() => {
        if (active) router.replace('/coordinator');
      });
    return () => {
      active = false;
    };
  }, [router]);

  // Active logged-in coordinator name
  const coordinatorDisplayName = useMemo(() => {
    const nameInUrl = searchParams.get('name');
    if (nameInUrl) return nameInUrl;
    if (typeof window !== 'undefined') {
      try {
        const active = sessionStorage.getItem('notehub_active_coordinator');
        if (active) {
          const parsed = JSON.parse(active);
          if (parsed?.name) return parsed.name;
        }
      } catch {}
    }
    const currentList = getStoredCoordinators();
    const found = currentList.find(c => c.year === yearParam && isBranchMatch(c.branch, branchParam));
    return found ? found.name : 'Coordinator';
  }, [searchParams, yearParam, branchParam]);

  // Left sidebar active navigation tab & mobile drawer state
  const [activeNav, setActiveNav] = useState<'Dashboard' | 'Upload' | 'Notes' | 'PYQs' | 'Lectures' | 'Add Subject'>('Dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Lecture Edit & Search State
  const [editingLecture, setEditingLecture] = useState<LectureItem | null>(null);
  const [newLectureEditTitle, setNewLectureEditTitle] = useState('');
  const [newLectureEditLink, setNewLectureEditLink] = useState('');
  const [lectureSearchQuery, setLectureSearchQuery] = useState('');

  // Add / Manage Subject State
  const [subjectSemester, setSubjectSemester] = useState<string>('');
  const [newSubjectTitle, setNewSubjectTitle] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [editingSubject, setEditingSubject] = useState<SubjectMeta | null>(null);
  const [editSubjectTitle, setEditSubjectTitle] = useState('');
  const [editSubjectCode, setEditSubjectCode] = useState('');
  const [subjectsVersion, setSubjectsVersion] = useState(0);

  // Sync dynamic subject updates
  useEffect(() => {
    const handleUpdate = () => setSubjectsVersion((v) => v + 1);
    window.addEventListener('notehub_subjects_changed', handleUpdate);
    return () => window.removeEventListener('notehub_subjects_changed', handleUpdate);
  }, []);

  // Top header popovers
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Close user profile dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  // Global action toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  // Upload Form State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<'Notes' | 'PYQ' | 'Lectures'>('Notes');
  const [uploadSemester, setUploadSemester] = useState<string>('');
  const [uploadSubject, setUploadSubject] = useState<string>('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadOwner, setUploadOwner] = useState('');
  const [selectedFileObj, setSelectedFileObj] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Manage Material State
  const [manageTab, setManageTab] = useState<'Notes' | 'PYQs'>('Notes');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected document for preview / edit modal & mobile 3-dot action menu
  const [previewFile, setPreviewFile] = useState<CoordinatorFile | null>(null);
  const [editingFile, setEditingFile] = useState<CoordinatorFile | null>(null);
  const [newEditName, setNewEditName] = useState('');
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!openActionMenuId) return;
    const closeMenu = () => setOpenActionMenuId(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [openActionMenuId]);

  // Global Delete Confirmation Modal State
  const [deleteConfirm, setDeleteConfirm] = useState<{
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [isDeletingConfirm, setIsDeletingConfirm] = useState(false);

  // Available semesters for this coordinator's assigned year
  const coordinatorSemesters = useMemo<SemesterOption[]>(() => {
    return YEAR_SEMESTER_MAP[yearParam] || ['Semester 3', 'Semester 4'];
  }, [yearParam]);

  // Active semester for Subject Management
  const activeSubjectSemester = useMemo<SemesterOption>(() => {
    return (subjectSemester as SemesterOption) || coordinatorSemesters[0] || 'Semester 1';
  }, [subjectSemester, coordinatorSemesters]);

  // Current list of subjects for activeSubjectSemester
  const currentSemesterSubjects = useMemo<SubjectMeta[]>(() => {
    return getSubjectsFor(yearParam, branchParam, activeSubjectSemester);
  }, [yearParam, branchParam, activeSubjectSemester, subjectsVersion]);

  // Dynamic available subjects for the selected semester
  const availableSubjects = useMemo(() => {
    const sem = (uploadSemester as SemesterOption) || coordinatorSemesters[0];
    if (!sem) return [];
    const subjs = getSubjectsFor(yearParam, branchParam, sem);
    return subjs.map((s) => s.title);
  }, [yearParam, branchParam, uploadSemester, coordinatorSemesters, subjectsVersion]);

  // Supabase Cloud State
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [supabaseUrlInput, setSupabaseUrlInput] = useState('');
  const [supabaseKeyInput, setSupabaseKeyInput] = useState('');
  const [supabaseTesting, setSupabaseTesting] = useState(false);
  const [supabaseMessage, setSupabaseMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Handle mobile native back button / gestures to close open modals smoothly
  useEffect(() => {
    const handlePopState = () => {
      setShowUserMenu(false);
      setShowStorageModal(false);
      setShowChangePasswordModal(false);
      setShowSupabaseModal(false);
      setPreviewFile(null);
      setEditingFile(null);
      setDeleteConfirm(null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Initialize Supabase & Google Drive configuration once authenticated
  useEffect(() => {
    const creds = getSupabaseCredentials();
    if (creds.url) setSupabaseUrlInput(creds.url);
    if (creds.key) setSupabaseKeyInput(creds.key);
    setSupabaseConnected(isSupabaseConfigured());

    if (!authChecked) return;

    // Auto-sync Google Drive Webhook from server/Supabase
    if (typeof window !== 'undefined') {
      const headers: Record<string, string> = {};
      if (creds.url && creds.key) {
        headers['x-supabase-url'] = creds.url;
        headers['x-supabase-key'] = creds.key;
      }
      fetch('/api/status', { headers })
        .then((res) => res.json())
        .then((data) => {
          if (data?.googleDrive?.webhookUrl) {
            saveGoogleDriveConfig({
              webhookUrl: data.googleDrive.webhookUrl,
              folderId: data.googleDrive.folderId || '',
              enabled: true,
            });
          }
        })
        .catch(() => {});
    }
  }, [authChecked]);

  // Lecture Upload Form State
  const [lectureTitle, setLectureTitle] = useState('');
  const [lectureSubject, setLectureSubject] = useState('');
  const [lectureSemester, setLectureSemester] = useState('');
  const [lectureLink, setLectureLink] = useState('');
  const [isUploadingLecture, setIsUploadingLecture] = useState(false);

  // Dynamic available subjects for lecture
  const availableLectureSubjects = useMemo(() => {
    const sem = (lectureSemester as SemesterOption) || coordinatorSemesters[0];
    if (!sem) return [];
    const subjs = getSubjectsFor(yearParam, branchParam, sem);
    return subjs.map((s) => s.title);
  }, [yearParam, branchParam, lectureSemester, coordinatorSemesters, subjectsVersion]);

  // Lecture List State: only authentic real lectures uploaded by coordinator/admin
  const [lecturesList, setLecturesList] = useState<LectureItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('notehub_custom_lectures');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      } catch {}
    }
    return [];
  });

  // Fetch Supabase lectures on mount (Supabase is authoritative)
  useEffect(() => {
    if (isSupabaseConfigured()) {
      fetchLecturesFromSupabase(yearParam, branchParam).then((cloudLecs) => {
        if (cloudLecs && cloudLecs.length > 0) {
          setLecturesList((prev) => {
            const cloudIds = new Set(cloudLecs.map((l) => l.id));
            const uniquePrev = prev.filter((l) => !cloudIds.has(l.id));
            const formattedCloud = cloudLecs.map((l) => ({
              id: l.id,
              title: l.title,
              subject: l.subject,
              semester: l.semester,
              faculty: l.faculty,
              link: l.link,
              date: l.date
            }));
            return [...formattedCloud, ...uniquePrev];
          });
        }
      }).catch(() => {});
    }
  }, [yearParam, branchParam, supabaseConnected]);

  // Fetch cloud subjects from Supabase for all coordinator semesters on mount (authoritative source)
  useEffect(() => {
    if (isSupabaseConfigured()) {
      coordinatorSemesters.forEach((sem) => {
        fetchSubjectsFromSupabase(yearParam, branchParam, sem).then((cloudSubjs) => {
          if (cloudSubjs && cloudSubjs.length > 0) {
            saveSubjectsFor(yearParam, branchParam, sem, cloudSubjs);
            setSubjectsVersion((v) => v + 1);
          }
        }).catch(() => {});
      });
    }
  }, [yearParam, branchParam, coordinatorSemesters, supabaseConnected]);

  // Initial files generated corresponding to coordinator's year & branch
  const [files, setFiles] = useState<CoordinatorFile[]>([]);

  // Synchronize files whenever subjects or coordinator parameters update or Supabase connects
  useEffect(() => {
    let isMounted = true;
    const sem1 = coordinatorSemesters[0] || 'Semester 1';
    const sem2 = coordinatorSemesters[1] || 'Semester 2';

    const docs1 = getDocumentsFor(yearParam, branchParam, sem1);
    const docs2 = getDocumentsFor(yearParam, branchParam, sem2);
    const localAll = [...docs1, ...docs2];

    const localFiles: CoordinatorFile[] = localAll.map((d, i) => ({
      id: d.id || `coord-${i + 1}`,
      name: d.title,
      subject: d.subject,
      semester: d.semester,
      size: d.size,
      type: d.type === 'PYQ' ? 'PYQ' : 'Notes',
      date: '2024-11-20',
      owner: d.owner,
      file_url: d.file_url,
      file_path: d.file_path
    }));

    if (isSupabaseConfigured()) {
      Promise.all([
        fetchDocumentsFromSupabase(yearParam, branchParam, sem1),
        fetchDocumentsFromSupabase(yearParam, branchParam, sem2)
      ]).then(([supa1, supa2]) => {
        if (!isMounted) return;
        const supaAll = [...supa1, ...supa2];
        if (supaAll.length > 0) {
          const supaFileIds = new Set(supaAll.map((d) => d.id));
          const uniqueLocal = localFiles.filter((f) => !supaFileIds.has(f.id));
          const supaFiles: CoordinatorFile[] = supaAll.map((d) => ({
            id: d.id,
            name: d.title,
            subject: d.subject,
            semester: d.semester,
            size: d.size,
            type: d.type === 'PYQ' ? 'PYQ' : 'Notes',
            date: d.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
            owner: d.owner,
            file_url: d.file_url,
            file_path: d.file_path
          }));
          setFiles([...supaFiles, ...uniqueLocal]);
          return;
        }
        setFiles(localFiles);
      }).catch(() => {
        if (isMounted) setFiles(localFiles);
      });
    } else {
      setFiles(localFiles);
    }

    return () => {
      isMounted = false;
    };
  }, [yearParam, branchParam, coordinatorSemesters, subjectsVersion, supabaseConnected]);

  // Statistics
  const notesCount = useMemo(() => files.filter((f) => f.type === 'Notes').length, [files]);
  const pyqsCount = useMemo(() => files.filter((f) => f.type === 'PYQ').length, [files]);
  const totalFilesCount = files.length;
  const storageUsedMB = (totalFilesCount * 6.8).toFixed(0);

  // Filtered files in Manage Material card
  const filteredFiles = useMemo(() => {
    const targetType = activeNav === 'PYQs' ? 'PYQ' : 'Notes';
    return files.filter((f) => {
      if (f.type !== targetType) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return f.name.toLowerCase().includes(q) || f.subject.toLowerCase().includes(q) || f.semester.toLowerCase().includes(q);
      }
      return true;
    });
  }, [files, activeNav, searchQuery]);

  // Filtered lectures in Manage Lectures card
  const filteredLectures = useMemo(() => {
    return lecturesList.filter((lec) => {
      if (lectureSearchQuery.trim() !== '') {
        const q = lectureSearchQuery.toLowerCase();
        return (
          lec.title.toLowerCase().includes(q) ||
          lec.subject.toLowerCase().includes(q) ||
          lec.semester.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [lecturesList, lectureSearchQuery]);

  // Handle system file browse picker
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFileObj(file);
      setUploadFileName(file.name);
      showToast(`Selected file: "${file.name}"`);
    }
  };

  // Handle Supabase Cloud Configuration Save & Test
  const handleSaveSupabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSupabaseTesting(true);
    setSupabaseMessage(null);

    const cleanUrl = supabaseUrlInput.trim();
    const cleanKey = supabaseKeyInput.trim();

    if (!cleanUrl || !cleanKey) {
      setSupabaseMessage({ text: 'Please enter both Supabase Project URL and Anon Key.', type: 'error' });
      setSupabaseTesting(false);
      return;
    }

    try {
      localStorage.setItem('notehub_supabase_url', cleanUrl);
      localStorage.setItem('notehub_supabase_anon_key', cleanKey);

      const { createClient } = await import('@supabase/supabase-js');
      const testClient = createClient(cleanUrl, cleanKey);
      const { error } = await testClient.from('notes').select('id').limit(1);
      if (error) {
        throw error;
      }

      setSupabaseConnected(true);
      setSupabaseMessage({ text: 'Connected successfully to Supabase Database & Storage!', type: 'success' });
      showToast('☁️ Supabase Cloud Connected!');
      setTimeout(() => setShowSupabaseModal(false), 1200);
    } catch (err: any) {
      setSupabaseMessage({ text: `Connection note: Saved credentials. ${err.message || ''}`, type: 'info' });
      setSupabaseConnected(true);
      showToast('☁️ Supabase Credentials Saved!');
      setTimeout(() => setShowSupabaseModal(false), 1200);
    } finally {
      setSupabaseTesting(false);
    }
  };

  // Handle Disconnect Supabase
  const handleDisconnectSupabase = () => {
    localStorage.removeItem('notehub_supabase_url');
    localStorage.removeItem('notehub_supabase_anon_key');
    setSupabaseConnected(false);
    setSupabaseUrlInput('');
    setSupabaseKeyInput('');
    setSupabaseMessage({ text: 'Supabase disconnected. Using local database.', type: 'info' });
    showToast('Supabase disconnected.');
  };

  // Handle Upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = uploadFileName.trim();
    if (!cleanTitle) {
      showToast(uploadType === 'Lectures' ? '⚠️ Please enter the Lecture Title.' : '⚠️ Please enter the Display Title for the document.');
      return;
    }

    const finalSem = (uploadSemester as SemesterOption) || coordinatorSemesters[0] || 'Semester 1';
    const finalSubject = uploadSubject || availableSubjects[0] || 'Core Subject';

    // SPECIAL CASE: LECTURES
    if (uploadType === 'Lectures') {
      const cleanLink = lectureLink.trim();
      if (!cleanLink) {
        showToast('⚠️ Please paste the video / lecture link URL.');
        return;
      }

      setIsUploading(true);
      try {
        const newLec: LectureItem = {
          id: `lec-${Date.now()}`,
          title: cleanTitle,
          subject: finalSubject,
          semester: finalSem,
          link: cleanLink,
          date: new Date().toISOString().split('T')[0]
        };

        if (isSupabaseConfigured()) {
          await insertLectureToSupabase(newLec, yearParam, branchParam);
        }

        setLecturesList((prev) => {
          const updated = [newLec, ...prev];
          if (typeof window !== 'undefined') {
            localStorage.setItem('notehub_custom_lectures', JSON.stringify(updated));
          }
          return updated;
        });

        setUploadFileName('');
        setLectureLink('');
        showToast(`🎬 Lecture "${cleanTitle}" published successfully!`);
        setActiveNav('Lectures');
      } catch (err) {
        console.error('Lecture upload error:', err);
        showToast('⚠️ Error publishing lecture. Please try again.');
      } finally {
        setIsUploading(false);
      }
      return;
    }

    // REGULAR CASE: NOTES OR PYQS
    const finalType: 'Notes' | 'PYQ' = uploadType === 'PYQ' ? 'PYQ' : 'Notes';
    const finalDisplayName = cleanTitle;
    const finalOwner = uploadOwner.trim() || 'Department Faculty';

    setIsUploading(true);

    try {
      let uploadedFileUrl: string | undefined = undefined;
      let uploadedFilePath: string | undefined = undefined;

      // 1. Upload actual PDF file exclusively to Google Drive (Supabase bucket disabled)
      if (selectedFileObj) {
        showToast('☁️ Uploading PDF to Google Drive...');
        const uploadResult = await uploadUnifiedPdf(selectedFileObj, undefined, {
          title: finalDisplayName,
          year: yearParam,
          branch: branchParam,
          semester: finalSem
        });
        if (uploadResult && uploadResult.publicUrl) {
          uploadedFileUrl = uploadResult.publicUrl;
          uploadedFilePath = uploadResult.filePath;
          showToast('✅ Saved to Google Drive! Public link saved to database.');
        } else {
          setIsUploading(false);
          const errDetail = lastGoogleDriveError || 'Google Drive Web App URL is not configured or failed to upload.';
          showToast(`⚠️ Google Drive upload failed: ${errDetail}`);
          alert(`Google Drive Upload Error:\n${errDetail}\n\nPlease check your Google Apps Script Web App URL in Admin -> Statistics or set GOOGLE_DRIVE_WEBHOOK_URL on Vercel.`);
          return;
        }
      }

      const calculatedSize = selectedFileObj ? formatFileSize(selectedFileObj.size) : '';
      const realPageCount = selectedFileObj ? await extractPdfPageCount(selectedFileObj) : 0;

      const newId = `doc-${Date.now()}`;

      const newFile: CoordinatorFile = {
        id: newId,
        name: finalDisplayName,
        subject: finalSubject,
        semester: finalSem,
        size: calculatedSize,
        type: finalType,
        date: new Date().toISOString().split('T')[0],
        owner: finalOwner,
        file_url: uploadedFileUrl,
        file_path: uploadedFilePath
      };

      // Also save to shared storage for student portal / search
      const noteDoc: NoteDocument = {
        id: newFile.id,
        title: newFile.name,
        subject: finalSubject,
        code: (finalSubject.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'SUB') + '101',
        year: yearParam,
        branch: branchParam,
        semester: finalSem,
        type: finalType,
        pages: realPageCount,
        size: calculatedSize,
        owner: finalOwner,
        file_url: uploadedFileUrl,
        file_path: uploadedFilePath,
        preview: [
          `Document prepared by: ${finalOwner}`,
          `Verified academic ${finalType} for ${finalSubject} (${finalSem}) in ${branchParam}.`,
          uploadedFileUrl ? 'Official verified PDF hosted on NoteBase Cloud Repository.' : 'Official department curriculum resource ready for viewing and download.'
        ]
      };

      // 2. Insert record into Supabase database via server API & direct client
      try {
        const creds = getSupabaseCredentials();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (creds.url && creds.key) {
          headers['x-supabase-url'] = creds.url;
          headers['x-supabase-key'] = creds.key;
        }

        const docRes = await fetch('/api/documents', {
          method: 'POST',
          headers,
          body: JSON.stringify(noteDoc),
        });
        const docData = await docRes.json();
        if (!docRes.ok || !docData.success) {
          if (isSupabaseConfigured()) {
            await insertDocumentToSupabase(noteDoc);
          }
        }
      } catch {
        if (isSupabaseConfigured()) {
          await insertDocumentToSupabase(noteDoc);
        }
      }

      // 3. Fallback / local persistence
      saveCustomUploadedDocument(noteDoc);

      setFiles((prev) => [newFile, ...prev]);
      setUploadFileName('');
      setUploadOwner('');
      setSelectedFileObj(null);
      setIsUploading(false);

      if (uploadedFileUrl) {
        showToast(`✅ "${newFile.name}" stored in Supabase & uploaded to ${finalSem}!`);
      } else {
        showToast(`✅ "${newFile.name}" by ${finalOwner} uploaded to ${finalSem}!`);
      }
      
      // Navigate to the uploaded category
      setActiveNav(finalType === 'PYQ' ? 'PYQs' : 'Notes');
      setManageTab(finalType === 'PYQ' ? 'PYQs' : 'Notes');
    } catch (err: any) {
      console.error('Upload error:', err);
      setIsUploading(false);
      showToast('⚠️ Document saved locally.');
    }
  };

  // Handle Delete (Deletes from Database AND Google Drive)
  const handleDelete = (id: string, name: string) => {
    setDeleteConfirm({
      title: 'Delete File',
      message: `Are you sure you want to delete "${name}"? This will remove it from the database and Google Drive.`,
      onConfirm: async () => {
        const fileToDelete = files.find((f) => f.id === id);
        setFiles((prev) => prev.filter((f) => f.id !== id));
        deleteCustomUploadedDocument(id);

        const result = await deleteDocumentEverywhere({
          id,
          type: fileToDelete?.type,
          fileUrl: fileToDelete?.file_url,
          filePath: fileToDelete?.file_path,
          supabaseCreds: getSupabaseCredentials(),
          supabaseFallback: () =>
            isSupabaseConfigured() && fileToDelete
              ? deleteDocumentFromSupabase(id, fileToDelete.file_path, fileToDelete.type)
              : Promise.resolve(false),
        });

        if (result.driveDeleted) {
          showToast(`🗑️ "${name}" deleted from Database & Google Drive!`);
        } else if (result.driveNeedsScriptUpdate) {
          showToast(`⚠️ "${name}" removed from DB. Re-deploy Google Apps Script (Manage deployments -> New version) for Drive delete.`);
        } else if (result.driveAttempted && result.driveError) {
          showToast(`⚠️ "${name}" removed from DB, Drive error: ${result.driveError}`);
        } else {
          showToast(`🗑️ "${name}" removed from repository.`);
        }
      }
    });
  };

  // Handle Edit Save (Persists to Supabase + localStorage + React state)
  const handleSaveEdit = async () => {
    if (!editingFile || !newEditName.trim()) return;
    const formatted = newEditName.trim();
    const targetId = editingFile.id;
    const targetType = editingFile.type;

    setFiles((prev) =>
      prev.map((f) => (f.id === targetId ? { ...f, name: formatted } : f))
    );

    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('notehub_custom_documents');
        if (raw) {
          const docs: NoteDocument[] = JSON.parse(raw);
          const updated = docs.map((d) => (d.id === targetId ? { ...d, title: formatted } : d));
          localStorage.setItem('notehub_custom_documents', JSON.stringify(updated));
        }
      } catch {}
    }

    try {
      const creds = getSupabaseCredentials();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (creds.url && creds.key) {
        headers['x-supabase-url'] = creds.url;
        headers['x-supabase-key'] = creds.key;
      }
      await fetch('/api/documents', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id: targetId, title: formatted, type: targetType }),
      });
    } catch {}

    showToast(`✏️ Renamed to "${formatted}"`);
    setEditingFile(null);
    setNewEditName('');
  };

  // Handle Password Change (Processed securely on server via PATCH /api/coordinator/auth)
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (!currentPassword.trim()) {
      setPasswordError('Please enter your current password.');
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      setPasswordError('New password must be at least 4 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirm password do not match.');
      return;
    }

    try {
      const res = await fetch('/api/coordinator/auth', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPassword.trim(),
          newPassword: newPassword.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPasswordError(data.error || 'Failed to update password.');
        return;
      }

      setShowChangePasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('🔐 Password updated successfully in Supabase database!');
    } catch {
      setPasswordError('Network error while updating password.');
    }
  };

  // Handle PDF Download / Direct Open (Real PDF directly from Google Drive / Supabase)
  const handleDownloadFile = (file: CoordinatorFile) => {
    if (file.file_url) {
      let downloadUrl = file.file_url;
      const fileIdMatch = file.file_url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      const safeTitle = (file.name || 'document').replace(/[/\\?%*:|"<>]/g, '_');
      const filename = safeTitle.toLowerCase().endsWith('.pdf') ? safeTitle : `${safeTitle}.pdf`;

      if (fileIdMatch && fileIdMatch[1]) {
        downloadUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}&filename=${encodeURIComponent(filename)}&title=${encodeURIComponent(filename)}`;
      }

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

      showToast(`📥 Downloading "${filename}"...`);
      return;
    }
    showToast(`⚠️ No PDF file attached for "${file.name}".`);
  };

  // Handle Lecture Upload Submit
  const handleLectureUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = lectureTitle.trim();
    if (!cleanTitle) {
      showToast('⚠️ Please enter lecture title!');
      return;
    }

    const finalSem = lectureSemester || coordinatorSemesters[0] || 'Semester 1';
    const finalSubj = lectureSubject || (availableLectureSubjects[0] || availableSubjects[0] || 'Core Subject');

    setIsUploadingLecture(true);
    const newLec: LectureItem = {
      id: `lec-${Date.now()}`,
      title: cleanTitle,
      subject: finalSubj,
      semester: finalSem,
      link: lectureLink.trim() || undefined,
      date: new Date().toISOString().split('T')[0]
    };

    if (isSupabaseConfigured()) {
      await insertLectureToSupabase(newLec, yearParam, branchParam);
    }

    setLecturesList((prev) => {
      const updated = [newLec, ...prev];
      if (typeof window !== 'undefined') {
        localStorage.setItem('notehub_custom_lectures', JSON.stringify(updated));
      }
      return updated;
    });

    setLectureTitle('');
    setLectureLink('');
    setIsUploadingLecture(false);
    showToast(`🎬 Lecture "${cleanTitle}" published!`);
    setActiveNav('Lectures');
  };

  // Handle Delete Lecture
  const handleDeleteLecture = (id: string, title: string) => {
    setDeleteConfirm({
      title: 'Delete Video Lecture',
      message: `Are you sure you want to delete lecture "${title}"?`,
      onConfirm: async () => {
        if (isSupabaseConfigured()) {
          await deleteLectureFromSupabase(id);
        }
        setLecturesList((prev) => {
          const updated = prev.filter((l) => l.id !== id);
          if (typeof window !== 'undefined') {
            localStorage.setItem('notehub_custom_lectures', JSON.stringify(updated));
          }
          return updated;
        });
        showToast(`🗑️ Lecture "${title}" deleted.`);
      }
    });
  };

  // Handle Save Lecture Edit
  const handleSaveLectureEdit = async () => {
    if (!editingLecture || !newLectureEditTitle.trim()) return;
    const cleanTitle = newLectureEditTitle.trim();
    const cleanLink = newLectureEditLink.trim() || undefined;

    if (isSupabaseConfigured()) {
      await updateLectureInSupabase(editingLecture.id, cleanTitle, cleanLink);
    }

    setLecturesList((prev) => {
      const updated = prev.map((l) =>
        l.id === editingLecture.id ? { ...l, title: cleanTitle, link: cleanLink } : l
      );
      if (typeof window !== 'undefined') {
        localStorage.setItem('notehub_custom_lectures', JSON.stringify(updated));
      }
      return updated;
    });

    showToast(`✏️ Renamed lecture to "${cleanTitle}"`);
    setEditingLecture(null);
    setNewLectureEditTitle('');
    setNewLectureEditLink('');
  };

  // Handle Add Subject Submit
  const handleAddSubjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = newSubjectTitle.trim();
    if (!cleanTitle) {
      showToast('⚠️ Please enter subject title!');
      return;
    }
    const alphaPrefix = cleanTitle.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'SUB';
    const cleanCode = newSubjectCode.trim() || `${alphaPrefix}101`;

    const newSubj: SubjectMeta = {
      title: cleanTitle,
      code: cleanCode,
      unitSnippets: [
        `${cleanTitle} Unit 1 fundamental concepts, definitions, and theory.`,
        `${cleanTitle} Unit 2 analytical models, problem solving, and derivations.`,
        `${cleanTitle} Unit 3 practical implementations, architectures, and applications.`
      ],
      pyqSnippets: [
        `Explain the fundamental architecture and principles of ${cleanTitle}.`,
        `Derive the key governing formulas and equations for ${cleanTitle}.`,
        `Comprehensive 10-mark examination problem for ${cleanTitle}.`
      ]
    };

    const added = addSubjectFor(yearParam, branchParam, activeSubjectSemester, newSubj);
    if (!added) {
      showToast(`⚠️ Subject "${cleanTitle}" already exists in ${activeSubjectSemester}!`);
      return;
    }

    if (isSupabaseConfigured()) {
      await insertSubjectToSupabase(yearParam, branchParam, activeSubjectSemester, newSubj);
    }

    setNewSubjectTitle('');
    setNewSubjectCode('');
    setSubjectsVersion((v) => v + 1);
    showToast(`✅ Subject "${cleanTitle}" added to ${activeSubjectSemester}!`);
  };

  // Handle Delete Subject
  const handleDeleteSubject = (subjTitle: string) => {
    setDeleteConfirm({
      title: 'Delete Subject',
      message: `Are you sure you want to delete subject "${subjTitle}" from ${activeSubjectSemester}?`,
      onConfirm: async () => {
        deleteSubjectFor(yearParam, branchParam, activeSubjectSemester, subjTitle);
        if (isSupabaseConfigured()) {
          await deleteSubjectFromSupabase(yearParam, branchParam, activeSubjectSemester, subjTitle);
        }
        setSubjectsVersion((v) => v + 1);
        showToast(`🗑️ Subject "${subjTitle}" deleted from ${activeSubjectSemester}!`);
      }
    });
  };

  // Handle Save Subject Edit
  const handleSaveSubjectEdit = async () => {
    if (!editingSubject || !editSubjectTitle.trim()) return;
    const oldTitle = editingSubject.title;
    const cleanTitle = editSubjectTitle.trim();
    const alphaPrefix = cleanTitle.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'SUB';
    const cleanCode = editSubjectCode.trim() || `${alphaPrefix}101`;

    updateSubjectFor(yearParam, branchParam, activeSubjectSemester, oldTitle, {
      title: cleanTitle,
      code: cleanCode
    });

    if (isSupabaseConfigured()) {
      await updateSubjectInSupabase(yearParam, branchParam, activeSubjectSemester, oldTitle, cleanTitle, cleanCode);
    }

    // Update files & lectures in memory if subject was renamed
    if (oldTitle !== cleanTitle) {
      setFiles((prev) => prev.map((f) => (f.subject === oldTitle && f.semester === activeSubjectSemester ? { ...f, subject: cleanTitle } : f)));
      setLecturesList((prev) => prev.map((l) => (l.subject === oldTitle && l.semester === activeSubjectSemester ? { ...l, subject: cleanTitle } : l)));
    }

    setSubjectsVersion((v) => v + 1);
    showToast(`✏️ Subject updated to "${cleanTitle}" in database!`);
    setEditingSubject(null);
    setEditSubjectTitle('');
    setEditSubjectCode('');
  };

  // Navigation handlers
  const navigateToSection = (section: 'Dashboard' | 'Upload' | 'Notes' | 'PYQs' | 'Lectures' | 'Add Subject') => {
    setActiveNav(section);
    setIsMobileSidebarOpen(false);
    if (section === 'Notes') {
      setManageTab('Notes');
    } else if (section === 'PYQs') {
      setManageTab('PYQs');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!authChecked) {
    return (
      <div className="h-[100dvh] w-full bg-[#f8fafc] flex items-center justify-center text-slate-500 text-sm font-semibold">
        Verifying coordinator session...
      </div>
    );
  }

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full bg-[#f8fafc] flex flex-col md:flex-row text-slate-800 selection:bg-purple-200 overflow-hidden">
      
      {/* GLOBAL TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center space-x-3 text-xs sm:text-sm font-semibold border border-slate-700 animate-in slide-in-from-bottom-5 duration-200">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
          <button 
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* MOBILE COMPACT TOP BAR (Minimized Sidebar Header on Mobile) */}
      <div className="md:hidden bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between shrink-0 z-30 shadow-xs">
        <Link href="/" className="flex items-center space-x-2.5">
          <img src="/logo.png?v=2" alt="NoteBase Logo" className="w-8 h-8 object-contain" />
          <span className="text-lg font-extrabold tracking-tight text-slate-900">
            Note<span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">Base</span>
          </span>
        </Link>
        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
            {activeNav}
          </span>
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen((v) => !v)}
            aria-label={isMobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
          >
            {isMobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* MOBILE BACKDROP OVERLAY */}
      {isMobileSidebarOpen && (
        <div
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-40 md:hidden"
        />
      )}

      {/* 1. LEFT SIDEBAR (Collapsible Drawer on Mobile, Static Sidebar on Desktop) */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 md:w-64 md:static bg-white border-r border-slate-100 p-6 flex flex-col justify-between shrink-0 shadow-xl md:shadow-sm overflow-y-auto transition-transform duration-200 ease-out ${
        isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        
        <div className="space-y-8">
          {/* Top Logo + Mobile Close Button */}
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="w-10 h-10 flex items-center justify-center transition-transform group-hover:scale-105">
                <img 
                  src="/logo.png?v=2" 
                  alt="NoteBase Logo" 
                  className="w-10 h-10 object-contain"
                />
              </div>
              <span className="text-2xl font-extrabold tracking-tight text-slate-900">
                Note<span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">Base</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(false)}
              aria-label="Minimize sidebar"
              className="md:hidden w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Links - All 100% Clickable with Active Highlighting */}
          <nav className="space-y-1.5">
            {/* 1. Dashboard */}
            <button
              onClick={() => navigateToSection('Dashboard')}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all cursor-pointer ${
                activeNav === 'Dashboard'
                  ? 'bg-[#3b49df] text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Home className="w-5 h-5" />
              <span>Dashboard</span>
            </button>

            {/* 2. Upload */}
            <button
              onClick={() => navigateToSection('Upload')}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all cursor-pointer ${
                activeNav === 'Upload'
                  ? 'bg-[#3b49df] text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <UploadCloud className="w-5 h-5" />
              <span>Upload</span>
            </button>

            {/* 3. Notes */}
            <button
              onClick={() => navigateToSection('Notes')}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all cursor-pointer ${
                activeNav === 'Notes'
                  ? 'bg-[#3b49df] text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <FileText className="w-5 h-5" />
              <span>Notes</span>
            </button>

            {/* 5. PYQs */}
            <button
              onClick={() => navigateToSection('PYQs')}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all cursor-pointer ${
                activeNav === 'PYQs'
                  ? 'bg-[#3b49df] text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <HelpCircle className="w-5 h-5" />
              <span>PYQs</span>
            </button>

            {/* 6. Lectures */}
            <button
              onClick={() => navigateToSection('Lectures')}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all cursor-pointer ${
                activeNav === 'Lectures'
                  ? 'bg-[#3b49df] text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <PlayCircle className="w-5 h-5" />
              <span>Lectures</span>
            </button>

            {/* 7. Add Subject */}
            <button
              onClick={() => navigateToSection('Add Subject')}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all cursor-pointer ${
                activeNav === 'Add Subject'
                  ? 'bg-[#3b49df] text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-5 h-5" />
              <span>Add Subject</span>
            </button>
          </nav>
        </div>

        {/* Bottom Profile Widget with Quick Logout & Details */}
        <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
          <button 
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setIsMobileSidebarOpen(false);
            }}
            className="flex items-center space-x-3 text-left hover:opacity-80 transition-opacity cursor-pointer flex-1"
          >
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="overflow-hidden">
              <div className="text-sm font-bold text-slate-900 truncate max-w-[130px]" title={coordinatorDisplayName}>
                {coordinatorDisplayName}
              </div>
              <div className="text-xs text-indigo-600 font-medium truncate max-w-[120px]">
                {branchParam}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                await fetch('/api/coordinator/auth', { method: 'DELETE' });
                sessionStorage.removeItem('notehub_active_coordinator');
              } catch {}
              router.push('/coordinator');
            }}
            title="Logout / Change Branch"
            className="w-9 h-9 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main className="flex-1 p-6 sm:p-10 space-y-6 overflow-y-auto relative">
        
        {/* Top Header Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#3b49df] text-white flex items-center justify-center shadow-sm">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Branch Coordinator
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Manage Notes & PYQs for your Branch
              </p>
            </div>
          </div>

          {/* Right Header Controls (Profile Popover) */}
          <div className="flex items-center space-x-3 sm:space-x-4 relative">
            
            {/* Profile Button */}
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                title="Coordinator Account"
                className="w-10 h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 flex items-center justify-center text-slate-700 hover:text-slate-900 transition-colors shadow-sm cursor-pointer"
              >
                <User className="w-4 h-4 text-slate-600" />
              </button>

              {/* Profile Menu Dropdown */}
              {showUserMenu && (
                <div className="absolute right-0 mt-3 w-64 bg-white rounded-3xl shadow-2xl border border-slate-100 p-4 z-40 animate-in fade-in zoom-in-95 duration-150 space-y-3">
                  <div className="border-b border-slate-100 pb-3">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Active Coordinator</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{branchParam}</p>
                    <p className="text-xs text-indigo-600 font-medium">{yearParam}</p>
                  </div>
                  <div className="space-y-1 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserMenu(false);
                        setShowChangePasswordModal(true);
                      }}
                      className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer text-left"
                    >
                      <Key className="w-3.5 h-3.5 text-slate-500" />
                      <span>Change Password</span>
                    </button>
                    <Link
                      href="/coordinator"
                      className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Banner Card (Branch Specific Access Banner matching reference) */}
        <div className="bg-gradient-to-r from-[#eef2ff] via-[#f5f3ff] to-[#faf5ff] border border-indigo-100/80 rounded-3xl p-6 sm:p-7 shadow-[0_4px_20px_rgba(79,70,229,0.04)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-white border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm shrink-0">
              <Layers className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                {branchParam}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                Branch Access: Only {branchParam} • Assigned: <strong className="text-indigo-700">{yearParam}</strong>
              </p>
            </div>
          </div>

          <div className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-2xl bg-white text-indigo-700 border border-indigo-200/60 text-xs font-bold shadow-sm self-start sm:self-auto">
            <Check className="w-4 h-4 text-indigo-600 stroke-[2.5]" />
            <span>Coordinator</span>
          </div>
        </div>

        {/* =========================================================================
            VIEW 1: DASHBOARD (Shows ONLY 4 KPI Stat Cards + Quick Action Portals)
            (Upload and Manage boxes are completely removed from here!)
           ========================================================================= */}
        {activeNav === 'Dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            {/* 3 Stat KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              
              {/* 1. Notes Stat -> Clickable: Navigates to Notes view */}
              <button
                onClick={() => navigateToSection('Notes')}
                className="bg-white rounded-3xl border border-slate-100 p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-indigo-200 transition-all text-left flex items-center space-x-4 cursor-pointer group"
              >
                <div className="w-12 h-12 rounded-2xl bg-indigo-50/80 group-hover:bg-indigo-600 group-hover:text-white text-indigo-600 flex items-center justify-center shrink-0 transition-colors">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-medium block group-hover:text-indigo-600 transition-colors">Notes</span>
                  <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">{notesCount}</span>
                </div>
              </button>

              {/* 2. PYQs Stat -> Clickable: Navigates to PYQs view */}
              <button
                onClick={() => navigateToSection('PYQs')}
                className="bg-white rounded-3xl border border-slate-100 p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-blue-200 transition-all text-left flex items-center space-x-4 cursor-pointer group"
              >
                <div className="w-12 h-12 rounded-2xl bg-blue-50/80 group-hover:bg-blue-600 group-hover:text-white text-blue-600 flex items-center justify-center shrink-0 transition-colors">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-medium block group-hover:text-blue-600 transition-colors">PYQs</span>
                  <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">{pyqsCount}</span>
                </div>
              </button>

              {/* 3. Total Files Stat -> Clickable: Navigates to Notes view */}
              <button
                onClick={() => navigateToSection('Notes')}
                className="bg-white rounded-3xl border border-slate-100 p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-emerald-200 transition-all text-left flex items-center space-x-4 cursor-pointer group"
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-50/80 group-hover:bg-emerald-600 group-hover:text-white text-emerald-600 flex items-center justify-center shrink-0 transition-colors">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-medium block group-hover:text-emerald-600 transition-colors">Total Files</span>
                  <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">{totalFilesCount}</span>
                </div>
              </button>

            </div>

            {/* Quick Action Portals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              
              {/* Upload Card Shortcut */}
              <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-7 shadow-[0_2px_14px_rgba(0,0,0,0.02)] flex flex-col justify-between space-y-4 hover:border-indigo-200 transition-all">
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Upload New Material</h3>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                    Upload handwritten notes, lecture slides, and university PYQ papers for {branchParam} ({yearParam}).
                  </p>
                </div>
                <button
                  onClick={() => navigateToSection('Upload')}
                  className="w-full py-3.5 px-4 bg-[#3b49df] hover:bg-[#323fc0] text-white rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition-all shadow-sm cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Go to Upload Section</span>
                </button>
              </div>

              {/* Notes & PYQs Quick Card Shortcut */}
              <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-7 shadow-[0_2px_14px_rgba(0,0,0,0.02)] flex flex-col justify-between space-y-4 hover:border-indigo-200 transition-all">
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <FileText className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Notes & PYQs Repository</h3>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                    Browse, search, preview, rename, and download your branch's {totalFilesCount} active documents.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => navigateToSection('Notes')}
                    className="py-3 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>View Notes</span>
                  </button>
                  <button
                    onClick={() => navigateToSection('PYQs')}
                    className="py-3 px-3 bg-[#3b49df] hover:bg-[#323fc0] text-white rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <HelpCircle className="w-4 h-4" />
                    <span>View PYQs</span>
                  </button>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* =========================================================================
            VIEW 2: UPLOAD VIEW (Shows ONLY the Upload New Material Box)
           ========================================================================= */}
        {activeNav === 'Upload' && (
          <div className="max-w-2xl mx-auto w-full animate-in fade-in duration-200">
            <div id="upload-section" className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_2px_16px_rgba(0,0,0,0.03)] space-y-6">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center space-x-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Upload New Material</h3>
                    <p className="text-xs text-slate-500">Upload PDF documents for {branchParam}</p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                  {yearParam}
                </span>
              </div>

              {/* Upload Form */}
              <form onSubmit={handleUploadSubmit} className="space-y-4">
                
                {/* 1. Semester Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">Semester</label>
                  <div className="relative">
                    <select
                      value={uploadSemester}
                      onChange={(e) => {
                        setUploadSemester(e.target.value);
                        setUploadSubject('');
                      }}
                      className="w-full h-13 px-4 bg-white border border-slate-200/90 rounded-2xl text-sm font-medium text-slate-800 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent cursor-pointer pr-10 shadow-sm"
                    >
                      <option value="">Select Semester</option>
                      {coordinatorSemesters.map((sem) => (
                        <option key={sem} value={sem}>{sem}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* 2. Subject Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">Subject</label>
                  <div className="relative">
                    <select
                      value={uploadSubject}
                      onChange={(e) => setUploadSubject(e.target.value)}
                      className="w-full h-13 px-4 bg-white border border-slate-200/90 rounded-2xl text-sm font-medium text-slate-800 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent cursor-pointer pr-10 shadow-sm"
                    >
                      <option value="">Select Subject</option>
                      {availableSubjects.map((subj) => (
                        <option key={subj} value={subj}>{subj}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* 3. Material Type Dropdown (Notes, PYQ, or Lectures) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">Type</label>
                  <div className="relative">
                    <select
                      value={uploadType}
                      onChange={(e) => setUploadType(e.target.value as 'Notes' | 'PYQ' | 'Lectures')}
                      className="w-full h-13 px-4 bg-white border border-slate-200/90 rounded-2xl text-sm font-medium text-slate-800 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent cursor-pointer pr-10 shadow-sm"
                    >
                      <option value="Notes">Notes</option>
                      <option value="PYQ">PYQ</option>
                      <option value="Lectures">Lectures</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* If Lectures -> Video Class Link; Else -> PDF File Attachment Box */}
                {uploadType === 'Lectures' ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 block">
                        Video Class Link (YouTube / Google Drive URL) <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[11px] text-slate-400">Paste direct public video link</span>
                    </div>
                    <div className="relative">
                      <Video className="w-4 h-4 text-purple-600 absolute left-4 top-1/2 -translate-y-1/2" />
                      <input
                        type="url"
                        required
                        value={lectureLink}
                        onChange={(e) => setLectureLink(e.target.value)}
                        placeholder="e.g. https://www.youtube.com/watch?v=... or Google Drive URL"
                        className="w-full h-12 pl-11 pr-4 bg-white border border-slate-200/90 rounded-2xl text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">PDF File Attachment</label>
                    
                    {/* Hidden File Input */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-5 text-center cursor-pointer bg-slate-50/50 hover:bg-indigo-50/20 transition-all space-y-1.5"
                    >
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div className="text-xs font-bold text-slate-800">
                        {selectedFileObj ? selectedFileObj.name : 'Click to Browse PDF File from Computer'}
                      </div>
                      <div className="text-[11px] text-slate-400 font-medium">
                        {selectedFileObj 
                          ? `${(selectedFileObj.size / (1024 * 1024)).toFixed(2)} MB • Ready to Upload` 
                          : 'Accepts .pdf curriculum syllabus files'}
                      </div>
                    </div>
                  </div>
                )}

                {/* File Title / Document Name */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 block">
                      {uploadType === 'Lectures' ? 'Lecture Title' : 'Display Title'} <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-slate-400">Users will see this exact name</span>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder={
                      uploadType === 'Lectures'
                        ? 'e.g. Lecture 01: Core Theoretical Concepts & Introduction'
                        : 'e.g. Unit 1 Complete Handwritten Notes'
                    }
                    value={uploadFileName}
                    onChange={(e) => setUploadFileName(e.target.value)}
                    className="w-full h-12 px-4 bg-white border border-slate-200/90 rounded-2xl text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm"
                  />
                </div>

                {/* Name / Owner (Only for Notes & PYQs; hidden when Lectures is selected) */}
                {uploadType !== 'Lectures' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 block">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[11px] text-slate-400">Faculty / Student Name</span>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Pushpendra Gora"
                      value={uploadOwner}
                      onChange={(e) => setUploadOwner(e.target.value)}
                      className="w-full h-12 px-4 bg-white border border-slate-200/90 rounded-2xl text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm"
                    />
                  </div>
                )}

                {/* Big Upload Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isUploading}
                    className="w-full h-14 bg-[#3b49df] hover:bg-[#323fc0] active:scale-[0.99] text-white rounded-2xl font-bold text-sm sm:text-base flex items-center justify-center space-x-2 shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-70"
                  >
                    {isUploading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      uploadType === 'Lectures' ? <Video className="w-5 h-5" /> : <UploadCloud className="w-5 h-5" />
                    )}
                    <span>
                      {isUploading
                        ? (uploadType === 'Lectures' ? 'Publishing Lecture...' : 'Uploading...')
                        : (uploadType === 'Lectures' ? 'Publish Video Lecture' : uploadType === 'PYQ' ? 'Upload PYQ Paper' : 'Upload Notes')}
                    </span>
                  </button>
                </div>

              </form>

            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 3: NOTES / PYQS REPOSITORY (Shows ONLY the Selected Repository Box)
           ========================================================================= */}
        {(activeNav === 'Notes' || activeNav === 'PYQs') && (
          <div className="w-full animate-in fade-in duration-200">
            <div id="manage-section" className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_2px_16px_rgba(0,0,0,0.03)] space-y-6">
              
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center space-x-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    {activeNav === 'Notes' ? (
                      <FileText className="w-5 h-5" />
                    ) : (
                      <HelpCircle className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {activeNav === 'Notes' ? 'Manage Notes Repository' : 'Manage PYQs Repository'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {branchParam} • {yearParam}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => navigateToSection('Upload')}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Upload New</span>
                  </button>
                  <span className="text-xs font-semibold text-slate-400">
                    {filteredFiles.length} file{filteredFiles.length === 1 ? '' : 's'} listed
                  </span>
                </div>
              </div>

              {/* Search Input with Clear Button */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by subject or filename..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-12 pl-11 pr-10 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs sm:text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Files List */}
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 pb-10">
                {filteredFiles.length > 0 ? (
                  filteredFiles.map((file, idx) => (
                    <div
                      key={file.id}
                      className="p-3.5 sm:p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 bg-white hover:bg-slate-50/70 transition-all flex items-center justify-between gap-2.5 sm:gap-3 shadow-[0_1px_4px_rgba(0,0,0,0.02)] group relative"
                    >
                      {/* Left: Red PDF Icon + Details (Clickable to preview) */}
                      <div 
                        onClick={() => setPreviewFile(file)}
                        className="flex items-center space-x-3 sm:space-x-3.5 min-w-0 flex-1 cursor-pointer"
                        title="Click to preview file"
                      >
                        <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold text-[10px] tracking-wider shrink-0 border border-red-100 group-hover:bg-red-600 group-hover:text-white transition-colors">
                          PDF
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs sm:text-sm font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors" title={file.name}>
                            {file.name}
                          </div>
                          <div className="text-[11px] text-slate-500 font-medium truncate flex items-center space-x-1.5">
                            <span>{file.semester} • {file.subject}{file.size ? ` • ${file.size}` : ''}</span>
                            {file.owner && (
                              <span className="text-indigo-600 font-semibold hidden sm:inline">• 👤 {file.owner}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right (PC / Desktop Mode): Unchanged inline Actions (Download, View, Edit, Delete) */}
                      <div className="hidden sm:flex items-center space-x-1 shrink-0">
                        
                        {/* Download */}
                        <button
                          type="button"
                          onClick={() => handleDownloadFile(file)}
                          title="Download Document"
                          className="w-8 h-8 rounded-xl hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Download className="w-4 h-4" />
                        </button>

                        {/* View */}
                        <button
                          type="button"
                          onClick={() => setPreviewFile(file)}
                          title="View Document"
                          className="w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFile(file);
                            setNewEditName(file.name);
                          }}
                          title="Edit Document Name"
                          className="w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleDelete(file.id, file.name)}
                          title="Delete Document"
                          className="w-8 h-8 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Right (Mobile Mode): Single 3-Dot Menu Button so filename gets full width */}
                      <div className="sm:hidden relative shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setOpenActionMenuId((prev) => (prev === file.id ? null : file.id))}
                          aria-label="File actions"
                          className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {openActionMenuId === file.id && (
                          <div
                            className={`absolute right-0 w-40 bg-white rounded-2xl border border-slate-100 shadow-xl py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100 ${
                              idx >= filteredFiles.length - 1 && filteredFiles.length > 1
                                ? 'bottom-full mb-1.5'
                                : 'top-full mt-1.5'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionMenuId(null);
                                setPreviewFile(file);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center space-x-2.5 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Preview</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionMenuId(null);
                                handleDownloadFile(file);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center space-x-2.5 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Download</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionMenuId(null);
                                setEditingFile(file);
                                setNewEditName(file.name);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center space-x-2.5 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                              <span>Edit Name</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionMenuId(null);
                                handleDelete(file.id, file.name);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center space-x-2.5 border-t border-slate-100 mt-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>

                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl space-y-2">
                    <p>No {activeNav === 'Notes' ? 'Notes' : activeNav === 'PYQs' ? 'PYQ' : ''} files found matching your search.</p>
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="text-indigo-600 font-semibold hover:underline"
                      >
                        Clear Search
                      </button>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 4: LECTURES REPOSITORY (Manage all lectures: edit, delete, watch)
           ========================================================================= */}
        {activeNav === 'Lectures' && (
          <div className="w-full animate-in fade-in duration-200">
            <div id="lectures-manage-section" className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_2px_16px_rgba(0,0,0,0.03)] space-y-6">
              
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <PlayCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Manage Lectures</h3>
                    <p className="text-xs text-slate-500">
                      Search, preview, rename, and delete uploaded video lectures for {branchParam} ({yearParam})
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700">
                    {filteredLectures.length} of {lecturesList.length} lectures
                  </span>
                  <button
                    onClick={() => {
                      setUploadType('Lectures');
                      navigateToSection('Upload');
                    }}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-[#3b49df] hover:bg-[#323fc0] text-white text-xs font-semibold transition-all cursor-pointer shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Upload Lecture</span>
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={lectureSearchQuery}
                  onChange={(e) => setLectureSearchQuery(e.target.value)}
                  placeholder="Search lectures by title, subject, or semester..."
                  className="w-full h-11 pl-11 pr-4 bg-slate-50/70 border border-slate-200/80 rounded-2xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-all shadow-sm"
                />
                {lectureSearchQuery && (
                  <button
                    onClick={() => setLectureSearchQuery('')}
                    className="text-xs text-slate-400 hover:text-slate-600 absolute right-4 top-1/2 -translate-y-1/2 font-semibold cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Lectures List */}
              <div className="divide-y divide-slate-100">
                {filteredLectures.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm space-y-2">
                    <p>No lectures found matching your search.</p>
                    <button
                      onClick={() => {
                        setUploadType('Lectures');
                        navigateToSection('Upload');
                      }}
                      className="text-indigo-600 font-semibold text-xs hover:underline cursor-pointer"
                    >
                      + Upload a new lecture now
                    </button>
                  </div>
                ) : (
                  filteredLectures.map((lec, idx) => (
                    <div
                      key={lec.id}
                      className="py-3.5 sm:py-4 flex items-center justify-between gap-2.5 sm:gap-3 hover:bg-slate-50/60 p-3 rounded-2xl transition-colors group relative"
                    >
                      {/* Left: Video Icon & Details */}
                      <div className="flex items-center space-x-3 sm:space-x-3.5 min-w-0 flex-1">
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors shadow-sm">
                          <Video className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <h5 className="text-xs sm:text-sm font-bold text-slate-800 truncate" title={lec.title}>
                            {lec.title}
                          </h5>
                          <div className="flex items-center space-x-2 text-[11px] sm:text-xs text-slate-400 truncate">
                            <span>{lec.semester}</span>
                            <span>•</span>
                            <span className="text-slate-600 font-medium truncate">{lec.subject}</span>
                            <span className="hidden sm:inline">•</span>
                            <span className="hidden sm:inline">{lec.date}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right (PC / Desktop Mode): Unchanged inline Actions (Watch, Edit, Delete) */}
                      <div className="hidden sm:flex items-center space-x-1.5 shrink-0">
                        {/* Watch / Open Link */}
                        {lec.link ? (
                          <a
                            href={lec.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Watch Lecture Link"
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Watch</span>
                          </a>
                        ) : null}

                        {/* Edit Name & Link */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLecture(lec);
                            setNewLectureEditTitle(lec.title);
                            setNewLectureEditLink(lec.link || '');
                          }}
                          title="Edit Lecture Name & Link"
                          className="w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleDeleteLecture(lec.id, lec.title)}
                          title="Delete Lecture"
                          className="w-9 h-9 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Right (Mobile Mode): Single 3-Dot Menu Button */}
                      <div className="sm:hidden relative shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setOpenActionMenuId((prev) => (prev === lec.id ? null : lec.id))}
                          aria-label="Lecture actions"
                          className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {openActionMenuId === lec.id && (
                          <div
                            className={`absolute right-0 w-40 bg-white rounded-2xl border border-slate-100 shadow-xl py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100 ${
                              idx >= filteredLectures.length - 1 && filteredLectures.length > 1
                                ? 'bottom-full mb-1.5'
                                : 'top-full mt-1.5'
                            }`}
                          >
                            {lec.link && (
                              <a
                                href={lec.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setOpenActionMenuId(null)}
                                className="w-full px-3.5 py-2 text-left text-xs font-semibold text-indigo-700 hover:bg-indigo-50 flex items-center space-x-2.5 cursor-pointer"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>Watch</span>
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionMenuId(null);
                                setEditingLecture(lec);
                                setNewLectureEditTitle(lec.title);
                                setNewLectureEditLink(lec.link || '');
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center space-x-2.5 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionMenuId(null);
                                handleDeleteLecture(lec.id, lec.title);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center space-x-2.5 border-t border-slate-100 mt-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 6: ADD & MANAGE SUBJECTS VIEW
           ========================================================================= */}
        {activeNav === 'Add Subject' && (
          <div className="max-w-4xl mx-auto w-full space-y-6 animate-in fade-in duration-200">
            {/* Top Container: Semester Selector & Add Subject Card */}
            <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_2px_16px_rgba(0,0,0,0.03)] space-y-6">
              
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Manage Semester Subjects</h3>
                    <p className="text-xs text-slate-500">
                      Add or delete subjects for {branchParam} ({yearParam}). Changes sync live across Student Search &amp; Upload forms.
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 self-start sm:self-center">
                  {yearParam}
                </span>
              </div>

              {/* Step 1: Semester Selector Tabs */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Select Semester to Manage
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {coordinatorSemesters.map((sem) => {
                    const isSelected = activeSubjectSemester === sem;
                    return (
                      <button
                        key={sem}
                        type="button"
                        onClick={() => setSubjectSemester(sem)}
                        className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#3b49df] text-white shadow-md shadow-indigo-100'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80'
                        }`}
                      >
                        {sem}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Add New Subject Form */}
              <form onSubmit={handleAddSubjectSubmit} className="pt-2 border-t border-slate-100 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Add New Subject to {activeSubjectSemester}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Subject Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newSubjectTitle}
                      onChange={(e) => setNewSubjectTitle(e.target.value)}
                      placeholder="e.g. Artificial Intelligence & Expert Systems"
                      className="w-full h-12 px-4 bg-white border border-slate-200/90 rounded-2xl text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Subject Code (Optional)
                    </label>
                    <input
                      type="text"
                      value={newSubjectCode}
                      onChange={(e) => setNewSubjectCode(e.target.value)}
                      placeholder="e.g. CS501"
                      className="w-full h-12 px-4 bg-white border border-slate-200/90 rounded-2xl text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="px-6 py-3 rounded-2xl bg-[#3b49df] hover:bg-[#323fc0] text-white text-xs sm:text-sm font-bold shadow-md shadow-indigo-100 hover:shadow-lg transition-all inline-flex items-center space-x-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Subject to {activeSubjectSemester}</span>
                </button>
              </form>
            </div>

            {/* List of Active Subjects for selected semester */}
            <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_2px_16px_rgba(0,0,0,0.03)] space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                  <h4 className="text-base font-bold text-slate-900">
                    Active Subjects in {activeSubjectSemester} ({currentSemesterSubjects.length})
                  </h4>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {branchParam}
                </span>
              </div>

              {currentSemesterSubjects.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">
                  No subjects in this semester yet. Use the form above to add a subject!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {currentSemesterSubjects.map((subj) => (
                    <div
                      key={subj.code + subj.title}
                      className="p-4 rounded-2xl bg-slate-50/70 hover:bg-white border border-slate-200/80 hover:border-indigo-300 transition-all shadow-sm flex items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-[10px] shrink-0 border border-indigo-100">
                          {subj.code.slice(0, 3)}
                        </div>
                        <div className="overflow-hidden">
                          <h5 className="text-sm font-bold text-slate-800 truncate" title={subj.title}>
                            {subj.title}
                          </h5>
                          <span className="text-xs text-slate-400 font-semibold">{subj.code}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        {/* Edit Subject */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSubject(subj);
                            setEditSubjectTitle(subj.title);
                            setEditSubjectCode(subj.code);
                          }}
                          title={`Edit ${subj.title}`}
                          className="w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {/* Delete Subject */}
                        <button
                          type="button"
                          onClick={() => handleDeleteSubject(subj.title)}
                          title={`Delete ${subj.title}`}
                          className="w-8 h-8 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* STORAGE DETAILS MODAL (Opened from Storage KPI Card) */}
      {showStorageModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5 text-slate-900 font-bold text-base">
                <HardDrive className="w-5 h-5 text-amber-500" />
                <span>Department Storage Breakdown</span>
              </div>
              <button onClick={() => setShowStorageModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-slate-500">Assigned Branch:</span>
                <span className="font-bold text-slate-800">{branchParam}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-slate-500">Notes Volume:</span>
                <span className="font-bold text-indigo-600">{notesCount} files (~{(notesCount * 6.8).toFixed(1)} MB)</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-slate-500">PYQ Papers Volume:</span>
                <span className="font-bold text-blue-600">{pyqsCount} files (~{(pyqsCount * 6.8).toFixed(1)} MB)</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-slate-500">Current Total:</span>
                <span className="font-extrabold text-slate-900">{storageUsedMB} MB of 10,000 MB (10 GB)</span>
              </div>
            </div>

            {/* Storage Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 to-amber-500 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(3, parseFloat(storageUsedMB) / 100))}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 text-right">97.2% Cloud Capacity Available</p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowStorageModal(false)}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#3b49df] text-white hover:bg-indigo-700 shadow-sm cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Edit Modal */}
      {editingFile && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-base font-bold text-slate-900">Edit Document Name</h4>
              <button onClick={() => setEditingFile(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700">Filename</label>
              <input
                type="text"
                value={newEditName}
                onChange={(e) => setNewEditName(e.target.value)}
                className="w-full h-12 px-4 rounded-2xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setEditingFile(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#3b49df] text-white hover:bg-indigo-700 shadow-sm cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Edit Lecture Modal */}
      {editingLecture && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Edit3 className="w-4 h-4 text-indigo-600" />
                <h4 className="text-base font-bold text-slate-900">Edit Lecture</h4>
              </div>
              <button onClick={() => setEditingLecture(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">Lecture Title</label>
                <input
                  type="text"
                  value={newLectureEditTitle}
                  onChange={(e) => setNewLectureEditTitle(e.target.value)}
                  placeholder="Lecture Title"
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">Video Class Link (Optional)</label>
                <input
                  type="url"
                  value={newLectureEditLink}
                  onChange={(e) => setNewLectureEditLink(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setEditingLecture(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveLectureEdit}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#3b49df] text-white hover:bg-indigo-700 shadow-sm cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Subject Modal */}
      {editingSubject && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <h4 className="text-base font-bold text-slate-900">Edit Subject</h4>
              </div>
              <button onClick={() => setEditingSubject(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">Subject Name</label>
                <input
                  type="text"
                  value={editSubjectTitle}
                  onChange={(e) => setEditSubjectTitle(e.target.value)}
                  placeholder="Subject Name"
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">Subject Code</label>
                <input
                  type="text"
                  value={editSubjectCode}
                  onChange={(e) => setEditSubjectCode(e.target.value)}
                  placeholder="e.g. CS501"
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setEditingSubject(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSubjectEdit}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#3b49df] text-white hover:bg-indigo-700 shadow-sm cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}


      {/* View Preview Modal (Real PDF iframe) */}
      {previewFile && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-4xl w-full h-[85vh] shadow-2xl border border-slate-100 flex flex-col space-y-3">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 shrink-0">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {previewFile.type}
                </span>
                <h4 className="text-base sm:text-lg font-bold text-slate-900 mt-1">{previewFile.name}</h4>
                <p className="text-xs text-slate-500">{previewFile.semester} • {previewFile.subject} • {previewFile.size}</p>
              </div>
              <button onClick={() => setPreviewFile(null)} className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 w-full bg-slate-100 rounded-2xl overflow-hidden flex flex-col">
              {previewFile.file_url ? (
                <iframe
                  src={previewFile.file_url.replace(/\/view(\?.*)?$/, '/preview')}
                  title={previewFile.name}
                  className="w-full h-full flex-1 border-0 bg-white"
                  allow="autoplay; fullscreen"
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-2">
                  <p className="text-sm font-bold text-slate-700">No PDF File Attached</p>
                  <p className="text-xs text-slate-500">This record was created without an attached Google Drive PDF.</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 shrink-0">
              <button
                onClick={() => handleDownloadFile(previewFile)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center space-x-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{previewFile.file_url ? 'Download / View PDF' : 'No PDF'}</span>
              </button>

              <button
                onClick={() => setPreviewFile(null)}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 shadow-sm cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5 text-slate-900 font-bold text-base">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
                <span>Change Coordinator Password</span>
              </div>
              <button onClick={() => setShowChangePasswordModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">Current Password</label>
                <input
                  type="password"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">New Password</label>
                <input
                  type="password"
                  placeholder="Enter new password (min. 4 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">Confirm New Password</label>
                <input
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              {passwordError && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-semibold border border-red-200 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowChangePasswordModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#3b49df] text-white hover:bg-[#323fc0] shadow-sm cursor-pointer"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supabase Cloud Database & Storage Modal */}
      {showSupabaseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Supabase Cloud Database</h3>
                  <p className="text-xs text-slate-500">PostgreSQL cloud database for metadata and public links (PDFs stored in Google Drive)</p>
                </div>
              </div>
              <button onClick={() => setShowSupabaseModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Connection Status Badge */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between ${
              supabaseConnected 
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800' 
                : 'bg-amber-50/70 border-amber-200 text-amber-800'
            }`}>
              <div className="flex items-center space-x-3">
                <span className={`w-3 h-3 rounded-full ${supabaseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                <div>
                  <p className="text-xs font-bold">
                    {supabaseConnected ? 'Cloud Active: Connected to Supabase' : 'Status: Unconnected / Local Fallback Active'}
                  </p>
                  <p className="text-[11px] opacity-80">
                    {supabaseConnected 
                      ? 'Uploaded PDFs store directly in Supabase Storage with public links in DB.' 
                      : 'Files and dynamic subjects will save in browser memory until credentials are added.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Config Form */}
            <form onSubmit={handleSaveSupabaseConfig} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  Supabase Project URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://your-project-id.supabase.co"
                  value={supabaseUrlInput}
                  onChange={(e) => setSupabaseUrlInput(e.target.value)}
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  Supabase Anon (Public) Key <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={supabaseKeyInput}
                  onChange={(e) => setSupabaseKeyInput(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {supabaseMessage && (
                <div className={`p-3 rounded-xl text-xs font-semibold border flex items-center space-x-2 ${
                  supabaseMessage.type === 'success' 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                    : supabaseMessage.type === 'error'
                    ? 'bg-red-50 text-red-600 border-red-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}>
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{supabaseMessage.text}</span>
                </div>
              )}

              {/* Quick Setup Instructions */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-[11px] text-slate-600 space-y-1.5">
                <p className="font-bold text-slate-800">Quick 3-Step Setup:</p>
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Go to <strong>Project Settings → API</strong> in your Supabase dashboard and copy the Project URL & anon key.</li>
                  <li>In Supabase <strong>SQL Editor</strong>, run the code from <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800 font-mono">supabase-schema.sql</code> (present in project root).</li>
                  <li>Click <strong>Test & Save</strong> below. All PDFs and public links will automatically synchronize live!</li>
                </ol>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                {supabaseConnected ? (
                  <button
                    type="button"
                    onClick={handleDisconnectSupabase}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    Disconnect
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowSupabaseModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={supabaseTesting}
                    className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer disabled:opacity-60"
                  >
                    {supabaseTesting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Connecting...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Test & Save</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION POPUP MODAL */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{deleteConfirm.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Confirmation required before deleting</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
              {deleteConfirm.message}
            </p>

            <div className="flex items-center justify-end space-x-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingConfirm}
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingConfirm}
                onClick={async () => {
                  setIsDeletingConfirm(true);
                  try {
                    await deleteConfirm.onConfirm();
                  } finally {
                    setIsDeletingConfirm(false);
                    setDeleteConfirm(null);
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingConfirm ? 'Deleting...' : 'Allow & Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function CoordinatorDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6 text-slate-600 text-sm font-medium">
        Loading Coordinator Dashboard...
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
