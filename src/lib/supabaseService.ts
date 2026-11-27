import { getSupabaseClient, getSupabaseCredentials, isSupabaseConfigured } from './supabase';
import { NoteDocument, SubjectMeta, YearOption, BranchOption, SemesterOption } from '../types';

function getClientApiHeaders(includeJson = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJson) headers['Content-Type'] = 'application/json';
  const creds = getSupabaseCredentials();
  if (creds.url && creds.key) {
    headers['x-supabase-url'] = creds.url;
    headers['x-supabase-key'] = creds.key;
  }
  return headers;
}

// Supabase storage bucket is disabled; all PDFs are stored exclusively in Google Drive.
// Supabase is used strictly for PostgreSQL database metadata (tables: documents, coordinators, lectures, subjects).
export const SUPABASE_BUCKET_NAME = '';

export interface LectureRecord {
  id: string;
  title: string;
  subject: string;
  semester: string;
  faculty?: string;
  link?: string;
  video_file_url?: string;
  year?: string;
  branch?: string;
  date: string;
}

/**
 * Supabase Storage is disabled per requirement:
 * No PDFs are stored in Supabase buckets. All PDFs are uploaded exclusively to Google Drive,
 * and only their public URLs and metadata are stored in Supabase PostgreSQL tables.
 */
export async function uploadPdfToSupabase(
  _file: File,
  _folderPath: string
): Promise<{ publicUrl: string; filePath: string } | null> {
  console.info('Supabase bucket storage is disabled. PDFs are stored exclusively in Google Drive.');
  return null;
}

/**
 * Helper to fetch Notes or PYQs from their dedicated Supabase table (`notes` or `pyqs`).
 */
async function fetchFromDedicatedTable(
  tableName: 'notes' | 'pyqs',
  docType: 'Notes' | 'PYQ',
  year?: YearOption | string,
  branch?: BranchOption | string,
  semester?: SemesterOption | string,
  subject?: string
): Promise<NoteDocument[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  try {
    const METADATA_FIELDS = 'id, title, year, branch, semester, subject, code, pages, size, owner, file_url, file_path, created_at';
    let query = client.from(tableName).select(METADATA_FIELDS);

    if (year && year !== 'All') {
      query = query.eq('year', year);
    }
    if (branch && branch !== 'All') {
      query = query.eq('branch', branch);
    }
    if (semester && semester !== 'All') {
      query = query.eq('semester', semester);
    }
    if (subject && subject !== 'All') {
      query = query.eq('subject', subject);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.warn(`Supabase fetch ${tableName} warning:`, error.message);
      return [];
    }

    return ((data || []) as any[]).map((row) => ({
      id: row.id,
      title: row.title,
      subject: row.subject,
      code: row.code || (docType === 'PYQ' ? 'PYQ101' : 'DOC101'),
      year: row.year,
      branch: row.branch,
      semester: row.semester,
      type: docType,
      pages: typeof row.pages === 'number' && row.pages > 0 ? row.pages : 0,
      size: typeof row.size === 'string' && row.size.trim() ? row.size.trim() : '',
      owner: row.owner || 'Department Faculty',
      file_url: row.file_url || undefined,
      file_path: row.file_path || undefined,
      preview: row.preview || [
        `Verified academic ${docType === 'PYQ' ? 'question paper' : 'notes'} for ${row.subject}`,
        `Uploaded by: ${row.owner || 'Department Faculty'}`
      ]
    }));
  } catch (err) {
    console.error(`Error fetching ${tableName} from Supabase:`, err);
    return [];
  }
}

/**
 * Fetches Notes strictly from Supabase `notes` table.
 */
export async function fetchNotesFromSupabase(
  year?: YearOption | string,
  branch?: BranchOption | string,
  semester?: SemesterOption | string,
  subject?: string
): Promise<NoteDocument[]> {
  return fetchFromDedicatedTable('notes', 'Notes', year, branch, semester, subject);
}

/**
 * Fetches PYQs strictly from Supabase `pyqs` table.
 */
export async function fetchPyqsFromSupabase(
  year?: YearOption | string,
  branch?: BranchOption | string,
  semester?: SemesterOption | string,
  subject?: string
): Promise<NoteDocument[]> {
  return fetchFromDedicatedTable('pyqs', 'PYQ', year, branch, semester, subject);
}

/**
 * Fetches documents from dedicated `notes` and `pyqs` tables in Supabase.
 * Supports filtering by Year, Branch, Semester, and optional Type ('Notes' | 'PYQ').
 */
export async function fetchDocumentsFromSupabase(
  year?: YearOption | string,
  branch?: BranchOption | string,
  semester?: SemesterOption | string,
  type?: 'Notes' | 'PYQ',
  subject?: string
): Promise<NoteDocument[]> {
  if (type === 'Notes') {
    return fetchNotesFromSupabase(year, branch, semester, subject);
  }
  if (type === 'PYQ') {
    return fetchPyqsFromSupabase(year, branch, semester, subject);
  }

  const [notesList, pyqsList] = await Promise.all([
    fetchNotesFromSupabase(year, branch, semester, subject),
    fetchPyqsFromSupabase(year, branch, semester, subject)
  ]);

  return [...notesList, ...pyqsList];
}

/**
 * Fetches all Notes and PYQs across all years and branches from Supabase.
 */
export async function fetchAllDocumentsFromSupabase(): Promise<NoteDocument[]> {
  return fetchDocumentsFromSupabase();
}

/**
 * Inserts or updates a document in its dedicated Supabase table (`notes` or `pyqs`).
 */
export async function insertDocumentToSupabase(doc: NoteDocument): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const targetTable = doc.type === 'PYQ' ? 'pyqs' : 'notes';

  try {
    const { error } = await client.from(targetTable).upsert({
      id: doc.id,
      title: doc.title,
      year: doc.year,
      branch: doc.branch,
      semester: doc.semester,
      subject: doc.subject,
      code: doc.code,
      pages: doc.pages,
      size: doc.size,
      owner: doc.owner,
      file_url: doc.file_url,
      file_path: doc.file_path,
      created_at: new Date().toISOString()
    });

    if (error) {
      console.error(`Error inserting into ${targetTable}:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Failed to insert into ${targetTable}:`, err);
    return false;
  }
}

/**
 * Deletes a record from `notes` / `pyqs` table in Supabase.
 */
export async function deleteDocumentFromSupabase(
  id: string,
  _filePath?: string,
  docType?: 'Notes' | 'PYQ'
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    if (docType === 'Notes') {
      const { error } = await client.from('notes').delete().eq('id', id);
      return !error;
    }
    if (docType === 'PYQ') {
      const { error } = await client.from('pyqs').delete().eq('id', id);
      return !error;
    }

    // If type not specified, clean up from both tables
    const [resNotes, resPyqs] = await Promise.all([
      client.from('notes').delete().eq('id', id),
      client.from('pyqs').delete().eq('id', id)
    ]);
    return !resNotes.error && !resPyqs.error;
  } catch (err) {
    console.error('Failed to delete document from Supabase:', err);
    return false;
  }
}

/**
 * Fetches all custom subjects via server /api/subjects route.
 */
export async function fetchSubjectsFromSupabase(
  year: YearOption,
  branch: BranchOption,
  semester: SemesterOption
): Promise<SubjectMeta[]> {
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams({ year, branch, semester });
      const res = await fetch(`/api/subjects?${q.toString()}`, {
        cache: 'no-store',
        headers: getClientApiHeaders(),
      });
      if (!res.ok) return [];
      const json = await res.json();
      if (!json?.success || !Array.isArray(json.subjects)) return [];
      return json.subjects.map((row: any) => ({
        title: row.title,
        code: row.code,
        unitSnippets: row.unit_snippets || [
          `${row.title} Unit 1 fundamental concepts.`,
          `${row.title} Unit 2 problem solving.`,
          `${row.title} Unit 3 practical implementations.`,
        ],
        pyqSnippets: row.pyq_snippets || [
          `Explain the core mechanism of ${row.title}.`,
          `Solve standard university numerical problem for ${row.title}.`,
        ],
      }));
    }

    const client = getSupabaseClient();
    if (!client) return [];
    const { data, error } = await client
      .from('subjects')
      .select('*')
      .eq('year', year)
      .eq('branch', branch)
      .eq('semester', semester)
      .order('created_at', { ascending: true });
    if (error) return [];
    return ((data || []) as any[]).map((row) => ({
      title: row.title,
      code: row.code,
      unitSnippets: row.unit_snippets || [],
      pyqSnippets: row.pyq_snippets || [],
    }));
  } catch {
    return [];
  }
}

/**
 * Fetches all custom subjects via server /api/subjects route across all years and branches.
 */
export async function fetchAllSubjectsFromSupabase(): Promise<{ year: YearOption; branch: BranchOption; semester: SemesterOption; subject: SubjectMeta }[]> {
  try {
    if (typeof window !== 'undefined') {
      const res = await fetch('/api/subjects', {
        cache: 'no-store',
        headers: getClientApiHeaders(),
      });
      if (!res.ok) return [];
      const json = await res.json();
      if (!json?.success || !Array.isArray(json.subjects)) return [];
      return json.subjects.map((row: any) => ({
        year: row.year as YearOption,
        branch: row.branch as BranchOption,
        semester: row.semester as SemesterOption,
        subject: {
          title: row.title,
          code: row.code,
          unitSnippets: row.unit_snippets || [],
          pyqSnippets: row.pyq_snippets || [],
        },
      }));
    }

    const client = getSupabaseClient();
    if (!client) return [];
    const { data, error } = await client
      .from('subjects')
      .select('*')
      .order('created_at', { ascending: true });
    if (error || !data) return [];
    return data.map((row) => ({
      year: row.year as YearOption,
      branch: row.branch as BranchOption,
      semester: row.semester as SemesterOption,
      subject: {
        title: row.title,
        code: row.code,
        unitSnippets: row.unit_snippets || [],
        pyqSnippets: row.pyq_snippets || [],
      },
    }));
  } catch {
    return [];
  }
}

/**
 * Inserts a new subject via authenticated server /api/subjects route.
 */
export async function insertSubjectToSupabase(
  year: YearOption,
  branch: BranchOption,
  semester: SemesterOption,
  subj: SubjectMeta
): Promise<boolean> {
  try {
    const res = await fetch('/api/subjects', {
      method: 'POST',
      headers: getClientApiHeaders(true),
      body: JSON.stringify({
        year,
        branch,
        semester,
        title: subj.title,
        code: subj.code,
        unitSnippets: subj.unitSnippets,
        pyqSnippets: subj.pyqSnippets,
      }),
    });
    const data = await res.json();
    return Boolean(res.ok && data?.success);
  } catch {
    return false;
  }
}

/**
 * Updates a subject via authenticated server /api/subjects route.
 */
export async function updateSubjectInSupabase(
  year: YearOption,
  branch: BranchOption,
  semester: SemesterOption,
  oldTitle: string,
  newTitle: string,
  newCode: string
): Promise<boolean> {
  try {
    const res = await fetch('/api/subjects', {
      method: 'PATCH',
      headers: getClientApiHeaders(true),
      body: JSON.stringify({ year, branch, semester, oldTitle, newTitle, newCode }),
    });
    const data = await res.json();
    return Boolean(res.ok && data?.success);
  } catch (err) {
    console.error('Failed to update subject:', err);
    return false;
  }
}

/**
 * Deletes a custom subject via authenticated server /api/subjects route.
 */
export async function deleteSubjectFromSupabase(
  year: YearOption,
  branch: BranchOption,
  semester: SemesterOption,
  title: string
): Promise<boolean> {
  try {
    const q = new URLSearchParams({ year, branch, semester, title });
    const res = await fetch(`/api/subjects?${q.toString()}`, {
      method: 'DELETE',
      headers: getClientApiHeaders(),
    });
    const data = await res.json();
    return Boolean(res.ok && data?.success);
  } catch {
    return false;
  }
}

/**
 * Fetches lectures via server /api/lectures route.
 */
export async function fetchLecturesFromSupabase(
  year?: YearOption | string,
  branch?: BranchOption | string
): Promise<LectureRecord[]> {
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams();
      if (year && year !== 'All') q.set('year', year);
      if (branch && branch !== 'All') q.set('branch', branch);
      const res = await fetch(`/api/lectures${q.toString() ? `?${q.toString()}` : ''}`, {
        cache: 'no-store',
        headers: getClientApiHeaders(),
      });
      if (!res.ok) return [];
      const json = await res.json();
      if (!json?.success || !Array.isArray(json.lectures)) return [];
      return json.lectures as LectureRecord[];
    }

    const client = getSupabaseClient();
    if (!client) return [];
    let query = client.from('lectures').select('*');
    if (year && year !== 'All') query = query.eq('year', year);
    if (branch && branch !== 'All') query = query.eq('branch', branch);
    const { data, error } = await query.order('date', { ascending: false });
    if (error || !data) return [];
    return data as LectureRecord[];
  } catch {
    return [];
  }
}

/**
 * Fetches all lectures across all years and branches.
 */
export async function fetchAllLecturesFromSupabase(): Promise<LectureRecord[]> {
  return fetchLecturesFromSupabase();
}

/**
 * Inserts or updates a lecture record via authenticated server /api/lectures route.
 */
export async function insertLectureToSupabase(
  lec: { id: string; title: string; subject: string; semester: string; link?: string; date: string },
  year: YearOption | string,
  branch: BranchOption | string
): Promise<boolean> {
  try {
    const res = await fetch('/api/lectures', {
      method: 'POST',
      headers: getClientApiHeaders(true),
      body: JSON.stringify({ ...lec, year, branch }),
    });
    const data = await res.json();
    return Boolean(res.ok && data?.success);
  } catch {
    return false;
  }
}

/**
 * Deletes a lecture via authenticated server /api/lectures route.
 */
export async function deleteLectureFromSupabase(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/lectures?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getClientApiHeaders(),
    });
    const data = await res.json();
    return Boolean(res.ok && data?.success);
  } catch {
    return false;
  }
}

/**
 * Updates a lecture title and link via authenticated server /api/lectures route.
 */
export async function updateLectureInSupabase(
  id: string,
  title: string,
  link?: string
): Promise<boolean> {
  try {
    const res = await fetch('/api/lectures', {
      method: 'PATCH',
      headers: getClientApiHeaders(true),
      body: JSON.stringify({ id, title, link }),
    });
    const data = await res.json();
    return Boolean(res.ok && data?.success);
  } catch {
    return false;
  }
}

export interface CoordinatorRecord {
  id: string;
  name: string;
  branch: string;
  year: string;
  password?: string;
  initials?: string;
  status: 'Active' | 'Inactive';
}

/**
 * Fetches all coordinators from Supabase `coordinators` table.
 */
export async function fetchCoordinatorsFromSupabase(): Promise<CoordinatorRecord[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from('coordinators')
      .select('id, name, branch, year, initials, status')
      .order('name', { ascending: true });

    if (error || !data) return [];
    return data as CoordinatorRecord[];
  } catch {
    return [];
  }
}

/**
 * Inserts or upserts a coordinator in Supabase `coordinators` table.
 */
export async function insertCoordinatorToSupabase(coord: CoordinatorRecord): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client.from('coordinators').upsert({
      id: coord.id,
      name: coord.name,
      branch: coord.branch,
      year: coord.year,
      password: coord.password || '',
      initials: coord.initials || '',
      status: coord.status || 'Active'
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Updates a coordinator in Supabase `coordinators` table.
 */
export async function updateCoordinatorInSupabase(coord: CoordinatorRecord): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const updateData: Record<string, any> = {
      name: coord.name,
      branch: coord.branch,
      year: coord.year,
      initials: coord.initials || '',
      status: coord.status || 'Active',
    };
    if (coord.password && coord.password.trim()) {
      updateData.password = coord.password.trim();
    }
    const { error } = await client
      .from('coordinators')
      .update(updateData)
      .eq('id', coord.id);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Deletes a coordinator from Supabase `coordinators` table.
 */
export async function deleteCoordinatorFromSupabase(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client.from('coordinators').delete().eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Updates a coordinator's password in Supabase `coordinators` table by ID or (Year + Branch).
 */
export async function updateCoordinatorPasswordInSupabase(
  identifier: { id?: string; year?: string; branch?: string },
  newPassword: string
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    let query = client.from('coordinators').update({ password: newPassword });
    if (identifier.id) {
      query = query.eq('id', identifier.id);
    } else if (identifier.year && identifier.branch) {
      query = query.eq('year', identifier.year).eq('branch', identifier.branch);
    }
    const { error } = await query;
    if (error) {
      console.error('Error updating coordinator password in Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to update coordinator password in Supabase:', err);
    return false;
  }
}

export interface AdminCredentials {
  id: string;
  password: string;
}
