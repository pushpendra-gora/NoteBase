'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { 
  BookOpen, 
  Home, 
  Users, 
  Layers, 
  UploadCloud, 
  Calendar, 
  GitBranch, 
  BarChart3, 
  Settings, 
  Crown, 
  User, 
  ChevronDown, 
  Zap, 
  Plus, 
  Trash2, 
  Download, 
  Search, 
  FileText, 
  Eye, 
  EyeOff,
  Key,
  Edit3, 
  ArrowRight, 
  Lock, 
  Check, 
  LogOut, 
  AlertCircle,
  FileCheck,
  X,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  RotateCcw,
  Upload,
  Video,
  Link2,
  Database,
  HardDrive,
  Cloud,
  Copy,
  RefreshCw,
  Loader2,
  Menu,
  MessageSquareWarning,
  Send
} from 'lucide-react';
import { 
  getSubjectsFor, 
  saveSubjectsFor, 
  addSubjectFor,
  updateSubjectFor,
  deleteSubjectFor,
  saveCustomUploadedDocument, 
  deleteCustomUploadedDocument,
  YEAR_SEMESTER_MAP,
  FIRST_YEAR_GROUPS,
  STANDARD_BRANCHES,
  YEARS
} from '../../data/notesData';
import { YearOption, BranchOption, SemesterOption, NoteDocument, SubjectMeta, CoordinatorIssue } from '../../types';
import { 
  insertDocumentToSupabase, 
  deleteDocumentFromSupabase,
  insertLectureToSupabase,
  deleteLectureFromSupabase,
  CoordinatorRecord,
  fetchAllDocumentsFromSupabase,
  fetchAllLecturesFromSupabase,
  fetchAllSubjectsFromSupabase,
  fetchSubjectsFromSupabase,
  insertSubjectToSupabase,
  updateSubjectInSupabase,
  deleteSubjectFromSupabase
} from '../../lib/supabaseService';
import { 
  isSupabaseConfigured, 
  getSupabaseCredentials, 
  saveSupabaseCredentials, 
  clearSupabaseCredentials
} from '../../lib/supabase';
import { getStoredCoordinators, saveStoredCoordinators, isBranchMatch } from '../../lib/coordinatorService';
import {
  getGoogleDriveConfig,
  saveGoogleDriveConfig,
  isGoogleDriveConfigured,
  uploadPdfToGoogleDrive,
  uploadUnifiedPdf,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  GoogleDriveConfig,
  lastGoogleDriveError,
  deleteDocumentEverywhere
} from '../../lib/googleDriveService';
import { extractPdfPageCount, formatFileSize } from '../../lib/pdfMetadata';
import { openSafeExternalUrl } from '../../lib/urlSafety';
import PdfPreviewModal from '../../components/PdfPreviewModal';

interface AdminMaterial {
  id: string;
  fileName: string;
  year: string;
  branch: string;
  semester?: string;
  subject: string;
  type: 'Notes' | 'PYQs' | 'Lectures';
  uploadedBy: string;
  link?: string;
  file_url?: string;
  file_path?: string;
}

type CoordinatorItem = CoordinatorRecord;

export default function AdminPage() {
  // Authentication State
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Admin Stored ID with LocalStorage persistence
  const [storedAdminId, setStoredAdminId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('notehub_admin_id') || 'admin';
    }
    return 'admin';
  });

  // Admin Change Password Modal State
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [changePasswordForm, setChangePasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState('');

  // Active Navigation Tab State & Mobile Drawer Toggle
  const [activeNav, setActiveNav] = useState<
    'Dashboard' | 'Coordinators' | 'Issues' | 'All Materials' | 'Upload Material' | 'Add Subject' | 'Manage by Year' | 'Manage by Branch' | 'Statistics' | 'Settings'
  >('Dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const selectAdminNav = (
    nav: 'Dashboard' | 'Coordinators' | 'Issues' | 'All Materials' | 'Upload Material' | 'Add Subject' | 'Manage by Year' | 'Manage by Branch' | 'Statistics' | 'Settings'
  ) => {
    setActiveNav(nav);
    setIsMobileSidebarOpen(false);
  };

  // Coordinator Issues Management State (Stored in Supabase; permanently deleted only by Admin)
  const [adminIssues, setAdminIssues] = useState<CoordinatorIssue[]>([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [issuesTableMissing, setIssuesTableMissing] = useState(false);
  const [issuesError, setIssuesError] = useState<string | null>(null);
  const [issueStatusFilter, setIssueStatusFilter] = useState<'All' | 'Open' | 'Resolved'>('All');
  const [issueReplyDrafts, setIssueReplyDrafts] = useState<Record<string, string>>({});
  const [issueBusyId, setIssueBusyId] = useState<string | null>(null);

  // Manage by Year / Manage by Branch View State
  const [selectedManageYear, setSelectedManageYear] = useState<YearOption>('1st Year');
  const [manageYearTypeFilter, setManageYearTypeFilter] = useState<'All' | 'Notes' | 'PYQs' | 'Lectures'>('All');
  const [selectedManageBranch, setSelectedManageBranch] = useState<BranchOption>('CSE(AI&ML)');
  const [manageBranchYearFilter, setManageBranchYearFilter] = useState<'All' | YearOption>('All');

  // Admin Add / Manage Subjects State
  const [subjYear, setSubjYear] = useState<YearOption>('2nd Year');
  const [subjBranch, setSubjBranch] = useState<BranchOption>('CSE(AI&ML)');
  const [subjSemester, setSubjSemester] = useState<SemesterOption>('Semester 3');
  const [newAdminSubjectTitle, setNewAdminSubjectTitle] = useState('');
  const [newAdminSubjectCode, setNewAdminSubjectCode] = useState('');
  const [adminSubjectsVersion, setAdminSubjectsVersion] = useState(0);
  const [editingAdminSubject, setEditingAdminSubject] = useState<SubjectMeta | null>(null);
  const [editAdminSubjTitle, setEditAdminSubjTitle] = useState('');
  const [editAdminSubjCode, setEditAdminSubjCode] = useState('');

  // Real Supabase Server Health & Connection State
  const [supabaseHealth, setSupabaseHealth] = useState<{
    checked: boolean;
    connected: boolean;
    error: string | null;
  }>({ checked: false, connected: false, error: null });

  // Global Delete Confirmation Modal State
  const [deleteConfirm, setDeleteConfirm] = useState<{
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [isDeletingConfirm, setIsDeletingConfirm] = useState(false);

  // Real Materials List State (populated strictly after authenticated Admin verification)
  const [materials, setMaterials] = useState<AdminMaterial[]>([]);

  // Sync authoritative uploaded materials from Cloud/Supabase (never resurrect deleted localStorage records)
  const syncAllMaterials = useCallback(async () => {
    let cloudDocs: NoteDocument[] | null = null;
    let cloudLecs: any[] | null = null;

    try {
      const creds = getSupabaseCredentials();
      const headers: Record<string, string> = {};
      if (creds.url && creds.key) {
        headers['x-supabase-url'] = creds.url;
        headers['x-supabase-key'] = creds.key;
      }
      const res = await fetch('/api/documents', { cache: 'no-store', headers });
      if (res.ok) {
        const data = await res.json();
        if (data?.success && Array.isArray(data.documents)) {
          cloudDocs = data.documents;
        }
      }
    } catch {
      // Fallback to direct Supabase query below
    }

    if (cloudDocs === null && isSupabaseConfigured()) {
      try {
        cloudDocs = await fetchAllDocumentsFromSupabase();
      } catch (err) {
        console.warn('Could not load documents from Supabase:', err);
      }
    }

    if (isSupabaseConfigured()) {
      try {
        cloudLecs = await fetchAllLecturesFromSupabase();
      } catch (err) {
        console.warn('Could not load lectures from Supabase:', err);
      }
    }

    if (cloudDocs === null && cloudLecs === null) return;

    if (cloudDocs !== null && typeof window !== 'undefined') {
      try {
        const normalizedDocs: NoteDocument[] = cloudDocs.map((d: any) => ({
          id: d.id,
          title: d.title,
          subject: d.subject,
          code: d.code || (d.type === 'PYQ' ? 'PYQ101' : 'DOC101'),
          year: d.year,
          branch: d.branch,
          semester: d.semester,
          type: (d.type === 'PYQ' ? 'PYQ' : 'Notes') as 'Notes' | 'PYQ',
          pages: typeof d.pages === 'number' && d.pages > 0 ? d.pages : 0,
          size: typeof d.size === 'string' ? d.size : '',
          owner: d.owner || 'Department Faculty',
          file_url: d.file_url || undefined,
          file_path: d.file_path || undefined,
          preview: d.preview || [],
          created_at: d.created_at,
        }));
        localStorage.setItem('notehub_custom_documents', JSON.stringify(normalizedDocs));
      } catch {}
    }

    if (cloudLecs !== null && typeof window !== 'undefined') {
      try {
        localStorage.setItem('notehub_custom_lectures', JSON.stringify(cloudLecs));
      } catch {}
    }

    const newDocs: AdminMaterial[] | null =
      cloudDocs !== null
        ? cloudDocs.map((d: any) => ({
            id: d.id,
            fileName: d.title?.endsWith('.pdf') ? d.title : `${d.title}.pdf`,
            year: d.year,
            branch: d.branch,
            semester: d.semester,
            subject: d.subject,
            type: (d.type === 'PYQ' ? 'PYQs' : 'Notes') as 'Notes' | 'PYQs',
            uploadedBy: d.owner || 'Department',
            file_url: d.file_url,
            file_path: d.file_path,
          }))
        : null;

    const newLecs: AdminMaterial[] | null =
      cloudLecs !== null
        ? cloudLecs.map((l: any) => ({
            id: l.id,
            fileName: l.title,
            year: l.year || '2nd Year',
            branch: l.branch || 'CSE(AI&ML)',
            semester: l.semester,
            subject: l.subject,
            type: 'Lectures' as const,
            uploadedBy: l.faculty || 'Coordinator',
            link: l.link,
          }))
        : null;

    setMaterials((prev) => {
      const docsPart = newDocs !== null ? newDocs : prev.filter((m) => m.type !== 'Lectures');
      const lecsPart = newLecs !== null ? newLecs : prev.filter((m) => m.type === 'Lectures');
      return [...docsPart, ...lecsPart];
    });
  }, []);

  // Re-sync materials strictly after authenticated login, tab focus, or view switching
  useEffect(() => {
    if (!isLoggedIn) return;
    syncAllMaterials();
  }, [syncAllMaterials, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (
      activeNav === 'Dashboard' ||
      activeNav === 'All Materials' ||
      activeNav === 'Manage by Year' ||
      activeNav === 'Manage by Branch'
    ) {
      syncAllMaterials();
    }
  }, [activeNav, isLoggedIn, syncAllMaterials]);

  const syncAdminIssues = useCallback(async () => {
    if (!isLoggedIn) return;
    setIsLoadingIssues(true);
    setIssuesError(null);
    try {
      const creds = getSupabaseCredentials();
      const headers: Record<string, string> = {};
      if (creds.url && creds.key) {
        headers['x-supabase-url'] = creds.url;
        headers['x-supabase-key'] = creds.key;
      }
      const res = await fetch('/api/issues', { cache: 'no-store', headers });
      const data = await res.json();
      if (res.ok && data?.success && Array.isArray(data.issues)) {
        setAdminIssues(data.issues);
        setIssuesTableMissing(false);
      } else {
        setIssuesTableMissing(Boolean(data?.tableMissing));
        setIssuesError(data?.error || 'Could not load coordinator issues.');
      }
    } catch {
      setIssuesError('Unable to reach server to fetch issues.');
    } finally {
      setIsLoadingIssues(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    syncAdminIssues();
  }, [isLoggedIn, syncAdminIssues]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (activeNav === 'Issues') {
      syncAdminIssues();
    }
  }, [activeNav, isLoggedIn, syncAdminIssues]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const handleFocus = () => {
      syncAllMaterials();
      syncAdminIssues();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isLoggedIn, syncAllMaterials, syncAdminIssues]);

  const handleToggleResolveIssue = async (issue: CoordinatorIssue, nextStatus: 'Open' | 'Resolved') => {
    setIssueBusyId(issue.id);
    try {
      const creds = getSupabaseCredentials();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (creds.url && creds.key) {
        headers['x-supabase-url'] = creds.url;
        headers['x-supabase-key'] = creds.key;
      }
      const draft = issueReplyDrafts[issue.id];
      const finalReply = draft !== undefined ? draft : issue.admin_reply || '';
      const res = await fetch('/api/issues', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          id: issue.id,
          status: nextStatus,
          admin_reply: finalReply,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.success && data.issue) {
        setAdminIssues((prev) => prev.map((it) => (it.id === issue.id ? data.issue : it)));
        showToast(
          nextStatus === 'Resolved'
            ? `Issue "${issue.subject}" marked as Solved!`
            : `Issue "${issue.subject}" reopened.`
        );
      } else {
        showToast(data?.error || 'Failed to update issue status.', 'error');
      }
    } catch {
      showToast('Network error while updating issue.', 'error');
    } finally {
      setIssueBusyId(null);
    }
  };

  const handleDeleteSingleIssue = (issue: CoordinatorIssue) => {
    setDeleteConfirm({
      title: 'Delete Issue',
      message: `Are you sure you want to delete "${issue.subject}" permanently from the database? Once deleted, it will no longer appear for ${issue.coordinator_name} or Admin.`,
      onConfirm: async () => {
        const creds = getSupabaseCredentials();
        const headers: Record<string, string> = {};
        if (creds.url && creds.key) {
          headers['x-supabase-url'] = creds.url;
          headers['x-supabase-key'] = creds.key;
        }
        const res = await fetch(`/api/issues?id=${encodeURIComponent(issue.id)}`, {
          method: 'DELETE',
          headers,
        });
        const data = await res.json();
        if (res.ok && data?.success) {
          setAdminIssues((prev) => prev.filter((it) => it.id !== issue.id));
          showToast(`Issue "${issue.subject}" permanently deleted from database!`, 'success');
        } else {
          showToast(data?.error || 'Failed to delete issue from database.', 'error');
        }
      },
    });
  };

  const handleBulkDeleteIssues = (mode: 'resolved' | 'all') => {
    const targetCount =
      mode === 'resolved'
        ? adminIssues.filter((i) => i.status === 'Resolved').length
        : adminIssues.length;
    if (targetCount === 0) {
      showToast(mode === 'resolved' ? 'No solved issues to delete.' : 'No issues to delete.', 'error');
      return;
    }
    setDeleteConfirm({
      title: mode === 'resolved' ? `Delete ${targetCount} Solved Issue(s)` : `Delete All ${targetCount} Issue(s)`,
      message:
        mode === 'resolved'
          ? `Delete all ${targetCount} solved issue(s) permanently from database? They will also be removed from Coordinators' dashboards.`
          : `Delete ALL ${targetCount} coordinator issue(s) permanently from database? Coordinators will no longer see them.`,
      onConfirm: async () => {
        const creds = getSupabaseCredentials();
        const headers: Record<string, string> = {};
        if (creds.url && creds.key) {
          headers['x-supabase-url'] = creds.url;
          headers['x-supabase-key'] = creds.key;
        }
        const res = await fetch(`/api/issues?mode=${mode}`, {
          method: 'DELETE',
          headers,
        });
        const data = await res.json();
        if (res.ok && data?.success) {
          setAdminIssues((prev) =>
            mode === 'all' ? [] : prev.filter((it) => it.status !== 'Resolved')
          );
          showToast(
            mode === 'all'
              ? 'All issues permanently deleted from database!'
              : 'All solved issues permanently deleted from database!',
            'success'
          );
        } else {
          showToast(data?.error || 'Failed to delete issues.', 'error');
        }
      },
    });
  };

  useEffect(() => {
    if (isLoggedIn && isSupabaseConfigured()) {

      // Also sync all custom subjects from Supabase to local storage (authoritative source of truth)
      fetchAllSubjectsFromSupabase().then((allSubjs) => {
        if (allSubjs && allSubjs.length > 0) {
          const grouped = new Map<string, { year: YearOption; branch: BranchOption; semester: SemesterOption; list: SubjectMeta[] }>();
          allSubjs.forEach(({ year, branch, semester, subject }) => {
            const key = `${year}___${branch}___${semester}`;
            if (!grouped.has(key)) {
              grouped.set(key, { year, branch, semester, list: [] });
            }
            grouped.get(key)!.list.push(subject);
          });
          grouped.forEach(({ year, branch, semester, list }) => {
            saveSubjectsFor(year, branch, semester, list);
          });
          setAdminSubjectsVersion((v) => v + 1);
        }
      }).catch(() => {});

    }
  }, [isLoggedIn]);

  useEffect(() => {
    let active = true;
    // Verify existing admin session from server httpOnly cookie before revealing dashboard
    fetch('/api/admin/auth', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data && data.authenticated) {
          setIsLoggedIn(true);
        }
        setAuthChecked(true);
      })
      .catch(() => {
        if (active) setAuthChecked(true);
      });

    // Sync Google Drive server configuration status
    fetch('/api/upload-drive')
      .then((res) => res.json())
      .then((data) => {
        if (typeof window !== 'undefined' && data && data.configured !== undefined) {
          localStorage.setItem('notebase_gdrive_server_configured', data.configured ? 'true' : 'false');
        }
      })
      .catch(() => {});

    // Check real Supabase server health & table availability
    fetch('/api/status')
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        setSupabaseHealth({
          checked: true,
          connected: Boolean(data.connected),
          error: data.error || null,
        });
      })
      .catch((err) => {
        if (!active) return;
        setSupabaseHealth({
          checked: true,
          connected: false,
          error: err?.message || 'Could not reach server status API.',
        });
      });

    return () => {
      active = false;
    };
  }, []);

  // Sequential Cascading Filters (Year -> Branch -> Semester -> Subject)
  const [typeFilter, setTypeFilter] = useState<'All' | 'Notes' | 'PYQs'>('All');
  const [yearFilter, setYearFilter] = useState<string>('All');
  const [branchFilter, setBranchFilter] = useState<string>('All');
  const [semesterFilter, setSemesterFilter] = useState<string>('All');
  const [subjectFilter, setSubjectFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [showAllUnfiltered, setShowAllUnfiltered] = useState<boolean>(false);

  // Edit Note Name State
  const [editingMaterial, setEditingMaterial] = useState<AdminMaterial | null>(null);
  const [editMaterialName, setEditMaterialName] = useState<string>('');

  // Admin Upload Form State (Allows Admin to upload for any Year, Branch, Semester, and Subject)
  const [uploadYear, setUploadYear] = useState<YearOption | ''>('');
  const [uploadBranch, setUploadBranch] = useState<BranchOption | ''>('');
  const [uploadSemester, setUploadSemester] = useState<SemesterOption | ''>('');
  const [uploadSubject, setUploadSubject] = useState<string>('');
  const [uploadType, setUploadType] = useState<'Notes' | 'PYQ' | 'Lectures' | ''>('');
  const [uploadDisplayTitle, setUploadDisplayTitle] = useState<string>('');
  const [uploadLectureLink, setUploadLectureLink] = useState<string>('');
  const [uploadOwnerName, setUploadOwnerName] = useState<string>('');
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [isUploadingMaterial, setIsUploadingMaterial] = useState<boolean>(false);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);

  // Coordinators List State (Populated strictly after authenticated Admin verification)
  const [coordinators, setCoordinators] = useState<CoordinatorItem[]>([]);

  // Sync latest coordinators & staff Drive config whenever Admin is logged in
  useEffect(() => {
    if (!isLoggedIn) return;
    let active = true;

    const creds = getSupabaseCredentials();
    const headers: Record<string, string> = {};
    if (creds.url && creds.key) {
      headers['x-supabase-url'] = creds.url;
      headers['x-supabase-key'] = creds.key;
    }

    fetch('/api/coordinators', { headers })
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success && Array.isArray(data.coordinators)) {
          setCoordinators(data.coordinators);
          saveStoredCoordinators(data.coordinators);
        }
      })
      .catch(() => {});

    fetch('/api/status', { headers })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data?.googleDrive?.webhookUrl && !getGoogleDriveConfig().webhookUrl) {
          const syncedCfg = {
            webhookUrl: data.googleDrive.webhookUrl,
            folderId: data.googleDrive.folderId || '',
            enabled: true,
          };
          setGdriveConfig(syncedCfg);
          saveGoogleDriveConfig(syncedCfg);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [isLoggedIn]);

  // Interactive Modals and Popups State
  const [previewMaterial, setPreviewMaterial] = useState<AdminMaterial | null>(null);
  const [isAddCoordOpen, setIsAddCoordOpen] = useState(false);
  const [editingCoord, setEditingCoord] = useState<CoordinatorItem | null>(null);
  const [isSavingCoord, setIsSavingCoord] = useState(false);
  const [coordModalError, setCoordModalError] = useState<string | null>(null);
  const [coordForm, setCoordForm] = useState({
    name: '',
    branch: 'CSE(AI&ML)',
    year: '2nd Year',
    password: '',
    status: 'Active' as 'Active' | 'Inactive'
  });
  const [showCoordPassword, setShowCoordPassword] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'info' | 'error' } | null>(null);

  // Supabase Database Cloud Configuration State
  const [supabaseConfig, setSupabaseConfig] = useState(() => {
    const creds = getSupabaseCredentials();
    return { url: creds.url, key: creds.key };
  });
  const [isSupabaseTesting, setIsSupabaseTesting] = useState(false);
  const [supabaseTestDetails, setSupabaseTestDetails] = useState<{
    connected: boolean;
    tables: Record<string, { exists: boolean; error?: string }>;
    error?: string;
  } | null>(null);

  // Close Admin Profile menu on outside click (matching coordinator page logic)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    if (showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfileMenu]);

  // Dynamic available branches for Coordinator modal (Only the 7 approved branches)
  const modalAvailableBranches = useMemo(() => {
    if (coordForm.year === '1st Year') {
      return ['ABCD Group', 'EFGH Group'];
    }
    return [
      'CSE(AI&ML)',
      'Petroleum Engineering',
      'Chemical Engineering',
      'Civil Engineering',
      'Mechanical Engineering',
      'Electrical Engineering',
      'Electronics & Communication Engineering',
    ];
  }, [coordForm.year]);

  // Helper for Floating Toast Notifications
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 2800);
  };

  // Google Drive Cloud Storage Settings State
  const [gdriveConfig, setGdriveConfig] = useState<GoogleDriveConfig>({
    webhookUrl: '',
    folderId: '',
    enabled: false
  });
  const [isGdriveTesting, setIsGdriveTesting] = useState(false);
  const [gdriveTestResult, setGdriveTestResult] = useState<{ success: boolean; message: string; fileUrl?: string } | null>(null);
  const [showScriptCode, setShowScriptCode] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  // Load Google Drive Config strictly after authenticated Admin verification via server API
  useEffect(() => {
    if (!isLoggedIn || typeof window === 'undefined') return;
    const cfg = getGoogleDriveConfig();
    if (cfg.webhookUrl) {
      setGdriveConfig(cfg);
      return;
    }

    const creds = getSupabaseCredentials();
    const headers: Record<string, string> = {};
    if (creds.url && creds.key) {
      headers['x-supabase-url'] = creds.url;
      headers['x-supabase-key'] = creds.key;
    }

    fetch('/api/admin/config', { cache: 'no-store', headers })
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data.webhookUrl) {
          const cloudCfg = {
            webhookUrl: data.webhookUrl,
            folderId: data.folderId || '',
            enabled: true,
          };
          setGdriveConfig(cloudCfg);
          saveGoogleDriveConfig(cloudCfg);
        }
      })
      .catch(() => {});
  }, [isLoggedIn]);

  // Save Google Drive Config via authenticated server /api/admin/config
  const handleSaveGoogleDriveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    saveGoogleDriveConfig(gdriveConfig);

    try {
      const creds = getSupabaseCredentials();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (creds.url && creds.key) {
        headers['x-supabase-url'] = creds.url;
        headers['x-supabase-key'] = creds.key;
      }
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          webhookUrl: gdriveConfig.webhookUrl.trim(),
          folderId: gdriveConfig.folderId.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        showToast(`⚠️ ${data?.error || 'Saved locally, but server sync failed.'}`, 'error');
        return;
      }
    } catch (err) {
      console.warn('Could not sync drive config to server:', err);
    }

    showToast('Google Drive configuration saved & synced to all coordinators!', 'success');
  };

  // Test Supabase Connection & Table Availability
  const handleTestSupabaseConnection = async () => {
    setIsSupabaseTesting(true);
    setSupabaseTestDetails(null);
    try {
      const headers: Record<string, string> = {};
      if (supabaseConfig.url.trim() && supabaseConfig.key.trim()) {
        headers['x-supabase-url'] = supabaseConfig.url.trim();
        headers['x-supabase-key'] = supabaseConfig.key.trim();
      }
      const res = await fetch('/api/status', { headers });
      const data = await res.json();
      setSupabaseTestDetails({
        connected: Boolean(data.connected),
        tables: data.tables || {},
        error: data.error || undefined
      });
      setSupabaseHealth({
        checked: true,
        connected: Boolean(data.connected),
        error: data.error || null
      });
      if (data.connected) {
        showToast('✅ Supabase database is connected & all tables verified!', 'success');
      } else {
        showToast(`⚠️ Supabase: ${data.error || 'Connection failed'}`, 'error');
      }
    } catch (err: any) {
      showToast('⚠️ Could not run Supabase connection check.', 'error');
    } finally {
      setIsSupabaseTesting(false);
    }
  };

  // Save Supabase Credentials
  const handleSaveSupabaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseConfig.url.trim() || !supabaseConfig.key.trim()) {
      showToast('Please enter both Supabase URL and Anon Key.', 'error');
      return;
    }
    saveSupabaseCredentials(supabaseConfig.url, supabaseConfig.key);
    showToast('Supabase database credentials saved locally!', 'success');
    handleTestSupabaseConnection();
  };

  // Copy SQL to create coordinators table
  const handleCopyCoordinatorsSql = () => {
    const sql = `-- Run this in Supabase Dashboard -> SQL Editor -> New Query -> Run\ncreate table if not exists public.coordinators (\n  id text primary key,\n  name text not null,\n  branch text not null,\n  year text not null,\n  password text not null default '',\n  initials text default '',\n  status text not null default 'Active',\n  created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);\n\nalter table public.coordinators add column if not exists password text not null default '';\nalter table public.coordinators add column if not exists initials text default '';\nalter table public.coordinators add column if not exists status text not null default 'Active';\n\nalter table public.coordinators enable row level security;\n\ndrop policy if exists "Allow all for coordinators" on public.coordinators;\ndrop policy if exists "Allow select for coordinators" on public.coordinators;\ndrop policy if exists "Allow insert for coordinators" on public.coordinators;\ndrop policy if exists "Allow update for coordinators" on public.coordinators;\ndrop policy if exists "Allow delete for coordinators" on public.coordinators;\ncreate policy "Allow all for coordinators" on public.coordinators for all using (true) with check (true);\n\ngrant all on public.coordinators to anon, authenticated, service_role;`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(sql);
      showToast('📋 SQL for "coordinators" table copied to clipboard!', 'success');
    }
  };

  // Test Google Drive Upload
  const handleTestGoogleDriveUpload = async () => {
    if (!gdriveConfig.webhookUrl) {
      showToast('Please enter your Google Apps Script Web App URL first.', 'error');
      return;
    }
    setIsGdriveTesting(true);
    setGdriveTestResult(null);

    try {
      const testContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\nxref\n0 4\ntrailer\n<< /Root 1 0 R >>\n%%EOF';
      const testFile = new File([testContent], `test_drive_connection_${Date.now()}.pdf`, { type: 'application/pdf' });
      
      const res = await uploadPdfToGoogleDrive(testFile, gdriveConfig.folderId);
      if (res.success && res.fileUrl) {
        setGdriveTestResult({
          success: true,
          message: 'Connection verified! Test PDF successfully uploaded to your Google Drive.',
          fileUrl: res.fileUrl
        });
        showToast('Google Drive connected & verified successfully!', 'success');
      } else {
        setGdriveTestResult({
          success: false,
          message: res.error || 'Upload failed. Check if Web App access is set to "Anyone" and script is authorized.'
        });
        showToast('Google Drive connection failed.', 'error');
      }
    } catch (err: any) {
      setGdriveTestResult({
        success: false,
        message: err?.message || 'Error communicating with Google Drive Web App'
      });
      showToast('Error testing Google Drive connection.', 'error');
    } finally {
      setIsGdriveTesting(false);
    }
  };

  // Copy Google Apps Script code to clipboard
  const handleCopyScriptCode = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
    setCopiedScript(true);
    showToast('Google Apps Script code copied to clipboard!', 'success');
    setTimeout(() => setCopiedScript(false), 3000);
  };

  // 1. Available branches dynamically computed based on selected Year (7 approved branches)
  const availableBranches = useMemo(() => {
    if (yearFilter === '1st Year') {
      return ['ABCD Group', 'EFGH Group', 'Common (All Branches)'];
    }
    return [
      'CSE(AI&ML)',
      'Petroleum Engineering',
      'Chemical Engineering',
      'Civil Engineering',
      'Mechanical Engineering',
      'Electrical Engineering',
      'Electronics & Communication Engineering',
    ];
  }, [yearFilter]);

  // 2. Available semesters dynamically computed based on selected Year
  const availableSemesters = useMemo(() => {
    if (yearFilter === '1st Year') return ['Semester 1', 'Semester 2'];
    if (yearFilter === '2nd Year') return ['Semester 3', 'Semester 4'];
    if (yearFilter === '3rd Year') return ['Semester 5', 'Semester 6'];
    if (yearFilter === '4th Year') return ['Semester 7', 'Semester 8'];
    return [];
  }, [yearFilter]);

  // 3. Available subjects dynamically computed based on Year + Branch + Semester
  const availableSubjects = useMemo(() => {
    if (semesterFilter === 'All') return [];
    
    const subjectSet = new Set<string>();

    // Try to get canonical subjects from notes data
    if (yearFilter !== 'All' && branchFilter !== 'All') {
      try {
        const subs = getSubjectsFor(
          yearFilter as any,
          branchFilter as any,
          semesterFilter as any
        );
        if (subs && subs.length > 0) {
          subs.forEach(s => subjectSet.add(s.title));
        }
      } catch {
        // fallback
      }
    }

    // Add subjects from materials matching current filters
    materials.forEach(m => {
      const matchYear = yearFilter === 'All' || m.year.replace(' Year', '') === yearFilter.replace(' Year', '');
      const matchBranch = branchFilter === 'All' || m.branch === branchFilter;
      const matchSem = !m.semester || m.semester === semesterFilter;
      if (matchYear && matchBranch && matchSem && m.subject) {
        subjectSet.add(m.subject);
      }
    });

    return Array.from(subjectSet);
  }, [yearFilter, branchFilter, semesterFilter, materials]);

  // Filtered Materials computation: Sirf tabhi documents show honge jab user ne upar se filter lgaya ho ya search kiya ho
  const isFilterActive = yearFilter !== 'All' || searchQuery.trim().length > 0 || showAllUnfiltered;

  const filteredMaterials = useMemo(() => {
    // Agar upar koi filter nahi lagaya hai aur search bhi nahi hai, to niche documents na dikhaye
    if (!isFilterActive) {
      return [];
    }

    return materials.filter((m) => {
      if (typeFilter !== 'All' && m.type !== typeFilter) return false;
      
      // Year filter (handles '3rd', '3rd Year')
      if (yearFilter !== 'All') {
        const yNorm = yearFilter.replace(' Year', '').trim();
        const mNorm = m.year.replace(' Year', '').trim();
        if (yNorm !== mNorm) return false;
      }

      // Branch filter
      if (branchFilter !== 'All') {
        const bNorm = branchFilter.toLowerCase();
        const mBNorm = m.branch.toLowerCase();
        if (bNorm !== mBNorm && !bNorm.includes(mBNorm) && !mBNorm.includes(bNorm)) {
          return false;
        }
      }

      // Semester filter
      if (semesterFilter !== 'All') {
        if (m.semester && m.semester !== semesterFilter) {
          return false;
        }
      }

      // Subject filter
      if (subjectFilter !== 'All') {
        const sNorm = subjectFilter.toLowerCase();
        const mSubNorm = m.subject.toLowerCase();
        if (!mSubNorm.includes(sNorm) && !sNorm.includes(mSubNorm)) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchFile = m.fileName.toLowerCase().includes(q);
        const matchSubject = m.subject.toLowerCase().includes(q);
        const matchUploader = m.uploadedBy.toLowerCase().includes(q);
        if (!matchFile && !matchSubject && !matchUploader) return false;
      }

      return true;
    });
  }, [materials, isFilterActive, typeFilter, yearFilter, branchFilter, semesterFilter, subjectFilter, searchQuery, showAllUnfiltered]);

  // Edit Note Name Handlers
  const handleOpenEditMaterial = (m: AdminMaterial) => {
    setEditingMaterial(m);
    setEditMaterialName(m.fileName);
  };

  const handleSaveMaterialEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;
    if (!editMaterialName.trim()) {
      showToast('Note name cannot be empty', 'error');
      return;
    }
    const newName = editMaterialName.trim();
    const targetId = editingMaterial.id;
    const targetType = editingMaterial.type;

    setMaterials(prev => prev.map(m => {
      if (m.id === targetId) {
        return {
          ...m,
          fileName: newName
        };
      }
      return m;
    }));

    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('notehub_custom_documents');
        if (raw) {
          const docs: NoteDocument[] = JSON.parse(raw);
          const cleanTitle = newName.replace(/\.pdf$/i, '');
          const updated = docs.map(d => d.id === targetId ? { ...d, title: cleanTitle } : d);
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
        body: JSON.stringify({
          id: targetId,
          title: newName.replace(/\.pdf$/i, ''),
          type: targetType === 'PYQs' ? 'PYQ' : 'Notes',
        }),
      });
    } catch {}

    showToast(`Note name updated to "${newName}"`, 'success');
    setEditingMaterial(null);
  };

  // =========================================================================
  // ADMIN SUBJECT MANAGEMENT HELPERS & HANDLERS
  // =========================================================================
  const subjAvailableBranches = useMemo<BranchOption[]>(() => {
    return subjYear === '1st Year' ? FIRST_YEAR_GROUPS : STANDARD_BRANCHES;
  }, [subjYear]);

  const subjAvailableSemesters = useMemo<SemesterOption[]>(() => {
    return YEAR_SEMESTER_MAP[subjYear] || ['Semester 3', 'Semester 4'];
  }, [subjYear]);

  const currentAdminSubjects = useMemo<SubjectMeta[]>(() => {
    return getSubjectsFor(subjYear, subjBranch, subjSemester);
  }, [subjYear, subjBranch, subjSemester, adminSubjectsVersion]);

  // Sync subjects from Supabase whenever selected Year/Branch/Semester changes in Add Subject view
  useEffect(() => {
    if (activeNav === 'Add Subject' && isSupabaseConfigured()) {
      fetchSubjectsFromSupabase(subjYear, subjBranch, subjSemester).then((cloudSubjs) => {
        if (cloudSubjs) {
          saveSubjectsFor(subjYear, subjBranch, subjSemester, cloudSubjs);
          setAdminSubjectsVersion((v) => v + 1);
        }
      }).catch(() => {});
    }
  }, [activeNav, subjYear, subjBranch, subjSemester]);

  const handleAdminAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = newAdminSubjectTitle.trim();
    if (!cleanTitle) {
      showToast('Please enter Subject Name.', 'error');
      return;
    }

    const alphaPrefix = cleanTitle.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'SUB';
    const cleanCode = newAdminSubjectCode.trim() || `${alphaPrefix}101`;
    const newSubj: SubjectMeta = {
      title: cleanTitle,
      code: cleanCode,
      unitSnippets: [
        `${cleanTitle} Unit 1 fundamental concepts, definitions, and theory.`,
        `${cleanTitle} Unit 2 analytical models, problem solving, and derivations.`,
        `${cleanTitle} Unit 3 practical implementations, architectures, and applications.`
      ],
      pyqSnippets: [
        `Explain the core theoretical concepts and applications of ${cleanTitle}.`,
        `Solve university numerical / analytical problem based on ${cleanTitle}.`
      ]
    };

    const added = addSubjectFor(subjYear, subjBranch, subjSemester, newSubj);
    if (!added) {
      showToast(`Subject "${cleanTitle}" already exists in ${subjBranch} (${subjSemester}).`, 'error');
      return;
    }

    if (isSupabaseConfigured()) {
      await insertSubjectToSupabase(subjYear, subjBranch, subjSemester, newSubj);
    }

    setNewAdminSubjectTitle('');
    setNewAdminSubjectCode('');
    setAdminSubjectsVersion((v) => v + 1);
    showToast(`✅ Subject "${cleanTitle}" added for ${subjYear} • ${subjBranch} (${subjSemester})!`, 'success');
  };

  const handleAdminSaveSubjectEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdminSubject) return;
    const newTitle = editAdminSubjTitle.trim();
    const newCode = editAdminSubjCode.trim() || editingAdminSubject.code;
    if (!newTitle) {
      showToast('Subject Name cannot be empty.', 'error');
      return;
    }

    const oldTitle = editingAdminSubject.title;
    updateSubjectFor(subjYear, subjBranch, subjSemester, oldTitle, {
      title: newTitle,
      code: newCode
    });

    if (isSupabaseConfigured()) {
      await updateSubjectInSupabase(subjYear, subjBranch, subjSemester, oldTitle, newTitle, newCode);
    }

    // Update materials list state in memory if subject was renamed
    if (oldTitle !== newTitle) {
      setMaterials((prev) =>
        prev.map((m) =>
          m.year === subjYear && m.branch === subjBranch && m.semester === subjSemester && m.subject === oldTitle
            ? { ...m, subject: newTitle }
            : m
        )
      );
    }

    setEditingAdminSubject(null);
    setAdminSubjectsVersion((v) => v + 1);
    showToast(`✅ Subject updated to "${newTitle}" in Supabase & Coordinator portals!`, 'success');
  };

  const handleAdminDeleteSubject = (title: string) => {
    setDeleteConfirm({
      title: 'Delete Subject',
      message: `Are you sure you want to delete "${title}" from ${subjBranch} (${subjSemester})?`,
      onConfirm: async () => {
        deleteSubjectFor(subjYear, subjBranch, subjSemester, title);
        if (isSupabaseConfigured()) {
          await deleteSubjectFromSupabase(subjYear, subjBranch, subjSemester, title);
        }
        setAdminSubjectsVersion((v) => v + 1);
        showToast(`Subject "${title}" deleted.`, 'success');
      }
    });
  };

  // Available Branches for Admin Upload (Dynamically updates based on Year - 7 branches)
  const uploadBranches = useMemo<BranchOption[]>(() => {
    if (!uploadYear) return [];
    if (uploadYear === '1st Year') {
      return ['ABCD Group', 'EFGH Group'] as BranchOption[];
    }
    return [
      'CSE(AI&ML)',
      'Petroleum Engineering',
      'Chemical Engineering',
      'Civil Engineering',
      'Mechanical Engineering',
      'Electrical Engineering',
      'Electronics & Communication Engineering',
    ] as BranchOption[];
  }, [uploadYear]);

  // Available Semesters for Admin Upload
  const uploadSemesters = useMemo<SemesterOption[]>(() => {
    if (!uploadYear) return [];
    return YEAR_SEMESTER_MAP[uploadYear] || [];
  }, [uploadYear]);

  // Available Subjects for Admin Upload (strictly coordinator-added or real custom subjects)
  const uploadSubjects = useMemo<string[]>(() => {
    if (!uploadYear || !uploadBranch || !uploadSemester) return [];
    try {
      const subs = getSubjectsFor(uploadYear, uploadBranch, uploadSemester);
      if (subs && subs.length > 0) {
        return subs.map(s => s.title);
      }
    } catch {
      // Ignore
    }
    return [];
  }, [uploadYear, uploadBranch, uploadSemester, adminSubjectsVersion]);

  // Change Year: reset downstream fields without auto-filling
  const handleUploadYearChange = (newYear: YearOption | '') => {
    setUploadYear(newYear);
    setUploadBranch('');
    setUploadSemester('');
    setUploadSubject('');
  };

  const handleUploadBranchChange = (newBranch: BranchOption | '') => {
    setUploadBranch(newBranch);
    setUploadSemester('');
    setUploadSubject('');
  };

  const handleUploadSemesterChange = (newSem: SemesterOption | '') => {
    setUploadSemester(newSem);
    setUploadSubject('');
  };

  const handleUploadFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        showToast('Please upload a valid .pdf file', 'error');
        return;
      }
      setSelectedUploadFile(file);
      if (!uploadDisplayTitle.trim()) {
        setUploadDisplayTitle(file.name.replace(/\.pdf$/i, ''));
      }
    }
  };

  const handleAdminUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadYear) {
      showToast('Please select Year.', 'error');
      return;
    }
    if (!uploadBranch) {
      showToast('Please select Branch.', 'error');
      return;
    }
    if (!uploadSemester) {
      showToast('Please select Semester.', 'error');
      return;
    }
    if (!uploadSubject) {
      showToast('Please select Subject.', 'error');
      return;
    }
    if (!uploadType) {
      showToast('Please select Material Type.', 'error');
      return;
    }

    const cleanTitle = uploadDisplayTitle.trim();
    if (!cleanTitle) {
      showToast(uploadType === 'Lectures' ? 'Please enter the Lecture Title.' : 'Please enter the Display Title for the document.', 'error');
      return;
    }

    const finalSubject = uploadSubject;

    // SPECIAL CASE: LECTURES
    if (uploadType === 'Lectures') {
      if (!uploadLectureLink.trim()) {
        showToast('Please paste the video / lecture link URL.', 'error');
        return;
      }

      setIsUploadingMaterial(true);
      try {
        const docId = `lec-admin-${Date.now()}`;
        const newLec = {
          id: docId,
          title: cleanTitle,
          subject: finalSubject,
          semester: uploadSemester,
          link: uploadLectureLink.trim(),
          date: new Date().toISOString().split('T')[0]
        };

        if (isSupabaseConfigured()) {
          await insertLectureToSupabase(newLec, uploadYear, uploadBranch);
        }

        // Save to localStorage so student lecture view sees it
        if (typeof window !== 'undefined') {
          const raw = localStorage.getItem('notehub_custom_lectures');
          const existing = raw ? JSON.parse(raw) : [];
          localStorage.setItem('notehub_custom_lectures', JSON.stringify([newLec, ...existing]));
        }

        // Add to Admin materials list
        const newAdminMat: AdminMaterial = {
          id: docId,
          fileName: cleanTitle,
          year: uploadYear,
          branch: uploadBranch,
          semester: uploadSemester,
          subject: finalSubject,
          type: 'Lectures',
          uploadedBy: 'Admin',
          link: uploadLectureLink.trim()
        };

        setMaterials(prev => [newAdminMat, ...prev]);
        showToast(`Lecture "${cleanTitle}" published successfully!`, 'success');

        setUploadDisplayTitle('');
        setUploadLectureLink('');
      } catch (err) {
        console.error(err);
        showToast('Error publishing lecture. Please try again.', 'error');
      } finally {
        setIsUploadingMaterial(false);
      }
      return;
    }

    // REGULAR CASE: NOTES OR PYQS
    const finalOwner = uploadOwnerName.trim() || 'Pushpendra Gora';
    const finalFileName = cleanTitle.toLowerCase().endsWith('.pdf') ? cleanTitle : `${cleanTitle}.pdf`;
    const finalType: 'Notes' | 'PYQ' = uploadType === 'PYQ' ? 'PYQ' : 'Notes';
    const calculatedSize = selectedUploadFile ? formatFileSize(selectedUploadFile.size) : '';
    const realPageCount = selectedUploadFile ? await extractPdfPageCount(selectedUploadFile) : 0;

    setIsUploadingMaterial(true);

    try {
      let uploadedFileUrl: string | undefined = undefined;
      let uploadedFilePath: string | undefined = undefined;

      // 1. Upload PDF exclusively to Google Drive (Supabase bucket disabled)
      if (selectedUploadFile) {
        showToast('Uploading PDF directly to Google Drive...', 'info');
        const uploadResult = await uploadUnifiedPdf(selectedUploadFile, undefined, {
          title: cleanTitle,
          year: uploadYear,
          branch: uploadBranch,
          semester: uploadSemester
        });
        if (uploadResult && uploadResult.publicUrl) {
          uploadedFileUrl = uploadResult.publicUrl;
          uploadedFilePath = uploadResult.filePath;
          showToast('Saved to Google Drive! Public shareable link stored in database.', 'success');
        } else {
          setIsUploadingMaterial(false);
          const errDetail = lastGoogleDriveError || 'Google Drive Web App URL is not set or upload failed.';
          showToast(`⚠️ Google Drive upload failed: ${errDetail}`, 'error');
          alert(`Google Drive Upload Error:\n${errDetail}\n\nPlease check your Google Apps Script Web App URL in Statistics or set GOOGLE_DRIVE_WEBHOOK_URL on Vercel.`);
          return;
        }
      }

      // 2. Save note doc for student portal search
      const docId = `doc-admin-${Date.now()}`;
      const noteDoc: NoteDocument = {
        id: docId,
        title: cleanTitle,
        subject: finalSubject,
        code: finalSubject.slice(0, 4).toUpperCase().replace(/[^A-Z]/g, '') + '101',
        year: uploadYear,
        branch: uploadBranch,
        semester: uploadSemester,
        type: finalType,
        pages: realPageCount,
        size: calculatedSize,
        owner: finalOwner,
        file_url: uploadedFileUrl,
        file_path: uploadedFilePath,
        preview: [
          `Uploaded by: ${finalOwner}`,
          `Verified academic resource for ${finalSubject} (${uploadSemester}) in ${uploadBranch} (${uploadYear}).`,
          uploadedFileUrl ? 'Official verified PDF hosted on Google Drive.' : 'Academic curriculum resource ready for viewing and download.'
        ]
      };

      // Save document to Supabase via server API & client fallback
      try {
        const creds = getSupabaseCredentials();
        const docHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (creds.url && creds.key) {
          docHeaders['x-supabase-url'] = creds.url;
          docHeaders['x-supabase-key'] = creds.key;
        }
        const docRes = await fetch('/api/documents', {
          method: 'POST',
          headers: docHeaders,
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
      saveCustomUploadedDocument(noteDoc);

      // 3. Add to materials table state in Admin portal
      const newAdminMat: AdminMaterial = {
        id: docId,
        fileName: finalFileName,
        year: uploadYear,
        branch: uploadBranch,
        semester: uploadSemester,
        subject: finalSubject,
        type: finalType === 'PYQ' ? 'PYQs' : 'Notes',
        uploadedBy: finalOwner,
        file_url: uploadedFileUrl,
        file_path: uploadedFilePath
      };

      setMaterials(prev => [newAdminMat, ...prev]);

      showToast(`Material "${cleanTitle}" uploaded successfully for ${uploadYear}!`, 'success');

      // Reset form
      setUploadDisplayTitle('');
      setUploadOwnerName('');
      setSelectedUploadFile(null);
      if (uploadFileInputRef.current) {
        uploadFileInputRef.current.value = '';
      }
    } catch (err) {
      console.error(err);
      showToast('Error uploading document. Please try again.', 'error');
    } finally {
      setIsUploadingMaterial(false);
    }
  };

  // Checkbox helpers
  const isAllSelected = filteredMaterials.length > 0 && filteredMaterials.every(m => selectedMaterialIds.includes(m.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedMaterialIds([]);
    } else {
      setSelectedMaterialIds(filteredMaterials.map(m => m.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedMaterialIds.includes(id)) {
      setSelectedMaterialIds(selectedMaterialIds.filter(item => item !== id));
    } else {
      setSelectedMaterialIds([...selectedMaterialIds, id]);
    }
  };

  // Action Handlers (Opens validated HTTP/HTTPS/Drive PDF / external link with noopener,noreferrer)
  const handleDownloadSingle = (m: AdminMaterial) => {
    if (m.file_url) {
      if (!openSafeExternalUrl(m.file_url)) {
        showToast(`Blocked unsafe attachment URL for "${m.fileName}".`, 'error');
        return;
      }
      showToast(`Opening official PDF for "${m.fileName}"...`, 'success');
      return;
    }
    if (m.link) {
      if (!openSafeExternalUrl(m.link)) {
        showToast(`Blocked unsafe lecture URL for "${m.fileName}".`, 'error');
        return;
      }
      showToast(`Opening lecture link for "${m.fileName}"...`, 'success');
      return;
    }
    showToast(`No file attachment available for "${m.fileName}".`, 'error');
  };

  const handleDeleteSingle = (id: string, fileName: string) => {
    setDeleteConfirm({
      title: 'Delete Material',
      message: `Are you sure you want to delete "${fileName}" from database and Google Drive?`,
      onConfirm: async () => {
        const target = materials.find(m => m.id === id);
        setMaterials(prev => prev.filter(m => m.id !== id));
        setSelectedMaterialIds(prev => prev.filter(item => item !== id));

        if (target?.type === 'Lectures') {
          if (typeof window !== 'undefined') {
            try {
              const raw = localStorage.getItem('notehub_custom_lectures');
              if (raw) {
                const lecs = JSON.parse(raw);
                localStorage.setItem('notehub_custom_lectures', JSON.stringify(lecs.filter((l: any) => l.id !== id)));
              }
            } catch {}
          }
          if (isSupabaseConfigured()) {
            await deleteLectureFromSupabase(id);
          }
          showToast(`"${fileName}" deleted from database!`, 'success');
          return;
        }

        deleteCustomUploadedDocument(id);
        const docType = target?.type === 'PYQs' ? 'PYQ' : 'Notes';
        const res = await deleteDocumentEverywhere({
          id,
          type: target?.type,
          fileUrl: target?.file_url,
          supabaseCreds: getSupabaseCredentials(),
          supabaseFallback: () =>
            isSupabaseConfigured()
              ? deleteDocumentFromSupabase(id, undefined, docType)
              : Promise.resolve(false),
        });

        if (res.driveDeleted) {
          showToast(`"${fileName}" deleted from Database & Google Drive!`, 'success');
        } else if (res.driveNeedsScriptUpdate) {
          showToast(`"${fileName}" deleted from DB. Re-deploy Google Apps Script (Manage deployments -> New version) for Drive delete.`, 'info');
        } else if (res.driveAttempted && res.driveError) {
          showToast(`"${fileName}" deleted from DB, Drive error: ${res.driveError}`, 'error');
        } else {
          showToast(`"${fileName}" deleted from database!`, 'success');
        }
      }
    });
  };

  const handleBulkDownload = () => {
    if (selectedMaterialIds.length === 0) {
      showToast('Please select at least one file to download.', 'error');
      return;
    }
    const targets = materials.filter(m => selectedMaterialIds.includes(m.id));
    const downloadable = targets.filter(m => m.file_url || m.link);
    if (downloadable.length === 0) {
      showToast('None of the selected files have downloadable attachments.', 'error');
      return;
    }
    let openedCount = 0;
    downloadable.forEach((m) => {
      const url = m.file_url || m.link;
      if (url && openSafeExternalUrl(url)) {
        openedCount += 1;
      }
    });
    showToast(`Opened ${openedCount} selected file(s).`, openedCount > 0 ? 'success' : 'error');
  };

  const handleBulkDelete = () => {
    if (selectedMaterialIds.length === 0) {
      showToast('Please select at least one file to delete.', 'error');
      return;
    }
    const count = selectedMaterialIds.length;
    setDeleteConfirm({
      title: `Delete ${count} Files`,
      message: `Are you sure you want to delete ${count} selected files from the database?`,
      onConfirm: async () => {
        const targets = materials.filter(m => selectedMaterialIds.includes(m.id));
        const targetIds = new Set(targets.map(t => t.id));
        setMaterials(prev => prev.filter(m => !targetIds.has(m.id)));
        setSelectedMaterialIds([]);

        targets.forEach(t => {
          if (t.type !== 'Lectures') deleteCustomUploadedDocument(t.id);
        });
        if (typeof window !== 'undefined' && targets.some(t => t.type === 'Lectures')) {
          try {
            const raw = localStorage.getItem('notehub_custom_lectures');
            if (raw) {
              const lecs = JSON.parse(raw);
              localStorage.setItem('notehub_custom_lectures', JSON.stringify(lecs.filter((l: any) => !targetIds.has(l.id))));
            }
          } catch {}
        }

        const creds = getSupabaseCredentials();
        const results = await Promise.all(
          targets.map(async (t) => {
            if (t.type === 'Lectures') {
              if (isSupabaseConfigured()) await deleteLectureFromSupabase(t.id);
              return { driveDeleted: false, driveNeedsScriptUpdate: false };
            }
            const docType = t.type === 'PYQs' ? 'PYQ' : 'Notes';
            return deleteDocumentEverywhere({
              id: t.id,
              type: t.type,
              fileUrl: t.file_url,
              supabaseCreds: creds,
              supabaseFallback: () =>
                isSupabaseConfigured()
                  ? deleteDocumentFromSupabase(t.id, undefined, docType)
                  : Promise.resolve(false),
            });
          })
        );

        const driveDeletedCount = results.filter((r) => r.driveDeleted).length;
        const needsScriptUpdate = results.some((r) => r.driveNeedsScriptUpdate);

        if (driveDeletedCount > 0) {
          showToast(`${count} files deleted from Database & ${driveDeletedCount} from Google Drive!`, 'success');
        } else if (needsScriptUpdate) {
          showToast(`${count} files deleted from DB. Re-deploy Google Apps Script (Statistics) for Drive delete.`, 'info');
        } else {
          showToast(`${count} files deleted from database!`, 'success');
        }
      }
    });
  };

  const handleSaveCoordinator = async (e: React.FormEvent) => {
    e.preventDefault();
    setCoordModalError(null);

    if (!coordForm.name.trim()) {
      setCoordModalError('Please enter Coordinator Full Name.');
      showToast('Please enter Coordinator Full Name.', 'error');
      return;
    }
    if (!editingCoord && !coordForm.password.trim()) {
      setCoordModalError('Please set a Login Password for this coordinator.');
      showToast('Please set a Login Password for this coordinator.', 'error');
      return;
    }

    // Check if another coordinator already exists for the same Year & Branch
    const duplicateCoord = coordinators.find((c) => {
      if (editingCoord && c.id === editingCoord.id) return false;
      return c.year === coordForm.year && isBranchMatch(c.branch, coordForm.branch);
    });

    if (duplicateCoord) {
      const msg = `Coordinator "${duplicateCoord.name}" is already registered for ${coordForm.year} • ${coordForm.branch}! Only 1 coordinator is allowed per Year & Branch.`;
      setCoordModalError(msg);
      showToast(`⚠️ ${msg}`, 'error');
      return;
    }

    const cleanName = coordForm.name.trim();
    const cleanPassword = coordForm.password.trim();
    const initials = cleanName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'CO';

    setIsSavingCoord(true);

    const creds = getSupabaseCredentials();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (creds.url && creds.key) {
      headers['x-supabase-url'] = creds.url;
      headers['x-supabase-key'] = creds.key;
    }

    try {
      if (editingCoord) {
        const updatedItem: CoordinatorItem = {
          ...editingCoord,
          name: cleanName,
          branch: coordForm.branch,
          year: coordForm.year,
          ...(cleanPassword ? { password: cleanPassword } : {}),
          status: coordForm.status,
          initials
        };

        const putPayload: Record<string, any> = {
          id: editingCoord.id,
          name: cleanName,
          branch: coordForm.branch,
          year: coordForm.year,
          status: coordForm.status,
          initials,
        };
        if (cleanPassword) {
          putPayload.password = cleanPassword;
        }

        let saved = false;
        let lastError = '';

        try {
          const res = await fetch('/api/coordinators', {
            method: 'PUT',
            headers,
            body: JSON.stringify(putPayload),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            saved = true;
          } else {
            lastError = data.error || 'Failed to update coordinator on server.';
          }
        } catch (err: any) {
          lastError = err?.message || 'Server request failed.';
        }

        if (!saved) {
          const errorMsg = lastError || 'Could not sync coordinator update to Supabase cloud. Please verify your Admin session and Supabase connection.';
          setCoordModalError(errorMsg);
          showToast(`⚠️ Supabase Error: ${errorMsg}`, 'error');
          setIsSavingCoord(false);
          return;
        }

        const updatedList = coordinators.map(c => c.id === editingCoord.id ? updatedItem : c);
        setCoordinators(updatedList);
        saveStoredCoordinators(updatedList);

        showToast(`Coordinator "${cleanName}" & password updated in Supabase!`, 'success');
      } else {
        const newCoord: CoordinatorItem = {
          id: `coord-${Date.now()}`,
          name: cleanName,
          branch: coordForm.branch,
          year: coordForm.year,
          password: cleanPassword,
          status: coordForm.status,
          initials
        };

        let saved = false;
        let lastError = '';

        try {
          const res = await fetch('/api/coordinators', {
            method: 'POST',
            headers,
            body: JSON.stringify(newCoord),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            saved = true;
          } else {
            lastError = data.error || 'Failed to save coordinator on server.';
          }
        } catch (err: any) {
          lastError = err?.message || 'Server request failed.';
        }

        if (!saved) {
          const errorMsg = lastError || 'Could not save coordinator to Supabase cloud. Please verify your Admin session and Supabase connection.';
          setCoordModalError(errorMsg);
          showToast(`⚠️ Supabase Error: ${errorMsg}`, 'error');
          setIsSavingCoord(false);
          return;
        }

        const updatedList = [newCoord, ...coordinators];
        setCoordinators(updatedList);
        saveStoredCoordinators(updatedList);

        showToast(`Coordinator "${cleanName}" saved directly to Supabase cloud!`, 'success');
      }

      setIsAddCoordOpen(false);
      setEditingCoord(null);
      setCoordModalError(null);
      setCoordForm({
        name: '',
        branch: 'CSE(AI&ML)',
        year: '2nd Year',
        password: '',
        status: 'Active'
      });
    } catch (err: any) {
      setCoordModalError(err?.message || 'An unexpected error occurred.');
      showToast('⚠️ Error saving coordinator.', 'error');
    } finally {
      setIsSavingCoord(false);
    }
  };

  const handleDeleteCoordinator = (id: string, name: string) => {
    setDeleteConfirm({
      title: 'Delete Coordinator',
      message: `Are you sure you want to remove coordinator "${name}"? They will no longer be able to log in.`,
      onConfirm: async () => {
        const creds = getSupabaseCredentials();
        const headers: Record<string, string> = {};
        if (creds.url && creds.key) {
          headers['x-supabase-url'] = creds.url;
          headers['x-supabase-key'] = creds.key;
        }

        try {
          const res = await fetch(`/api/coordinators?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers,
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            showToast(`⚠️ ${data?.error || 'Failed to delete coordinator from server.'}`, 'error');
            return;
          }
        } catch {
          showToast('⚠️ Network error while removing coordinator.', 'error');
          return;
        }

        const updatedList = coordinators.filter(c => c.id !== id);
        setCoordinators(updatedList);
        saveStoredCoordinators(updatedList);
        showToast(`Coordinator "${name}" removed from Supabase.`, 'success');
      }
    });
  };

  // Handle Login Submit (Securely verified via server-side /api/admin/auth)
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminId.trim() || !password.trim()) {
      setLoginError('Please enter both Admin ID and Password.');
      return;
    }

    setIsSubmitting(true);
    setLoginError('');

    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'login',
          id: adminId.trim(),
          password: password.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setIsSubmitting(false);
        setLoginError(data.error || 'Invalid Admin ID or Password.');
        return;
      }

      setIsSubmitting(false);
      setIsLoggedIn(true);
      if (data.adminId) {
        setStoredAdminId(data.adminId);
        if (typeof window !== 'undefined') {
          localStorage.setItem('notehub_admin_id', data.adminId);
        }
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setLoginError(err?.message || 'Failed to connect to authentication service.');
    }
  };

  // Handle Admin Logout (Clears secure server session cookie and resets in-memory admin data)
  const handleAdminLogout = async () => {
    try {
      await fetch('/api/admin/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'logout' }),
      });
    } catch {}
    setIsLoggedIn(false);
    setMaterials([]);
    setAdminIssues([]);
    setCoordinators([]);
  };

  if (!authChecked) {
    return (
      <div className="h-[100dvh] w-full bg-[#f3effb] flex items-center justify-center text-slate-600 text-sm font-semibold">
        Verifying admin session...
      </div>
    );
  }

  // Handle Admin Password Change Submit (Processed securely on server without client password storage)
  const handleAdminPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeError('');

    if (!changePasswordForm.currentPassword.trim()) {
      setPasswordChangeError('Please enter your current password.');
      return;
    }

    if (changePasswordForm.newPassword.length < 4) {
      setPasswordChangeError('New password must be at least 4 characters long.');
      return;
    }

    if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
      setPasswordChangeError('New password and confirm password do not match.');
      return;
    }

    const cleanNewPass = changePasswordForm.newPassword.trim();
    const cleanCurrentPass = changePasswordForm.currentPassword.trim();
    setIsUpdatingPassword(true);

    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'change-password',
          currentPassword: cleanCurrentPass,
          newPassword: cleanNewPass,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setPasswordChangeError(data.error || 'Failed to update password.');
        return;
      }

      setIsChangePasswordOpen(false);
      setChangePasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showToast('🔐 Admin password updated in cloud database successfully!', 'success');
    } catch (err: any) {
      console.error('Error changing admin password:', err);
      setPasswordChangeError(err?.message || 'Failed to update password in database.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // =========================================================================
  // VIEW 1: ADMIN LOGIN SCREEN ("sabse pahle login screen jisme id or password ho")
  // =========================================================================
  if (!isLoggedIn) {
    return (
      <div className="h-[100dvh] max-h-[100dvh] w-full bg-[#f3effb] relative flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto overflow-x-hidden selection:bg-purple-200">
        
        {/* Ambient Background Glows */}
        <div className="absolute top-[-100px] left-[-100px] w-96 h-96 bg-[#e8dcfa]/70 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] bg-[#dfd4f6]/60 rounded-full blur-3xl pointer-events-none" />



        {/* Login Box */}
        <div className="bg-white rounded-3xl border border-slate-100/90 shadow-[0_12px_40px_rgba(79,70,229,0.08)] max-w-md w-full p-6 sm:p-8 space-y-6 relative z-10 animate-in fade-in zoom-in-95 duration-200">
          
          {/* Brand Header */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 flex items-center justify-center mx-auto">
              <img 
                src="/logo.png?v=2" 
                alt="NoteBase Logo" 
                className="w-full h-full object-contain"
              />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Note<span className="text-indigo-600">Base</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Administrator Management Sign In
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            
            {/* Admin ID */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Admin ID / Username <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Enter Admin ID"
                  value={adminId}
                  onChange={(e) => setAdminId(e.target.value)}
                  className="w-full h-12 px-4 bg-slate-50/60 border border-slate-200/90 rounded-2xl text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all shadow-sm"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 pl-4 pr-11 bg-slate-50/60 border border-slate-200/90 rounded-2xl text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors"
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {loginError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 rounded-2xl bg-[#3b49df] hover:bg-[#323fc0] active:scale-[0.99] text-white text-sm font-bold shadow-md shadow-indigo-200/50 hover:shadow-lg transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing in...</span>
                </div>
              ) : (
                <>
                  <span>Sign In as Admin</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

        </div>

      </div>
    );
  }

  // =========================================================================
  // VIEW 2: ADMIN DASHBOARD (Matches User's Provided Image)
  // "login ke baas esa dasbhaord ho aabhi esa bna do phir aabhi kuch bhi clcikable na ho"
  // =========================================================================
  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full bg-[#f8fafc] text-slate-800 flex flex-col md:flex-row antialiased selection:bg-purple-100 overflow-hidden">
      
      {/* MOBILE COMPACT TOP BAR (Minimized Sidebar Header on Mobile) */}
      <div className="md:hidden bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between shrink-0 z-30 shadow-xs">
        <Link href="/" className="flex items-center space-x-2.5">
          <img src="/logo.png?v=2" alt="NoteBase Logo" className="w-8 h-8 object-contain" />
          <span className="text-lg font-black text-slate-900 tracking-tight">
            Note<span className="text-indigo-600">Base</span>
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

      {/* -------------------------------------------------------------------
          LEFT SIDEBAR (Collapsible Drawer on Mobile, Static Sidebar on Desktop)
         ------------------------------------------------------------------- */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 md:w-64 md:static bg-white border-r border-slate-100/90 flex flex-col justify-between shrink-0 p-5 md:py-6 md:px-5 space-y-6 shadow-xl md:shadow-none overflow-y-auto transition-transform duration-200 ease-out ${
        isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        
        {/* Top: Brand Logo + Mobile Minimize Button */}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="w-10 h-10 flex items-center justify-center transition-transform group-hover:scale-105">
                <img 
                  src="/logo.png?v=2" 
                  alt="NoteBase Logo" 
                  className="w-10 h-10 object-contain" 
                />
              </div>
              <span className="text-xl font-black text-slate-900 tracking-tight">
                Note<span className="text-indigo-600">Base</span>
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

          {/* Navigation Menu Links */}
          <nav className="space-y-1.5 text-xs font-semibold">
            
            {/* 1. Dashboard */}
            <button
              type="button"
              onClick={() => selectAdminNav('Dashboard')}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-2xl transition-all cursor-pointer text-left ${
                activeNav === 'Dashboard'
                  ? 'bg-[#3b49df] text-white font-bold shadow-md shadow-indigo-100'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Home className="w-4 h-4 stroke-[2.2]" />
              <span>Dashboard</span>
            </button>

            {/* 2. Coordinators */}
            <button
              type="button"
              onClick={() => selectAdminNav('Coordinators')}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-2xl transition-all cursor-pointer text-left ${
                activeNav === 'Coordinators'
                  ? 'bg-[#3b49df] text-white font-bold shadow-md shadow-indigo-100'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Coordinators</span>
            </button>

            {/* 2B. Coordinator Issues */}
            <button
              type="button"
              onClick={() => selectAdminNav('Issues')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all cursor-pointer text-left ${
                activeNav === 'Issues'
                  ? 'bg-[#3b49df] text-white font-bold shadow-md shadow-indigo-100'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center space-x-3.5">
                <MessageSquareWarning className="w-4 h-4" />
                <span>Coordinator Issues</span>
              </span>
              {adminIssues.filter((i) => i.status === 'Open').length > 0 && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  activeNav === 'Issues'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {adminIssues.filter((i) => i.status === 'Open').length}
                </span>
              )}
            </button>

            {/* 3. All Materials */}
            <button
              type="button"
              onClick={() => selectAdminNav('All Materials')}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-2xl transition-all cursor-pointer text-left ${
                activeNav === 'All Materials'
                  ? 'bg-[#3b49df] text-white font-bold shadow-md shadow-indigo-100'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>All Materials</span>
            </button>

            {/* 4. Upload Material */}
            <button
              type="button"
              onClick={() => selectAdminNav('Upload Material')}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-2xl transition-all cursor-pointer text-left ${
                activeNav === 'Upload Material'
                  ? 'bg-[#3b49df] text-white font-bold shadow-md shadow-indigo-100'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload Material</span>
            </button>

            {/* 5. Add Subject */}
            <button
              type="button"
              onClick={() => selectAdminNav('Add Subject')}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-2xl transition-all cursor-pointer text-left ${
                activeNav === 'Add Subject'
                  ? 'bg-[#3b49df] text-white font-bold shadow-md shadow-indigo-100'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Add Subject</span>
            </button>

            {/* 5. Manage by Year */}
            <button
              type="button"
              onClick={() => selectAdminNav('Manage by Year')}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-2xl transition-all cursor-pointer text-left ${
                activeNav === 'Manage by Year'
                  ? 'bg-[#3b49df] text-white font-bold shadow-md shadow-indigo-100'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Manage by Year</span>
            </button>

            {/* 6. Manage by Branch */}
            <button
              type="button"
              onClick={() => selectAdminNav('Manage by Branch')}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-2xl transition-all cursor-pointer text-left ${
                activeNav === 'Manage by Branch'
                  ? 'bg-[#3b49df] text-white font-bold shadow-md shadow-indigo-100'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <GitBranch className="w-4 h-4" />
              <span>Manage by Branch</span>
            </button>

            {/* 7. Statistics */}
            <button
              type="button"
              onClick={() => selectAdminNav('Statistics')}
              className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-2xl transition-all cursor-pointer text-left ${
                activeNav === 'Statistics'
                  ? 'bg-[#3b49df] text-white font-bold shadow-md shadow-indigo-100'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Statistics</span>
            </button>

          </nav>
        </div>

        {/* Bottom Sidebar: Admin Profile & Sign Out (Matching Coordinator Page Logic) */}
        <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
          <button 
            type="button"
            onClick={() => {
              setShowProfileMenu(!showProfileMenu);
              setIsMobileSidebarOpen(false);
            }}
            className="flex items-center space-x-3 text-left hover:opacity-80 transition-opacity cursor-pointer flex-1"
          >
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="overflow-hidden">
              <div className="text-sm font-bold text-slate-900 truncate max-w-[130px]">
                Administrator
              </div>
              <div className="text-xs text-indigo-600 font-medium truncate max-w-[120px]">
                Super Admin
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleAdminLogout}
            title="Sign out of Admin Dashboard"
            className="w-9 h-9 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

      </aside>

      {/* -------------------------------------------------------------------
          MAIN DASHBOARD BODY
         ------------------------------------------------------------------- */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full overflow-y-auto">
        
        {/* Top Header Bar */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100 shrink-0">
              <Crown className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {activeNav === 'Dashboard' && 'Admin Dashboard'}
                {activeNav === 'All Materials' && 'All Materials'}
                {activeNav === 'Coordinators' && 'Coordinators Management'}
                {activeNav === 'Issues' && 'Coordinator Issues'}
                {activeNav === 'Upload Material' && 'Upload Material'}
                {activeNav === 'Statistics' && 'Cloud Storage & Statistics'}
                {activeNav === 'Manage by Year' && 'Manage by Academic Year'}
                {activeNav === 'Manage by Branch' && 'Manage by Branch & Group'}
                {activeNav === 'Add Subject' && 'Subjects Curriculum Management'}
                {activeNav !== 'Dashboard' && activeNav !== 'All Materials' && activeNav !== 'Coordinators' && activeNav !== 'Issues' && activeNav !== 'Upload Material' && activeNav !== 'Statistics' && activeNav !== 'Manage by Year' && activeNav !== 'Manage by Branch' && activeNav !== 'Add Subject' && activeNav}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                {activeNav === 'Dashboard' && 'Manage Coordinators, Notes, PYQs and All Years'}
                {activeNav === 'All Materials' && 'View, search, filter and manage all uploaded academic materials'}
                {activeNav === 'Coordinators' && 'Manage student and faculty coordinators across branches and years'}
                {activeNav === 'Issues' && 'Review, solve, reply to, and permanently delete issues reported by coordinators'}
                {activeNav === 'Upload Material' && 'Publish Notes, PYQs, and Video Lectures to any Year & Branch'}
                {activeNav === 'Statistics' && 'Google Drive storage integration, Supabase database sync & platform metrics'}
                {activeNav === 'Manage by Year' && 'Year-wise breakdown of subjects, coordinators, notes, PYQs, and lectures'}
                {activeNav === 'Manage by Branch' && 'Branch & group-wise breakdown across academic years, subjects, and materials'}
                {activeNav === 'Add Subject' && 'Add, rename, or remove subjects across years, branches, and semesters'}
                {activeNav !== 'Dashboard' && activeNav !== 'All Materials' && activeNav !== 'Coordinators' && activeNav !== 'Issues' && activeNav !== 'Upload Material' && activeNav !== 'Statistics' && activeNav !== 'Manage by Year' && activeNav !== 'Manage by Branch' && activeNav !== 'Add Subject' && 'Manage your portal preferences and configuration'}
              </p>
            </div>
          </div>

          {/* Right Header Icons */}
          <div className="flex items-center space-x-3 self-end sm:self-auto relative">
            {/* Profile Avatar & Dropdown (Matching Coordinator Page Logic) */}
            <div ref={profileMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                title="Administrator Account"
                className="w-10 h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 flex items-center justify-center text-slate-700 hover:text-slate-900 transition-colors shadow-sm cursor-pointer"
              >
                <User className="w-4 h-4 text-slate-600" />
              </button>

              {/* Profile Menu Dropdown */}
              {showProfileMenu && (
                <div className="absolute right-0 mt-3 w-64 bg-white rounded-3xl shadow-2xl border border-slate-100 p-4 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-3">
                  <div className="border-b border-slate-100 pb-3">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">System Role</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">Administrator</p>
                    <p className="text-xs text-indigo-600 font-medium">Super Admin Privileges</p>
                  </div>
                  <div className="space-y-1 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setPasswordChangeError('');
                        setChangePasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                        setShowCurrentPassword(false);
                        setShowNewPassword(false);
                        setIsChangePasswordOpen(true);
                      }}
                      className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer text-left"
                    >
                      <Key className="w-3.5 h-3.5 text-slate-500" />
                      <span>Change Password</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAdminLogout}
                      className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-red-600 hover:bg-red-50 transition-colors cursor-pointer text-left font-bold border-t border-slate-100 mt-1"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* =================================================================
            VIEW 1: DASHBOARD (Top 4 KPI cards + Coordinators & Overview, NO All Materials table)
           ================================================================= */}
        {activeNav === 'Dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* 1. TOP STAT KPI CARDS (4 Clickable Cards Row) */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Card 1: Total Notes */}
              <button
                type="button"
                onClick={() => {
                  setActiveNav('All Materials');
                  setTypeFilter('Notes');
                }}
                className="bg-white hover:border-indigo-200 hover:shadow-md transition-all rounded-3xl border border-slate-100/90 p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] flex items-center justify-between text-left cursor-pointer group"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-purple-50 group-hover:bg-purple-100 text-purple-600 flex items-center justify-center shrink-0 transition-colors">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Total Notes</p>
                    <div className="flex items-baseline space-x-2 mt-0.5">
                      <span className="text-2xl font-black text-slate-900">
                        {materials.filter(m => m.type === 'Notes').length}
                      </span>
                    </div>
                  </div>
                </div>
              </button>

              {/* Card 2: PYQs */}
              <button
                type="button"
                onClick={() => {
                  setActiveNav('All Materials');
                  setTypeFilter('PYQs');
                }}
                className="bg-white hover:border-blue-200 hover:shadow-md transition-all rounded-3xl border border-slate-100/90 p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] flex items-center justify-between text-left cursor-pointer group"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 group-hover:bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 transition-colors">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">PYQs</p>
                    <div className="flex items-baseline space-x-2 mt-0.5">
                      <span className="text-2xl font-black text-slate-900">
                        {materials.filter(m => m.type === 'PYQs').length}
                      </span>
                    </div>
                  </div>
                </div>
              </button>

              {/* Card 3: Coordinators */}
              <button
                type="button"
                onClick={() => setActiveNav('Coordinators')}
                className="bg-white hover:border-purple-200 hover:shadow-md transition-all rounded-3xl border border-slate-100/90 p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] flex items-center justify-between text-left cursor-pointer group"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-purple-50 group-hover:bg-purple-100 text-purple-600 flex items-center justify-center shrink-0 transition-colors">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Coordinators</p>
                    <p className="text-2xl font-black text-slate-900 mt-0.5">{coordinators.length}</p>
                  </div>
                </div>
              </button>

              {/* Card 4: Total Files & Storage Progress */}
              <button
                type="button"
                onClick={() => {
                  setActiveNav('All Materials');
                  setTypeFilter('All');
                }}
                className="bg-white hover:border-emerald-200 hover:shadow-md transition-all rounded-3xl border border-slate-100/90 p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] flex items-center justify-between text-left cursor-pointer group"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 group-hover:bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 transition-colors">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Total Files</p>
                    <p className="text-2xl font-black text-slate-900 mt-0.5">{materials.length}</p>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Cloud</p>
                  <p className="text-xs font-bold text-slate-800">Google Drive</p>
                  <span className="inline-block text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                </div>
              </button>

            </section>

            {/* Supabase Disconnected Alert Banner if tables or credentials have an issue */}
            {supabaseHealth.checked && !supabaseHealth.connected && (
              <div className="p-4 bg-red-50/90 border border-red-200 rounded-3xl flex items-start space-x-3 text-xs text-red-800 animate-in fade-in duration-150">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-red-900">
                    Supabase Database is NOT Connected or Tables are Missing
                  </p>
                  <p className="text-red-700">
                    {supabaseHealth.error || 'Please check environment variables (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY).'}
                  </p>
                  <p className="text-[11px] text-red-600 font-medium">
                    1. If you just set variables on Vercel, remember to click <strong>Deployments &gt; Redeploy</strong> on Vercel.<br />
                    2. In Supabase Dashboard, open <strong>SQL Editor</strong> and run <code>supabase-schema.sql</code> to create all required tables.
                  </p>
                </div>
              </div>
            )}

            {/* Dashboard Main Content (Full Width Academic Overview) */}
            <div className="w-full bg-white rounded-3xl border border-slate-100/90 p-6 sm:p-8 shadow-[0_2px_14px_rgba(0,0,0,0.02)] space-y-6">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-5">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900">
                      Academic Overview
                    </h2>
                    <p className="text-xs text-slate-400">Resource distribution across academic branches and years</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveNav('All Materials')}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-2xl bg-[#3b49df] hover:bg-[#323fc0] text-white text-xs font-bold shadow-sm shadow-indigo-100 transition-all cursor-pointer"
                >
                  <span>Open All Materials</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quick Stats Cards Grid (Separate cards for 1st Year, 2nd Year, 3rd Year, 4th Year) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1st Year Card */}
                <div 
                  onClick={() => {
                    setActiveNav('All Materials');
                    setYearFilter('1st Year');
                  }}
                  className="p-5 rounded-2xl bg-purple-50/60 border border-purple-100/80 hover:bg-purple-50 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-purple-700 font-bold uppercase tracking-wider">1st Year</p>
                    <span className="text-[10px] font-semibold text-purple-600 bg-purple-100/80 px-2 py-0.5 rounded-full">Groups</span>
                  </div>
                  <p className="text-2xl font-black text-slate-900 mt-2">
                    {materials.filter(m => m.year?.includes('1st')).length} Files
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Foundation courses & group syllabus</p>
                </div>

                {/* 2nd Year Card */}
                <div 
                  onClick={() => {
                    setActiveNav('All Materials');
                    setYearFilter('2nd Year');
                  }}
                  className="p-5 rounded-2xl bg-blue-50/60 border border-blue-100/80 hover:bg-blue-50 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-blue-700 font-bold uppercase tracking-wider">2nd Year</p>
                    <span className="text-[10px] font-semibold text-blue-600 bg-blue-100/80 px-2 py-0.5 rounded-full">Sem 3 & 4</span>
                  </div>
                  <p className="text-2xl font-black text-slate-900 mt-2">
                    {materials.filter(m => m.year?.includes('2nd')).length} Files
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Core departmental foundation & labs</p>
                </div>

                {/* 3rd Year Card */}
                <div 
                  onClick={() => {
                    setActiveNav('All Materials');
                    setYearFilter('3rd Year');
                  }}
                  className="p-5 rounded-2xl bg-indigo-50/60 border border-indigo-100/80 hover:bg-indigo-50 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-indigo-700 font-bold uppercase tracking-wider">3rd Year</p>
                    <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-100/80 px-2 py-0.5 rounded-full">Sem 5 & 6</span>
                  </div>
                  <p className="text-2xl font-black text-slate-900 mt-2">
                    {materials.filter(m => m.year?.includes('3rd')).length} Files
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Most actively accessed uploads</p>
                </div>

                {/* 4th Year Card */}
                <div 
                  onClick={() => {
                    setActiveNav('All Materials');
                    setYearFilter('4th Year');
                  }}
                  className="p-5 rounded-2xl bg-emerald-50/60 border border-emerald-100/80 hover:bg-emerald-50 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-emerald-700 font-bold uppercase tracking-wider">4th Year</p>
                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded-full">Sem 7 & 8</span>
                  </div>
                  <p className="text-2xl font-black text-slate-900 mt-2">
                    {materials.filter(m => m.year?.includes('4th')).length} Files
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Advanced electives & semester projects</p>
                </div>
              </div>

              {/* Cloud & Supabase Sync Status */}
              <div className="p-5 rounded-2xl bg-slate-50/80 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-white border border-slate-200/80 text-indigo-600 flex items-center justify-center shadow-sm shrink-0">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-slate-800">Supabase Cloud Database</p>
                    <p className="text-xs text-slate-500">Live PostgreSQL database records sync (PDF files stored exclusively in Google Drive)</p>
                  </div>
                </div>
                <span className="self-start sm:self-auto px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                  Online & Active
                </span>
              </div>

            </div>
          </div>
        )}

        {/* =================================================================
            VIEW 2: ALL MATERIALS VIEW ("jab side me jo all matrialwala option hai uspe click kare tab aaye esa")
           ================================================================= */}
        {activeNav === 'All Materials' && (
          <div className="w-full bg-white rounded-3xl border border-slate-100/90 p-6 sm:p-8 shadow-[0_2px_14px_rgba(0,0,0,0.02)] space-y-6 animate-in fade-in duration-200">
            
            {/* Header: Title + Segmented Tabs (All | Notes | PYQs) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 text-indigo-600 flex items-center justify-center shadow-sm">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                    All Materials
                  </h2>
                  <p className="text-xs text-slate-400">Manage, review, download and delete uploaded materials</p>
                </div>
              </div>

              {/* Segmented Filter Pills */}
              <div className="flex items-center space-x-1.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setTypeFilter('All')}
                  className={`px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
                    typeFilter === 'All'
                      ? 'bg-[#3b49df] text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('Notes')}
                  className={`inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                    typeFilter === 'Notes'
                      ? 'bg-[#3b49df] text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <FileText className={`w-3.5 h-3.5 ${typeFilter === 'Notes' ? 'text-white' : 'text-slate-400'}`} />
                  <span>Notes</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('PYQs')}
                  className={`inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                    typeFilter === 'PYQs'
                      ? 'bg-[#3b49df] text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <FileCheck className={`w-3.5 h-3.5 ${typeFilter === 'PYQs' ? 'text-white' : 'text-slate-400'}`} />
                  <span>PYQs</span>
                </button>
              </div>
            </div>

            {/* Sequential Filter Chain: Year -> Branch -> Semester -> Subject */}
            <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Step-by-Step Filter:
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    Year <span className="text-indigo-400">→</span> Branch <span className="text-indigo-400">→</span> Semester <span className="text-indigo-400">→</span> Subject
                  </span>
                </div>
                {(yearFilter !== 'All' || branchFilter !== 'All' || semesterFilter !== 'All' || subjectFilter !== 'All' || showAllUnfiltered) && (
                  <button
                    type="button"
                    onClick={() => {
                      setYearFilter('All');
                      setBranchFilter('All');
                      setSemesterFilter('All');
                      setSubjectFilter('All');
                      setShowAllUnfiltered(false);
                    }}
                    className="inline-flex items-center space-x-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Filter Chain</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Year Filter */}
                <div className="relative">
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    1. Select Year
                  </label>
                  <div className="relative">
                    <select
                      value={yearFilter}
                      onChange={(e) => {
                        setYearFilter(e.target.value);
                        setBranchFilter('All');
                        setSemesterFilter('All');
                        setSubjectFilter('All');
                      }}
                      className="w-full h-11 px-3.5 pr-9 bg-white border border-slate-200/90 rounded-xl text-xs font-semibold text-slate-700 shadow-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      <option value="All">All Years</option>
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* 2. Branch Filter */}
                <div className="relative">
                  <label className={`block text-[10px] font-bold uppercase tracking-wide mb-1 ${yearFilter === 'All' ? 'text-slate-300' : 'text-slate-500'}`}>
                    2. Select Branch
                  </label>
                  <div className="relative">
                    <select
                      disabled={yearFilter === 'All'}
                      value={branchFilter}
                      onChange={(e) => {
                        setBranchFilter(e.target.value);
                        setSemesterFilter('All');
                        setSubjectFilter('All');
                      }}
                      className={`w-full h-11 px-3.5 pr-9 border rounded-xl text-xs font-semibold shadow-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                        yearFilter === 'All' 
                          ? 'bg-slate-100/70 border-slate-200/60 text-slate-400 cursor-not-allowed opacity-60' 
                          : 'bg-white border-slate-200/90 text-slate-700 cursor-pointer'
                      }`}
                    >
                      <option value="All">
                        {yearFilter === 'All' ? 'Select Year First' : 'All Branches'}
                      </option>
                      {availableBranches.map((br) => (
                        <option key={br} value={br}>{br}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* 3. Semester Filter */}
                <div className="relative">
                  <label className={`block text-[10px] font-bold uppercase tracking-wide mb-1 ${branchFilter === 'All' ? 'text-slate-300' : 'text-slate-500'}`}>
                    3. Select Semester
                  </label>
                  <div className="relative">
                    <select
                      disabled={branchFilter === 'All'}
                      value={semesterFilter}
                      onChange={(e) => {
                        setSemesterFilter(e.target.value);
                        setSubjectFilter('All');
                      }}
                      className={`w-full h-11 px-3.5 pr-9 border rounded-xl text-xs font-semibold shadow-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                        branchFilter === 'All' 
                          ? 'bg-slate-100/70 border-slate-200/60 text-slate-400 cursor-not-allowed opacity-60' 
                          : 'bg-white border-slate-200/90 text-slate-700 cursor-pointer'
                      }`}
                    >
                      <option value="All">
                        {branchFilter === 'All' ? 'Select Branch First' : 'All Semesters'}
                      </option>
                      {availableSemesters.map((sem) => (
                        <option key={sem} value={sem}>{sem}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* 4. Subject Filter */}
                <div className="relative">
                  <label className={`block text-[10px] font-bold uppercase tracking-wide mb-1 ${semesterFilter === 'All' ? 'text-slate-300' : 'text-slate-500'}`}>
                    4. Select Subject
                  </label>
                  <div className="relative">
                    <select
                      disabled={semesterFilter === 'All'}
                      value={subjectFilter}
                      onChange={(e) => setSubjectFilter(e.target.value)}
                      className={`w-full h-11 px-3.5 pr-9 border rounded-xl text-xs font-semibold shadow-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                        semesterFilter === 'All' 
                          ? 'bg-slate-100/70 border-slate-200/60 text-slate-400 cursor-not-allowed opacity-60' 
                          : 'bg-white border-slate-200/90 text-slate-700 cursor-pointer'
                      }`}
                    >
                      <option value="All">
                        {semesterFilter === 'All' ? 'Select Semester First' : 'All Subjects'}
                      </option>
                      {availableSubjects.map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* Search Input Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by file name, subject, or coordinator..."
                className="w-full h-11 pl-11 pr-10 bg-slate-50/70 border border-slate-200/80 rounded-2xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all shadow-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Materials Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-3 w-8">
                      <input 
                        type="checkbox" 
                        checked={isAllSelected}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-indigo-600 cursor-pointer w-4 h-4" 
                      />
                    </th>
                    <th className="py-3 px-3">File Name</th>
                    <th className="py-3 px-3">Year</th>
                    <th className="py-3 px-3">Branch</th>
                    <th className="py-3 px-3">Subject</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Uploaded By</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  
                  {/* Dynamic Materials */}
                  {filteredMaterials.map((m) => {
                    const isSelected = selectedMaterialIds.includes(m.id);
                    return (
                      <tr 
                        key={m.id} 
                        className={`hover:bg-slate-50/70 transition-colors ${isSelected ? 'bg-indigo-50/30' : ''}`}
                      >
                        <td className="py-3.5 px-3">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => toggleSelectOne(m.id)}
                            className="rounded border-slate-300 text-indigo-600 cursor-pointer w-4 h-4" 
                          />
                        </td>
                        <td className="py-3.5 px-3 font-semibold text-slate-800 flex items-center space-x-2.5">
                          <div className="w-7 h-7 rounded-lg bg-red-50 text-red-600 font-bold text-[9px] flex items-center justify-center shrink-0 border border-red-100">
                            PDF
                          </div>
                          <span className="truncate max-w-[200px]" title={m.fileName}>
                            {m.fileName}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-slate-700 whitespace-nowrap">
                          <span>{m.year}</span>
                          {m.semester && (
                            <span className="block text-[10px] text-slate-400 font-medium">{m.semester}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-slate-700 font-medium">{m.branch}</td>
                        <td className="py-3.5 px-3 font-semibold text-slate-800">{m.subject}</td>
                        <td className="py-3.5 px-3">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                            m.type === 'Notes' 
                              ? 'bg-blue-50 text-blue-700 border-blue-100' 
                              : 'bg-cyan-50 text-cyan-700 border-cyan-100'
                          }`}>
                            {m.type}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-slate-600">{m.uploadedBy}</td>
                        <td className="py-3.5 px-3 text-right">
                          <div className="inline-flex items-center space-x-1.5 text-slate-400">
                            <button
                              type="button"
                              onClick={() => setPreviewMaterial(m)}
                              title="Preview Document"
                              className="p-1 rounded-lg hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadSingle(m)}
                              title="Download File"
                              className="p-1 rounded-lg hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditMaterial(m)}
                              title="Edit Note Name & Details"
                              className="p-1 rounded-lg hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4 text-amber-500" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSingle(m.id, m.fileName)}
                              title="Delete File"
                              className="p-1 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredMaterials.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-14 text-center">
                        {!isFilterActive ? (
                          <div className="max-w-md mx-auto space-y-3">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-sm">
                              <Search className="w-6 h-6" />
                            </div>
                            <h4 className="text-sm font-bold text-slate-800">
                              Pehle Upar Se Filter Select Karein
                            </h4>
                            <p className="text-xs text-slate-500 leading-relaxed">
                              Upar <strong>Year → Branch → Semester → Subject</strong> select karein. Filter lagane ke baad hi unke matching notes & PYQs yahan dikhenge.
                            </p>
                            <div className="pt-1 flex items-center justify-center space-x-2">
                              <button
                                type="button"
                                onClick={() => setShowAllUnfiltered(true)}
                                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                              >
                                Ya sabhi {materials.length} uploaded files ek sath dekhein
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-slate-600">
                              Chune gaye filters ke liye koi material nahi mila.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setTypeFilter('All');
                                setYearFilter('All');
                                setBranchFilter('All');
                                setSemesterFilter('All');
                                setSubjectFilter('All');
                                setSearchQuery('');
                                setShowAllUnfiltered(false);
                              }}
                              className="text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
                            >
                              Reset filters
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Bottom Action Row */}
            {isFilterActive && filteredMaterials.length > 0 && (
              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate-600">
                <div className="flex items-center space-x-2">
                  <input 
                    type="checkbox" 
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-indigo-600 cursor-pointer w-4 h-4" 
                  />
                  <span>Select All</span>
                </div>
                <span className="text-slate-400">({selectedMaterialIds.length} selected)</span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleBulkDownload}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 active:scale-95 text-indigo-700 border border-indigo-200 transition-all cursor-pointer font-bold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 active:scale-95 text-red-600 border border-red-200 transition-all cursor-pointer font-bold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* =================================================================
            VIEW 3: COORDINATORS VIEW
           ================================================================= */}
        {activeNav === 'Coordinators' && (
          <div className="w-full bg-white rounded-3xl border border-slate-100/90 p-6 sm:p-8 shadow-[0_2px_14px_rgba(0,0,0,0.02)] space-y-6 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Coordinators Directory</h2>
                  <p className="text-xs text-slate-400">Total {coordinators.length} registered coordinators across departments</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingCoord(null);
                  setCoordForm({ 
                    name: '', 
                    branch: 'CSE(AI&ML)', 
                    year: '2nd Year',
                    password: '',
                    status: 'Active'
                  });
                  setCoordModalError(null);
                  setIsAddCoordOpen(true);
                }}
                className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-[#3b49df] hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Coordinator</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {coordinators.map((coord) => (
                <div key={coord.id} className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100/90 flex flex-col justify-between hover:bg-white hover:shadow-md transition-all space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-200 shadow-sm shrink-0">
                        {coord.initials}
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs font-bold text-slate-800 truncate" title={coord.name}>{coord.name}</p>
                        <p className="text-[11px] text-slate-500 truncate" title={`${coord.branch} • ${coord.year}`}>
                          {coord.branch} • {coord.year}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                      coord.status === 'Active' 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      {coord.status || 'Active'}
                    </span>
                  </div>

                  {/* Password & Credentials Box */}
                  <div className="pt-2 border-t border-slate-100/80 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1.5 bg-white/90 border border-slate-200/80 px-2.5 py-1 rounded-xl shadow-xs">
                      <Key className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span className="text-[10px] font-semibold text-slate-500">Password:</span>
                      <span className="font-mono font-bold text-slate-700 text-[11px] tracking-wide">
                        Protected (Encrypted)
                      </span>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCoord(coord);
                          setCoordForm({ 
                            name: coord.name, 
                            branch: coord.branch, 
                            year: coord.year,
                            password: '',
                            status: coord.status || 'Active'
                          });
                          setCoordModalError(null);
                          setIsAddCoordOpen(true);
                        }}
                        title="Edit Coordinator & Password"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCoordinator(coord.id, coord.name)}
                        title="Delete Coordinator"
                        className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =================================================================
            VIEW 4: UPLOAD MATERIAL VIEW (With Year & Branch Selection for Admin)
           ================================================================= */}
        {activeNav === 'Upload Material' && (
          <div className="w-full bg-white rounded-3xl border border-slate-100/90 p-6 sm:p-8 shadow-[0_2px_14px_rgba(0,0,0,0.02)] space-y-6 animate-in fade-in duration-200">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-5">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Upload New Material</h2>
                  <p className="text-xs text-slate-500">
                    Upload PDF documents for any Year & Branch across all engineering departments
                  </p>
                </div>
              </div>
              {uploadYear && uploadBranch ? (
                <span className="self-start sm:self-auto px-3.5 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100 shadow-sm">
                  {uploadYear} • {uploadBranch.split(' ')[0]}
                </span>
              ) : (
                <span className="self-start sm:self-auto px-3.5 py-1.5 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold">
                  New Document Upload
                </span>
              )}
            </div>

            {/* Upload Form */}
            <form onSubmit={handleAdminUploadSubmit} className="space-y-5 max-w-3xl">
              
              {/* Row 1: Year & Branch (Key fields requested by user) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Year <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={uploadYear}
                      onChange={(e) => handleUploadYearChange(e.target.value as YearOption | '')}
                      className="w-full h-11 px-3.5 pr-9 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 shadow-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">Select Year</option>
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Branch <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      disabled={!uploadYear}
                      value={uploadBranch}
                      onChange={(e) => handleUploadBranchChange(e.target.value as BranchOption | '')}
                      className={`w-full h-11 px-3.5 pr-9 border rounded-xl text-xs font-semibold shadow-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        !uploadYear 
                          ? 'bg-slate-100/70 border-slate-200/60 text-slate-400 cursor-not-allowed opacity-60' 
                          : 'bg-white border-slate-200 text-slate-800 cursor-pointer'
                      }`}
                    >
                      <option value="">{uploadYear ? 'Select Branch' : 'Select Year First'}</option>
                      {uploadBranches.map((br) => (
                        <option key={br} value={br}>{br}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Row 2: Semester & Subject */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Semester <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      disabled={!uploadBranch}
                      value={uploadSemester}
                      onChange={(e) => handleUploadSemesterChange(e.target.value as SemesterOption | '')}
                      className={`w-full h-11 px-3.5 pr-9 border rounded-xl text-xs font-semibold shadow-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        !uploadBranch 
                          ? 'bg-slate-100/70 border-slate-200/60 text-slate-400 cursor-not-allowed opacity-60' 
                          : 'bg-white border-slate-200 text-slate-800 cursor-pointer'
                      }`}
                    >
                      <option value="">{uploadBranch ? 'Select Semester' : 'Select Branch First'}</option>
                      {uploadSemesters.map((sem) => (
                        <option key={sem} value={sem}>{sem}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Subject <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      disabled={!uploadSemester}
                      value={uploadSubject}
                      onChange={(e) => setUploadSubject(e.target.value)}
                      className={`w-full h-11 px-3.5 pr-9 border rounded-xl text-xs font-semibold shadow-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        !uploadSemester 
                          ? 'bg-slate-100/70 border-slate-200/60 text-slate-400 cursor-not-allowed opacity-60' 
                          : 'bg-white border-slate-200 text-slate-800 cursor-pointer'
                      }`}
                    >
                      <option value="">{uploadSemester ? 'Select Subject' : 'Select Semester First'}</option>
                      {uploadSubjects.map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Row 3: Material Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Type <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value as 'Notes' | 'PYQ' | 'Lectures' | '')}
                    className="w-full h-11 px-3.5 pr-9 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 shadow-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">Select Type</option>
                    <option value="Notes">Notes</option>
                    <option value="PYQ">PYQs</option>
                    <option value="Lectures">Lectures</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Row 4: If Lectures -> Video Link; If Notes/PYQs -> PDF File Attachment Box */}
              {uploadType === 'Lectures' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Video Class Link (YouTube / Google Drive URL) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Paste direct public video link
                    </span>
                  </div>
                  <div className="relative">
                    <Video className="w-4 h-4 text-purple-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="url"
                      value={uploadLectureLink}
                      onChange={(e) => setUploadLectureLink(e.target.value)}
                      placeholder="e.g. https://www.youtube.com/watch?v=... or Google Drive URL"
                      className="w-full h-11 pl-10 pr-3.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    PDF File Attachment
                  </label>
                  <input
                    type="file"
                    accept=".pdf"
                    ref={uploadFileInputRef}
                    onChange={handleUploadFileChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => uploadFileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20 rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 group-hover:scale-105 flex items-center justify-center mx-auto mb-3 transition-transform shadow-sm">
                      <Upload className="w-5 h-5" />
                    </div>
                    {selectedUploadFile ? (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-emerald-700 flex items-center justify-center space-x-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>{selectedUploadFile.name}</span>
                        </p>
                        <p className="text-[11px] text-slate-400 font-semibold">
                          {(selectedUploadFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to Upload
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                          Click to Browse PDF File from Computer
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Accepts .pdf curriculum syllabus files
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Row 5: Display Title */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Display Title <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Users will see this exact name
                  </span>
                </div>
                <input
                  type="text"
                  value={uploadDisplayTitle}
                  onChange={(e) => setUploadDisplayTitle(e.target.value)}
                  placeholder={
                    uploadType === 'Lectures'
                      ? 'e.g. Lecture 01: Core Foundations & Unit 1'
                      : 'e.g. Unit 1 Complete Handwritten Notes'
                  }
                  className="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Row 6: Owner Name (Only for Notes & PYQs; hidden when Lectures is selected) */}
              {uploadType !== 'Lectures' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Faculty / Student Name
                    </span>
                  </div>
                  <input
                    type="text"
                    value={uploadOwnerName}
                    onChange={(e) => setUploadOwnerName(e.target.value)}
                    placeholder="e.g. Pushpendra Gora"
                    className="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              {/* Big Upload Button */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="submit"
                  disabled={isUploadingMaterial}
                  className="w-full sm:flex-1 h-12 rounded-2xl bg-[#3b49df] hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-60 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {uploadType === 'Lectures' ? (
                    <Video className="w-4 h-4" />
                  ) : (
                    <UploadCloud className="w-4 h-4" />
                  )}
                  <span>
                    {isUploadingMaterial 
                      ? (uploadType === 'Lectures' ? 'Publishing Lecture...' : 'Uploading to Supabase Storage...') 
                      : (uploadType === 'Lectures' ? 'Publish Video Lecture' : uploadType === 'PYQ' ? 'Upload PYQ Paper' : 'Upload Material')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveNav('All Materials')}
                  className="w-full sm:w-auto h-12 px-5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  View All Materials
                </button>
              </div>

            </form>
          </div>
        )}

        {/* =================================================================
            VIEW 5: STATISTICS & CLOUD STORAGE (Google Drive + Supabase Sync)
           ================================================================= */}
        {activeNav === 'Statistics' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            {/* Header & Status Bar */}
            <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border border-indigo-100/90 rounded-3xl p-6 sm:p-7 shadow-[0_2px_16px_rgba(79,70,229,0.04)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-2xl bg-white border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm shrink-0">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2.5">
                    <h2 className="text-lg font-black text-slate-900 tracking-tight">
                      Platform Storage & Analytics
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>Real-time Active</span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Live Supabase database synchronization & Google Drive public link distribution
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setGdriveConfig(getGoogleDriveConfig());
                    showToast('Statistics refreshed from Cloud Database!', 'info');
                  }}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Refresh Stats</span>
                </button>
              </div>
            </div>

            {/* TOP 4 STAT KPI CARDS */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Documents */}
              <div className="bg-white rounded-3xl border border-slate-100/90 p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] flex items-center justify-between">
                <div className="flex items-center space-x-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Total Documents</p>
                    <div className="flex items-baseline space-x-2 mt-0.5">
                      <span className="text-2xl font-black text-slate-900">
                        {materials.filter(m => m.type !== 'Lectures').length}
                      </span>
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        Notes & PYQs
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Total Lectures */}
              <div className="bg-white rounded-3xl border border-slate-100/90 p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] flex items-center justify-between">
                <div className="flex items-center space-x-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <Video className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Video Lectures</p>
                    <div className="flex items-baseline space-x-2 mt-0.5">
                      <span className="text-2xl font-black text-slate-900">
                        {materials.filter(m => m.type === 'Lectures').length}
                      </span>
                      <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                        Links
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Supabase Database Cloud */}
              <div className="bg-white rounded-3xl border border-slate-100/90 p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] flex items-center justify-between">
                <div className="flex items-center space-x-3.5">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    supabaseHealth.checked && !supabaseHealth.connected 
                      ? 'bg-red-50 text-red-600' 
                      : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Supabase Cloud</p>
                    <div className="flex items-baseline space-x-2 mt-0.5">
                      <span className={`text-base font-black ${
                        supabaseHealth.checked && !supabaseHealth.connected 
                          ? 'text-red-600' 
                          : 'text-emerald-700'
                      }`}>
                        {supabaseHealth.checked 
                          ? (supabaseHealth.connected ? 'Online (Cloud)' : 'Disconnected') 
                          : (isSupabaseConfigured() ? 'Online' : 'Checking...')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full ${
                  supabaseHealth.checked && !supabaseHealth.connected 
                    ? 'bg-red-500' 
                    : 'bg-emerald-500 animate-pulse'
                }`}></div>
              </div>

              {/* Google Drive Storage Status */}
              <div className="bg-white rounded-3xl border border-slate-100/90 p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] flex items-center justify-between">
                <div className="flex items-center space-x-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <Cloud className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Google Drive</p>
                    <div className="flex items-baseline space-x-2 mt-0.5">
                      <span className={`text-base font-black ${isGoogleDriveConfigured() ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {isGoogleDriveConfigured() ? 'Active & Synced' : 'Ready to Connect'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full ${isGoogleDriveConfigured() ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`}></div>
              </div>
            </section>

            {/* Supabase Disconnected Alert Banner if tables or credentials have an issue */}
            {supabaseHealth.checked && !supabaseHealth.connected && (
              <div className="p-4 bg-red-50/90 border border-red-200 rounded-3xl flex items-start space-x-3 text-xs text-red-800 animate-in fade-in duration-150">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-red-900">
                    Supabase Database is NOT Connected or Tables are Missing
                  </p>
                  <p className="text-red-700">
                    {supabaseHealth.error || 'Please check environment variables (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY).'}
                  </p>
                  <p className="text-[11px] text-red-600 font-medium">
                    1. If you just set variables on Vercel, remember to click <strong>Deployments &gt; Redeploy</strong> on Vercel.<br />
                    2. In Supabase Dashboard, open <strong>SQL Editor</strong> and run <code>supabase-schema.sql</code> to create all required tables.
                  </p>
                </div>
              </div>
            )}

            {/* =================================================================
                MAIN FEATURE: GOOGLE DRIVE CLOUD STORAGE CONFIGURATION
               ================================================================= */}
            <div className="bg-white rounded-3xl border border-slate-100/90 p-6 sm:p-7 shadow-[0_2px_14px_rgba(0,0,0,0.02)] space-y-6">
              
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-sm shrink-0">
                    <Cloud className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-bold text-slate-900">
                        Google Drive PDF Storage Integration
                      </h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isGoogleDriveConfigured()
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {isGoogleDriveConfigured() ? '● Active' : '○ Setup Required'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Jab bhi koi file upload karega, PDF aapke Google Drive me save hogi aur uska public shareable link Supabase database me store hoga.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowScriptCode(!showScriptCode)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer self-start sm:self-center shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{showScriptCode ? 'Hide Setup Script' : 'View / Copy Setup Script'}</span>
                </button>
              </div>

              {/* 60-Second Setup Instructions & Code Snippet Box */}
              {showScriptCode && (
                <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <p className="text-xs font-bold text-slate-200">
                        Google Apps Script (60-Second Setup)
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <a
                        href="https://script.google.com/home/start"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Open Google Apps Script</span>
                      </a>
                      <button
                        type="button"
                        onClick={handleCopyScriptCode}
                        className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedScript ? 'Copied!' : 'Copy Code'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Step by Step Guide */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs text-slate-300">
                    <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700">
                      <span className="font-bold text-indigo-400 block mb-0.5">Step 1</span>
                      Open Google Drive, click <strong>New → More → Google Apps Script</strong>.
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700">
                      <span className="font-bold text-indigo-400 block mb-0.5">Step 2</span>
                      Paste this script code into the editor replacing everything.
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700">
                      <span className="font-bold text-indigo-400 block mb-0.5">Step 3</span>
                      Click <strong>Deploy → New deployment → Web app</strong>.
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700">
                      <span className="font-bold text-indigo-400 block mb-0.5">Step 4</span>
                      Set <strong>Who has access: Anyone</strong>, deploy and paste Web App URL below!
                    </div>
                  </div>

                  {/* Code View */}
                  <div className="relative">
                    <pre className="p-3.5 rounded-xl bg-slate-950 text-emerald-400 text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed border border-slate-800">
                      {GOOGLE_APPS_SCRIPT_TEMPLATE}
                    </pre>
                  </div>
                </div>
              )}

              {/* Google Drive Configuration Form */}
              <form onSubmit={handleSaveGoogleDriveConfig} className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Web App URL */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span>Google Apps Script Web App URL <span className="text-red-500">*</span></span>
                      <span className="text-[10px] text-slate-400 font-normal">Exec URL</span>
                    </label>
                    <input
                      type="url"
                      required
                      value={gdriveConfig.webhookUrl}
                      onChange={(e) => setGdriveConfig({ ...gdriveConfig, webhookUrl: e.target.value })}
                      placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    />
                    <p className="text-[10px] text-slate-400">
                      Paste the Web App deployment URL generated from Google Apps Script.
                    </p>
                  </div>

                  {/* Target Folder ID (Optional) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span>Google Drive Folder ID (Optional)</span>
                      <span className="text-[10px] text-slate-400 font-normal">Leave blank for auto-folder</span>
                    </label>
                    <input
                      type="text"
                      value={gdriveConfig.folderId}
                      onChange={(e) => setGdriveConfig({ ...gdriveConfig, folderId: e.target.value })}
                      placeholder="e.g. 1a2B3c4D5e6F... or leave blank"
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    />
                    <p className="text-[10px] text-slate-400">
                      Defaults to auto-creating a dedicated folder named <strong>"College Notes App Uploads"</strong> in your Google Drive.
                    </p>
                  </div>
                </div>

                {/* Enable Toggle & Action Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100">
                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gdriveConfig.enabled}
                      onChange={(e) => setGdriveConfig({ ...gdriveConfig, enabled: e.target.checked })}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-700">
                      Enable Google Drive as primary PDF storage for all uploads
                    </span>
                  </label>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      disabled={isGdriveTesting}
                      onClick={handleTestGoogleDriveUpload}
                      className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isGdriveTesting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-500" />
                          <span>Testing Upload...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5 text-slate-500" />
                          <span>Test Google Drive Connection</span>
                        </>
                      )}
                    </button>

                    <button
                      type="submit"
                      className="inline-flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-[#3b49df] hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-100 transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Drive Settings</span>
                    </button>
                  </div>
                </div>
              </form>

              {/* Test Connection Output Alert */}
              {gdriveTestResult && (
                <div className={`p-4 rounded-2xl border text-xs font-medium space-y-1 animate-in fade-in duration-150 ${
                  gdriveTestResult.success
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}>
                  <div className="flex items-center space-x-2 font-bold">
                    {gdriveTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    )}
                    <span>{gdriveTestResult.message}</span>
                  </div>
                  {gdriveTestResult.fileUrl && (
                    <div className="pt-1">
                      <a
                        href={gdriveTestResult.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 text-indigo-700 font-bold hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>View uploaded test PDF file in Google Drive</span>
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* =================================================================
                SUPABASE CLOUD DATABASE & LIVE TABLES OVERVIEW
               ================================================================= */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Supabase Status Card */}
              <div className="bg-white rounded-3xl border border-slate-100/90 p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                      supabaseHealth.connected ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Supabase Cloud Database
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        PostgreSQL Database & Live Cloud Tables
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                    supabaseHealth.connected 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {supabaseHealth.connected ? 'Online (Connected)' : 'Attention Required'}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-500 font-medium">Supabase Host</span>
                    <span className="text-slate-800 font-bold font-mono text-[11px] truncate max-w-[200px]">
                      {getSupabaseCredentials().url || 'https://default.supabase.co'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-500 font-medium">Notes &amp; PYQs Tables</span>
                    <span className="text-indigo-600 font-bold font-mono">
                      notes ({materials.filter(m => m.type === 'Notes').length}) • pyqs ({materials.filter(m => m.type === 'PYQs').length})
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-500 font-medium">Coordinators Table</span>
                    <span className="text-indigo-600 font-bold font-mono">
                      coordinators ({coordinators.length} accounts)
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-500 font-medium">Lectures &amp; Subjects</span>
                    <span className="text-indigo-600 font-bold font-mono">
                      lectures ({materials.filter(m => m.type === 'Lectures').length}) • subjects active
                    </span>
                  </div>
                </div>

                {/* Direct Credentials & Testing Actions */}
                <div className="pt-2 border-t border-slate-100 space-y-3">
                  <form onSubmit={handleSaveSupabaseConfig} className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Supabase URL</label>
                        <input
                          type="text"
                          value={supabaseConfig.url}
                          onChange={(e) => setSupabaseConfig({ ...supabaseConfig, url: e.target.value })}
                          placeholder="https://xyz.supabase.co"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Anon Key</label>
                        <input
                          type="password"
                          value={supabaseConfig.key}
                          onChange={(e) => setSupabaseConfig({ ...supabaseConfig, key: e.target.value })}
                          placeholder="eyJhbGciOi..."
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={handleCopyCoordinatorsSql}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 cursor-pointer"
                        title="Copy SQL query to create coordinators table in Supabase"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy Coordinators SQL</span>
                      </button>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={handleTestSupabaseConnection}
                          disabled={isSupabaseTesting}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center space-x-1"
                        >
                          {isSupabaseTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          <span>Test Check</span>
                        </button>
                        <button
                          type="submit"
                          className="px-3.5 py-1.5 rounded-lg bg-[#3b49df] hover:bg-indigo-700 text-white text-xs font-bold transition-all cursor-pointer"
                        >
                          Save Credentials
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>

              {/* Resource Distribution by Year */}
              <div className="bg-white rounded-3xl border border-slate-100/90 p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Academic Resource Distribution
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Material breakdown across academic years
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                    All 4 Years
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  {[
                    { year: '1st Year', count: materials.filter(m => m.year.includes('1st')).length, color: 'bg-purple-500' },
                    { year: '2nd Year', count: materials.filter(m => m.year.includes('2nd')).length, color: 'bg-blue-500' },
                    { year: '3rd Year', count: materials.filter(m => m.year.includes('3rd')).length, color: 'bg-indigo-500' },
                    { year: '4th Year', count: materials.filter(m => m.year.includes('4th')).length, color: 'bg-emerald-500' }
                  ].map((row) => {
                    const total = materials.length;
                    const pct = total > 0 ? Math.min(100, Math.round((row.count / total) * 100)) : 0;
                    return (
                      <div key={row.year} className="space-y-1">
                        <div className="flex items-center justify-between font-semibold text-slate-700">
                          <span>{row.year}</span>
                          <span className="text-slate-500 font-mono text-[11px]">{row.count} files ({pct}%)</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-300 ${row.color}`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* BRANCH BREAKDOWN ROW */}
            <div className="bg-white rounded-3xl border border-slate-100/90 p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <GitBranch className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Branch-wise Resource Allocation
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Engineering branch syllabus &amp; document distribution
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveNav('All Materials')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  View All in Materials Table →
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
                {[
                  { name: 'CSE(AI&ML)', full: 'Computer Science (AI&ML)', count: materials.filter(m => m.branch.includes('CSE') || m.branch.includes('Computer')).length },
                  { name: 'Petroleum', full: 'Petroleum Engineering', count: materials.filter(m => m.branch.includes('Petroleum')).length },
                  { name: 'Chemical', full: 'Chemical Engineering', count: materials.filter(m => m.branch.includes('Chemical')).length },
                  { name: 'Civil', full: 'Civil Engineering', count: materials.filter(m => m.branch.includes('Civil')).length },
                  { name: 'Mechanical', full: 'Mechanical Engineering', count: materials.filter(m => m.branch.includes('Mechanical')).length },
                  { name: 'Electrical', full: 'Electrical Engineering', count: materials.filter(m => m.branch.includes('Electrical')).length },
                  { name: 'ECE', full: 'Electronics & Comm.', count: materials.filter(m => m.branch.includes('Electronics') || m.branch.includes('ECE')).length }
                ].map((br) => (
                  <div key={br.name} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 hover:border-indigo-200 transition-colors">
                    <p className="text-xs font-black text-slate-900">{br.name}</p>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{br.full}</p>
                    <p className="text-sm font-bold text-indigo-600 mt-2">{br.count} files</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* =================================================================
            VIEW 5B: ADD / MANAGE SUBJECTS (Year, Branch, Semester, Subject Name, Code)
           ================================================================= */}
        {activeNav === 'Add Subject' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            {/* Add Subject Card */}
            <div className="w-full bg-white rounded-3xl border border-slate-100/90 p-6 sm:p-8 shadow-[0_2px_14px_rgba(0,0,0,0.02)] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-5">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900">Add &amp; Manage Subjects</h2>
                    <p className="text-xs text-slate-400">
                      Add subjects for any Year, Branch &amp; Semester. Changes sync automatically with Coordinator &amp; Student portals.
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleAdminAddSubject} className="space-y-5">
                {/* Year, Branch, Semester Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Year */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      Select Year <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={subjYear}
                      onChange={(e) => {
                        const yr = e.target.value as YearOption;
                        setSubjYear(yr);
                        const defaultBr = yr === '1st Year' ? 'ABCD Group' : 'CSE(AI&ML)';
                        setSubjBranch(defaultBr);
                        const sems = YEAR_SEMESTER_MAP[yr] || ['Semester 3'];
                        setSubjSemester(sems[0]);
                      }}
                      className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {YEARS.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  {/* Branch */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      Select Branch / Group <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={subjBranch}
                      onChange={(e) => setSubjBranch(e.target.value as BranchOption)}
                      className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {subjAvailableBranches.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>

                  {/* Semester */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      Select Semester <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={subjSemester}
                      onChange={(e) => setSubjSemester(e.target.value as SemesterOption)}
                      className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {subjAvailableSemesters.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Subject Name & Subject Code */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      Subject Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newAdminSubjectTitle}
                      onChange={(e) => setNewAdminSubjectTitle(e.target.value)}
                      placeholder="e.g. Data Structures & Algorithms"
                      className="w-full h-11 px-4 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      Subject Code (Optional)
                    </label>
                    <input
                      type="text"
                      value={newAdminSubjectCode}
                      onChange={(e) => setNewAdminSubjectCode(e.target.value)}
                      placeholder="e.g. CS301"
                      className="w-full h-11 px-4 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-2xl bg-[#3b49df] hover:bg-[#323fc0] text-white text-xs font-bold shadow-md shadow-indigo-100 transition-all inline-flex items-center space-x-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Save Subject to Database</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Active Subjects List for Selected Combination */}
            <div className="w-full bg-white rounded-3xl border border-slate-100/90 p-6 sm:p-8 shadow-[0_2px_14px_rgba(0,0,0,0.02)] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Subjects in {subjYear} • {subjBranch} • {subjSemester} ({currentAdminSubjects.length})
                  </h3>
                  <p className="text-xs text-slate-400">
                    These subjects appear for both the {subjBranch} Coordinator and Students.
                  </p>
                </div>
              </div>

              {currentAdminSubjects.length === 0 ? (
                <div className="py-10 text-center space-y-2 rounded-2xl bg-slate-50/70 border border-dashed border-slate-200">
                  <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-bold text-slate-700">No Subjects Added Yet</p>
                  <p className="text-xs text-slate-500">
                    Use the form above to add subjects for {subjBranch} ({subjSemester}).
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentAdminSubjects.map((subj) => (
                    <div
                      key={subj.code + subj.title}
                      className="p-4 rounded-2xl bg-slate-50/70 hover:bg-white border border-slate-200/80 hover:border-indigo-300 transition-all flex items-center justify-between gap-3 shadow-sm"
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-[10px] shrink-0 border border-indigo-100">
                          {subj.code.slice(0, 4)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-slate-800 truncate" title={subj.title}>
                            {subj.title}
                          </h4>
                          <span className="text-xs text-slate-400 font-semibold">{subj.code}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAdminSubject(subj);
                            setEditAdminSubjTitle(subj.title);
                            setEditAdminSubjCode(subj.code);
                          }}
                          title={`Edit ${subj.title}`}
                          className="w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdminDeleteSubject(subj.title)}
                          title={`Delete ${subj.title}`}
                          className="w-8 h-8 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer"
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

        {/* =================================================================
            VIEW 6A: MANAGE BY YEAR (Real Year-wise Dashboard & Materials)
           ================================================================= */}
        {activeNav === 'Manage by Year' && (() => {
          const normYear = (y: string) => y.replace(' Year', '').trim().toLowerCase();
          const yearBranches: BranchOption[] =
            selectedManageYear === '1st Year' ? FIRST_YEAR_GROUPS : STANDARD_BRANCHES;
          const yearSemesters = YEAR_SEMESTER_MAP[selectedManageYear] || [];

          const yearMaterials = materials.filter(
            (m) => normYear(m.year) === normYear(selectedManageYear)
          );
          const filteredYearMaterials = yearMaterials.filter((m) =>
            manageYearTypeFilter === 'All' ? true : m.type === manageYearTypeFilter
          );
          const yearCoords = coordinators.filter(
            (c) => normYear(c.year) === normYear(selectedManageYear)
          );

          return (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* 4 Year Selector Cards with Real Counts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {YEARS.map((yr) => {
                  const yrMats = materials.filter((m) => normYear(m.year) === normYear(yr));
                  const yrNotes = yrMats.filter((m) => m.type === 'Notes').length;
                  const yrPyqs = yrMats.filter((m) => m.type === 'PYQs').length;
                  const yrLecs = yrMats.filter((m) => m.type === 'Lectures').length;
                  const yrCoordsCount = coordinators.filter((c) => normYear(c.year) === normYear(yr)).length;
                  const yrBranchesList: BranchOption[] = yr === '1st Year' ? FIRST_YEAR_GROUPS : STANDARD_BRANCHES;
                  const yrSems = YEAR_SEMESTER_MAP[yr] || [];
                  const yrSubjectsCount = yrBranchesList.reduce(
                    (acc, br) =>
                      acc + yrSems.reduce((sAcc, sem) => sAcc + getSubjectsFor(yr, br, sem).length, 0),
                    0
                  );
                  const isSelected = selectedManageYear === yr;

                  return (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => {
                        setSelectedManageYear(yr);
                        setManageYearTypeFilter('All');
                      }}
                      className={`text-left rounded-3xl p-5 border transition-all cursor-pointer space-y-3 ${
                        isSelected
                          ? 'bg-[#3b49df] text-white border-[#3b49df] shadow-lg shadow-indigo-200/70'
                          : 'bg-white text-slate-800 border-slate-100 hover:border-indigo-200 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700'
                        }`}>
                          {yrSems.join(' & ')}
                        </span>
                        <Calendar className={`w-5 h-5 ${isSelected ? 'text-indigo-200' : 'text-indigo-500'}`} />
                      </div>
                      <div>
                        <h3 className="text-lg font-extrabold tracking-tight">{yr}</h3>
                        <p className={`text-xs font-medium mt-0.5 ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>
                          {yrMats.length} Total Materials • {yrSubjectsCount} Subjects
                        </p>
                      </div>
                      <div className={`grid grid-cols-3 gap-2 pt-2 border-t text-[11px] font-bold ${
                        isSelected ? 'border-white/20 text-indigo-50' : 'border-slate-100 text-slate-600'
                      }`}>
                        <div>{yrNotes} Notes</div>
                        <div>{yrPyqs} PYQs</div>
                        <div>{yrLecs} Videos</div>
                      </div>
                      <div className={`text-[11px] font-semibold ${isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>
                        {yrCoordsCount} Coordinator{yrCoordsCount === 1 ? '' : 's'} assigned
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected Year Header + Quick Actions */}
              <div className="bg-white rounded-3xl border border-slate-100/90 p-5 sm:p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-extrabold text-slate-900">{selectedManageYear} Overview</h3>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {yearSemesters.join(' / ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Showing all branches/groups, assigned coordinators, subjects, and uploaded materials for {selectedManageYear}.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUploadYear(selectedManageYear);
                      setUploadBranch('');
                      setUploadSemester('');
                      setUploadSubject('');
                      selectAdminNav('Upload Material');
                    }}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#3b49df] hover:bg-[#323fc0] text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload for {selectedManageYear}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubjYear(selectedManageYear);
                      setSubjBranch(yearBranches[0]);
                      setSubjSemester(yearSemesters[0]);
                      selectAdminNav('Add Subject');
                    }}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Subject</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setYearFilter(selectedManageYear);
                      setBranchFilter('All');
                      setSemesterFilter('All');
                      setSubjectFilter('All');
                      selectAdminNav('All Materials');
                    }}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <span>Open in All Materials</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Branch/Group Cards for Selected Year */}
              <div className="bg-white rounded-3xl border border-slate-100/90 p-5 sm:p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">
                    {selectedManageYear === '1st Year' ? 'Groups & Coordinators' : 'Branches & Coordinators'} ({yearBranches.length})
                  </h4>
                  <span className="text-xs text-slate-400 font-medium">
                    {yearCoords.length} Active / Registered
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {yearBranches.map((br) => {
                    const brMats = yearMaterials.filter((m) => isBranchMatch(m.branch, br));
                    const brNotes = brMats.filter((m) => m.type === 'Notes').length;
                    const brPyqs = brMats.filter((m) => m.type === 'PYQs').length;
                    const brLecs = brMats.filter((m) => m.type === 'Lectures').length;
                    const coord = yearCoords.find((c) => isBranchMatch(c.branch, br));
                    const semSubjects = yearSemesters.flatMap((sem) =>
                      getSubjectsFor(selectedManageYear, br, sem).map((s) => ({ ...s, sem }))
                    );

                    return (
                      <div key={br} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 space-y-3 hover:border-indigo-200 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h5 className="text-sm font-bold text-slate-900 leading-snug">{br}</h5>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {semSubjects.length} Subject{semSubjects.length === 1 ? '' : 's'} • {brMats.length} File{brMats.length === 1 ? '' : 's'}
                            </p>
                          </div>
                          {coord ? (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                              coord.status === 'Inactive' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {coord.name} ({coord.status})
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                              No Coordinator
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                          <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700">{brNotes} Notes</span>
                          <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700">{brPyqs} PYQs</span>
                          <span className="px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700">{brLecs} Lectures</span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedManageBranch(br);
                              setManageBranchYearFilter(selectedManageYear);
                              selectAdminNav('Manage by Branch');
                            }}
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                          >
                            Inspect Branch →
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setUploadYear(selectedManageYear);
                              setUploadBranch(br);
                              setUploadSemester('');
                              setUploadSubject('');
                              selectAdminNav('Upload Material');
                            }}
                            className="text-[11px] font-bold text-slate-700 hover:text-indigo-600 cursor-pointer"
                          >
                            + Upload
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Materials List for Selected Year */}
              <div className="bg-white rounded-3xl border border-slate-100/90 p-5 sm:p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h4 className="text-sm font-bold text-slate-900">
                    {selectedManageYear} Materials ({filteredYearMaterials.length})
                  </h4>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['All', 'Notes', 'PYQs', 'Lectures'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setManageYearTypeFilter(t)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                          manageYearTypeFilter === t
                            ? 'bg-[#3b49df] text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredYearMaterials.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-400">
                    No {manageYearTypeFilter === 'All' ? '' : manageYearTypeFilter + ' '}materials uploaded for {selectedManageYear} yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="py-3 pr-4">Material</th>
                          <th className="py-3 px-3">Branch</th>
                          <th className="py-3 px-3">Subject</th>
                          <th className="py-3 px-3">Type</th>
                          <th className="py-3 pl-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredYearMaterials.map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50/80">
                            <td className="py-3 pr-4 font-bold text-slate-900 max-w-[240px] truncate">{m.fileName}</td>
                            <td className="py-3 px-3 text-slate-600">{m.branch}</td>
                            <td className="py-3 px-3 text-slate-600">{m.subject} {m.semester ? `(${m.semester})` : ''}</td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                m.type === 'PYQs'
                                  ? 'bg-amber-50 text-amber-700'
                                  : m.type === 'Lectures'
                                  ? 'bg-purple-50 text-purple-700'
                                  : 'bg-blue-50 text-blue-700'
                              }`}>
                                {m.type}
                              </span>
                            </td>
                            <td className="py-3 pl-3 text-right">
                              <div className="inline-flex items-center space-x-1">
                                <button type="button" onClick={() => setPreviewMaterial(m)} title="Preview" className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"><Eye className="w-3.5 h-3.5" /></button>
                                <button type="button" onClick={() => handleDownloadSingle(m)} title="Open / Download" className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 cursor-pointer"><Download className="w-3.5 h-3.5" /></button>
                                {m.type !== 'Lectures' && (
                                  <button type="button" onClick={() => handleOpenEditMaterial(m)} title="Rename" className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 cursor-pointer"><Edit3 className="w-3.5 h-3.5" /></button>
                                )}
                                <button type="button" onClick={() => handleDeleteSingle(m.id, m.fileName)} title="Delete" className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* =================================================================
            VIEW 6B: MANAGE BY BRANCH (Real Branch-wise Dashboard & Materials)
           ================================================================= */}
        {activeNav === 'Manage by Branch' && (() => {
          const allManageBranches: BranchOption[] = [...STANDARD_BRANCHES, ...FIRST_YEAR_GROUPS];
          const isFirstYearGroup = FIRST_YEAR_GROUPS.includes(selectedManageBranch as any);
          const relevantYears: YearOption[] = isFirstYearGroup
            ? ['1st Year']
            : ['2nd Year', '3rd Year', '4th Year'];

          const branchMaterials = materials.filter((m) => isBranchMatch(m.branch, selectedManageBranch));
          const filteredBranchMaterials = branchMaterials.filter((m) =>
            manageBranchYearFilter === 'All'
              ? true
              : m.year.replace(' Year', '').trim().toLowerCase() === manageBranchYearFilter.replace(' Year', '').trim().toLowerCase()
          );
          const branchCoords = coordinators.filter((c) => isBranchMatch(c.branch, selectedManageBranch));

          return (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Branch Selector Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {allManageBranches.map((br) => {
                  const brMats = materials.filter((m) => isBranchMatch(m.branch, br));
                  const brNotes = brMats.filter((m) => m.type === 'Notes').length;
                  const brPyqs = brMats.filter((m) => m.type === 'PYQs').length;
                  const brLecs = brMats.filter((m) => m.type === 'Lectures').length;
                  const brCoordsCount = coordinators.filter((c) => isBranchMatch(c.branch, br)).length;
                  const isSelected = selectedManageBranch === br;

                  return (
                    <button
                      key={br}
                      type="button"
                      onClick={() => {
                        setSelectedManageBranch(br);
                        setManageBranchYearFilter('All');
                      }}
                      className={`text-left rounded-3xl p-4 sm:p-5 border transition-all cursor-pointer space-y-2.5 ${
                        isSelected
                          ? 'bg-[#3b49df] text-white border-[#3b49df] shadow-lg shadow-indigo-200/70'
                          : 'bg-white text-slate-800 border-slate-100 hover:border-indigo-200 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-extrabold leading-snug">{br}</h3>
                        <GitBranch className={`w-4 h-4 shrink-0 ${isSelected ? 'text-indigo-200' : 'text-indigo-500'}`} />
                      </div>
                      <div className={`flex items-center gap-2 text-[11px] font-bold ${isSelected ? 'text-indigo-50' : 'text-slate-600'}`}>
                        <span>{brNotes} Notes</span>
                        <span>•</span>
                        <span>{brPyqs} PYQs</span>
                        <span>•</span>
                        <span>{brLecs} Videos</span>
                      </div>
                      <div className={`text-[11px] font-medium ${isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>
                        {brCoordsCount} Coordinator{brCoordsCount === 1 ? '' : 's'} • {brMats.length} Total Files
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected Branch Quick Actions */}
              <div className="bg-white rounded-3xl border border-slate-100/90 p-5 sm:p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">{selectedManageBranch}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {branchCoords.length} Coordinator{branchCoords.length === 1 ? '' : 's'} assigned • {branchMaterials.length} Uploaded Materials across {relevantYears.join(', ')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUploadYear(relevantYears[0]);
                      setUploadBranch(selectedManageBranch);
                      setUploadSemester('');
                      setUploadSubject('');
                      selectAdminNav('Upload Material');
                    }}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#3b49df] hover:bg-[#323fc0] text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload Material</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubjYear(relevantYears[0]);
                      setSubjBranch(selectedManageBranch);
                      setSubjSemester(YEAR_SEMESTER_MAP[relevantYears[0]][0]);
                      selectAdminNav('Add Subject');
                    }}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Subject</span>
                  </button>
                </div>
              </div>

              {/* Year-by-Year Breakdown for Selected Branch */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {relevantYears.map((yr) => {
                  const sems = YEAR_SEMESTER_MAP[yr] || [];
                  const coord = branchCoords.find((c) => c.year === yr);
                  const yrMats = branchMaterials.filter(
                    (m) => m.year.replace(' Year', '').trim().toLowerCase() === yr.replace(' Year', '').trim().toLowerCase()
                  );
                  const semSubjs = sems.flatMap((sem) => getSubjectsFor(yr, selectedManageBranch, sem));

                  return (
                    <div key={yr} className="bg-white rounded-3xl border border-slate-100/90 p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-base font-extrabold text-slate-900">{yr}</h4>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                          {sems.join(' & ')}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600">
                        Coordinator:{' '}
                        {coord ? (
                          <strong className={coord.status === 'Inactive' ? 'text-rose-600' : 'text-emerald-700'}>
                            {coord.name} ({coord.status})
                          </strong>
                        ) : (
                          <span className="text-amber-600 font-semibold">Not Assigned</span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500">
                        <strong>{semSubjs.length}</strong> Subjects • <strong>{yrMats.length}</strong> Materials
                      </div>

                      {semSubjs.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {semSubjs.slice(0, 6).map((s) => (
                            <span key={`${s.title}-${s.code}`} className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700">
                              {s.title}
                            </span>
                          ))}
                          {semSubjs.length > 6 && (
                            <span className="text-[10px] font-semibold text-slate-400">+{semSubjs.length - 6} more</span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setManageBranchYearFilter(yr)}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                        >
                          Show Files ({yrMats.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSubjYear(yr);
                            setSubjBranch(selectedManageBranch);
                            setSubjSemester(sems[0]);
                            selectAdminNav('Add Subject');
                          }}
                          className="text-[11px] font-bold text-slate-700 hover:text-indigo-600 cursor-pointer"
                        >
                          Manage Subjects
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Materials List for Selected Branch */}
              <div className="bg-white rounded-3xl border border-slate-100/90 p-5 sm:p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h4 className="text-sm font-bold text-slate-900">
                    {selectedManageBranch} Materials ({filteredBranchMaterials.length})
                  </h4>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setManageBranchYearFilter('All')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        manageBranchYearFilter === 'All'
                          ? 'bg-[#3b49df] text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      All Years
                    </button>
                    {relevantYears.map((yr) => (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => setManageBranchYearFilter(yr)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                          manageBranchYearFilter === yr
                            ? 'bg-[#3b49df] text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {yr}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredBranchMaterials.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-400">
                    No materials uploaded for {selectedManageBranch} {manageBranchYearFilter !== 'All' ? `(${manageBranchYearFilter})` : ''} yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="py-3 pr-4">Material</th>
                          <th className="py-3 px-3">Year</th>
                          <th className="py-3 px-3">Subject</th>
                          <th className="py-3 px-3">Type</th>
                          <th className="py-3 pl-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredBranchMaterials.map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50/80">
                            <td className="py-3 pr-4 font-bold text-slate-900 max-w-[240px] truncate">{m.fileName}</td>
                            <td className="py-3 px-3 text-slate-600">{m.year}</td>
                            <td className="py-3 px-3 text-slate-600">{m.subject} {m.semester ? `(${m.semester})` : ''}</td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                m.type === 'PYQs'
                                  ? 'bg-amber-50 text-amber-700'
                                  : m.type === 'Lectures'
                                  ? 'bg-purple-50 text-purple-700'
                                  : 'bg-blue-50 text-blue-700'
                              }`}>
                                {m.type}
                              </span>
                            </td>
                            <td className="py-3 pl-3 text-right">
                              <div className="inline-flex items-center space-x-1">
                                <button type="button" onClick={() => setPreviewMaterial(m)} title="Preview" className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"><Eye className="w-3.5 h-3.5" /></button>
                                <button type="button" onClick={() => handleDownloadSingle(m)} title="Open / Download" className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 cursor-pointer"><Download className="w-3.5 h-3.5" /></button>
                                {m.type !== 'Lectures' && (
                                  <button type="button" onClick={() => handleOpenEditMaterial(m)} title="Rename" className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 cursor-pointer"><Edit3 className="w-3.5 h-3.5" /></button>
                                )}
                                <button type="button" onClick={() => handleDeleteSingle(m.id, m.fileName)} title="Delete" className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* =================================================================
            VIEW 9: COORDINATOR ISSUES MANAGEMENT VIEW
           ================================================================= */}
        {activeNav === 'Issues' && (() => {
          const openCount = adminIssues.filter((i) => i.status === 'Open').length;
          const resolvedCount = adminIssues.filter((i) => i.status === 'Resolved').length;
          const filteredIssues = adminIssues.filter((i) =>
            issueStatusFilter === 'All' ? true : i.status === issueStatusFilter
          );

          const ISSUES_SQL = `create table if not exists public.coordinator_issues (
  id text primary key,
  coordinator_id text,
  coordinator_name text not null,
  year text not null,
  branch text not null,
  subject text not null,
  description text not null,
  status text not null default 'Open',
  admin_reply text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.coordinator_issues enable row level security;
drop policy if exists "Allow all for coordinator_issues" on public.coordinator_issues;
create policy "Allow all for coordinator_issues" on public.coordinator_issues for all using (true) with check (true);
grant all on public.coordinator_issues to anon, authenticated, service_role;`;

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
                        Coordinator Issues ({adminIssues.length})
                      </h2>
                      <p className="text-xs text-slate-400">
                        Solve issues reported by coordinators or delete them permanently from Supabase database.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={syncAdminIssues}
                      disabled={isLoadingIssues}
                      className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingIssues ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>

                    {resolvedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleBulkDeleteIssues('resolved')}
                        className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Solved ({resolvedCount})</span>
                      </button>
                    )}

                    {adminIssues.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleBulkDeleteIssues('all')}
                        className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete All ({adminIssues.length})</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Pills */}
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setIssueStatusFilter('All')}
                    className={`px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
                      issueStatusFilter === 'All'
                        ? 'bg-[#3b49df] text-white shadow-sm'
                        : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    All ({adminIssues.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setIssueStatusFilter('Open')}
                    className={`px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
                      issueStatusFilter === 'Open'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    Open ({openCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setIssueStatusFilter('Resolved')}
                    className={`px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
                      issueStatusFilter === 'Resolved'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    Solved ({resolvedCount})
                  </button>
                </div>

                {/* Setup Notice if table hasn't been created in Supabase yet */}
                {issuesTableMissing && (
                  <div className="p-4 rounded-2xl bg-red-50 border border-red-200 space-y-2.5 text-xs text-red-800">
                    <div className="font-bold flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>Supabase Table &quot;coordinator_issues&quot; Missing</span>
                    </div>
                    <p>
                      Run the SQL below inside your Supabase Dashboard &rarr; <strong>SQL Editor</strong> so issues are stored and synced in the database:
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(ISSUES_SQL);
                        showToast('Issues table SQL copied to clipboard!');
                      }}
                      className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Issues Table SQL</span>
                    </button>
                  </div>
                )}

                {issuesError && !issuesTableMissing && (
                  <div className="p-3.5 rounded-xl bg-red-50 border border-red-100 text-xs text-red-700 flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{issuesError}</span>
                  </div>
                )}

                {/* Issues List */}
                {isLoadingIssues && adminIssues.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400 font-medium">
                    Loading coordinator issues...
                  </div>
                ) : filteredIssues.length > 0 ? (
                  <div className="space-y-4">
                    {filteredIssues.map((issue) => {
                      const replyValue =
                        issueReplyDrafts[issue.id] !== undefined
                          ? issueReplyDrafts[issue.id]
                          : issue.admin_reply || '';
                      const isBusy = issueBusyId === issue.id;

                      return (
                        <div
                          key={issue.id}
                          className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white transition-colors space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                                  {issue.coordinator_name}
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

                          {/* Admin Reply + Actions */}
                          <div className="flex flex-col md:flex-row md:items-center gap-2.5 pt-1">
                            <input
                              type="text"
                              value={replyValue}
                              onChange={(e) =>
                                setIssueReplyDrafts((prev) => ({
                                  ...prev,
                                  [issue.id]: e.target.value,
                                }))
                              }
                              placeholder="Optional resolution note / reply for coordinator..."
                              className="flex-1 h-10 px-3.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />

                            <div className="flex items-center gap-2 shrink-0">
                              {issue.status === 'Open' ? (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleToggleResolveIssue(issue, 'Resolved')}
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
                                  onClick={() => handleToggleResolveIssue(issue, 'Open')}
                                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Reopen</span>
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDeleteSingleIssue(issue)}
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
                    <p className="text-sm font-bold text-slate-700">No coordinator issues found</p>
                    <p className="text-xs text-slate-400">
                      Issues submitted by any branch or year coordinator will appear here.
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      </main>

      {/* =================================================================
          MODAL: PREVIEW MATERIAL (Exact same Student PDF Viewer with 4-sided border, static header & pinch zoom)
         ================================================================= */}
      <PdfPreviewModal
        doc={
          previewMaterial
            ? {
                id: previewMaterial.id,
                title: previewMaterial.fileName,
                type: previewMaterial.type,
                subtitle: [
                  previewMaterial.year,
                  previewMaterial.branch,
                  previewMaterial.semester,
                  previewMaterial.subject,
                ]
                  .filter(Boolean)
                  .join(' • '),
                file_url: previewMaterial.file_url || previewMaterial.link,
                file_path: previewMaterial.file_path,
                missingAttachmentMessage: `Uploaded by ${previewMaterial.uploadedBy} • Type: ${previewMaterial.type}`,
              }
            : null
        }
        onClose={() => setPreviewMaterial(null)}
        onDownload={previewMaterial ? () => handleDownloadSingle(previewMaterial) : undefined}
      />

      {/* =================================================================
          MODAL: EDIT NOTE NAME
         ================================================================= */}
      {editingMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Edit Note Name
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Rename this uploaded material
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingMaterial(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Note Metadata Read-Only Card */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100/90 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 font-bold text-[9px] flex items-center justify-center border border-red-100">
                  PDF
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">{editingMaterial.subject}</p>
                  <p className="text-[10px] text-slate-400">
                    {editingMaterial.branch} • {editingMaterial.year} {editingMaterial.semester ? `• ${editingMaterial.semester}` : ''}
                  </p>
                </div>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                editingMaterial.type === 'Notes' 
                  ? 'bg-blue-50 text-blue-700 border-blue-100' 
                  : 'bg-cyan-50 text-cyan-700 border-cyan-100'
              }`}>
                {editingMaterial.type}
              </span>
            </div>

            {/* Form: Note Name Input Only */}
            <form onSubmit={handleSaveMaterialEdit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                  Note Name / File Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editMaterialName}
                  onChange={(e) => setEditMaterialName(e.target.value)}
                  placeholder="e.g. DSA_Unit1_Notes.pdf"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  autoFocus
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Enter the new name for this note document.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMaterial(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#3b49df] hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  Save Name
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================
          MODAL: ADD / EDIT COORDINATOR (With Password & Login Credentials)
         ================================================================= */}
      {isAddCoordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-4">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingCoord ? 'Edit Coordinator & Password' : 'Add New Coordinator'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Set coordinator login credentials & department permissions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCoordOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCoordinator} className="space-y-3.5">
              
              {/* Full Name */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Coordinator Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={coordForm.name}
                  onChange={(e) => setCoordForm({ ...coordForm, name: e.target.value })}
                  placeholder="e.g. Rohit Sharma"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
              </div>

              {/* Year & Branch */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Year <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={coordForm.year}
                    onChange={(e) => {
                      const yr = e.target.value;
                      const defaultBranch = yr === '1st Year' ? 'ABCD Group' : 'CSE(AI&ML)';
                      setCoordForm({ ...coordForm, year: yr, branch: defaultBranch });
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm cursor-pointer"
                  >
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Branch / Group <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={coordForm.branch}
                    onChange={(e) => setCoordForm({ ...coordForm, branch: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm cursor-pointer truncate"
                  >
                    {modalAvailableBranches.map((br) => (
                      <option key={br} value={br}>{br}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Login Password Field (Key requirement requested by user) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-700">
                    Coordinator Login Password {!editingCoord && <span className="text-red-500">*</span>}
                  </label>
                  <span className="text-[10px] text-indigo-600 font-semibold">
                    {editingCoord ? 'Optional when editing' : 'Required for Portal Login'}
                  </span>
                </div>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showCoordPassword ? 'text' : 'password'}
                    required={!editingCoord}
                    value={coordForm.password}
                    onChange={(e) => setCoordForm({ ...coordForm, password: e.target.value })}
                    placeholder={editingCoord ? 'Leave blank to keep existing password' : 'Enter secure password (e.g. rohit@123)'}
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCoordPassword(!showCoordPassword)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    {showCoordPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Coordinator will enter this exact password when logging into the Coordinator portal.
                </p>
              </div>

              {/* Status */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Account Status</label>
                <select
                  value={coordForm.status}
                  onChange={(e) => setCoordForm({ ...coordForm, status: e.target.value as 'Active' | 'Inactive' })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm cursor-pointer"
                >
                  <option value="Active">Active (Can log in & manage resources)</option>
                  <option value="Inactive">Inactive (Login disabled by Admin)</option>
                </select>
              </div>

              {/* Error Display inside Modal */}
              {coordModalError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1 animate-in fade-in">
                  <div className="flex items-center space-x-2 font-bold text-rose-900">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Cannot Save to Supabase</span>
                  </div>
                  <p className="text-[11px] text-rose-700 leading-relaxed font-medium">
                    {coordModalError}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSavingCoord}
                  onClick={() => setIsAddCoordOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCoord}
                  className="px-5 py-2.5 rounded-xl bg-[#3b49df] hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  {isSavingCoord ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving to Supabase...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{editingCoord ? 'Update Coordinator' : 'Save Coordinator'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================
          MODAL: ADMIN CHANGE PASSWORD
         ================================================================= */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-4">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Change Admin Password</h3>
                  <p className="text-[11px] text-slate-400">Update super admin portal credentials</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsChangePasswordOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {passwordChangeError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{passwordChangeError}</span>
              </div>
            )}

            <form onSubmit={handleAdminPasswordChange} className="space-y-3.5">
              {/* Current Password */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Current Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    required
                    value={changePasswordForm.currentPassword}
                    onChange={(e) => setChangePasswordForm({ ...changePasswordForm, currentPassword: e.target.value })}
                    placeholder="Enter current admin password"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  New Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={changePasswordForm.newPassword}
                    onChange={(e) => setChangePasswordForm({ ...changePasswordForm, newPassword: e.target.value })}
                    placeholder="At least 4 characters"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Confirm New Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    required
                    value={changePasswordForm.confirmPassword}
                    onChange={(e) => setChangePasswordForm({ ...changePasswordForm, confirmPassword: e.target.value })}
                    placeholder="Re-enter new password"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsChangePasswordOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPassword}
                  className="px-5 py-2.5 rounded-xl bg-[#3b49df] hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isUpdatingPassword ? 'Updating in Supabase...' : 'Update Password'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================
          MODAL: EDIT SUBJECT (Syncs to Supabase & Coordinator Portals)
         ================================================================= */}
      {editingAdminSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Edit Subject</h3>
                  <p className="text-[11px] text-slate-400">
                    {subjYear} • {subjBranch} • {subjSemester}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingAdminSubject(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdminSaveSubjectEdit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Subject Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editAdminSubjTitle}
                  onChange={(e) => setEditAdminSubjTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Subject Code
                </label>
                <input
                  type="text"
                  value={editAdminSubjCode}
                  onChange={(e) => setEditAdminSubjCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingAdminSubject(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#3b49df] hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================
          MODAL: DELETE CONFIRMATION POPUP
         ================================================================= */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150">
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

      {/* =================================================================
          FLOATING TOAST
         ================================================================= */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-2 px-4 py-3 rounded-2xl bg-slate-900 text-white text-xs font-bold shadow-xl border border-slate-800 animate-in slide-in-from-bottom-2 fade-in duration-200">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>{toast.message}</span>
        </div>
      )}

    </div>
  );
}
