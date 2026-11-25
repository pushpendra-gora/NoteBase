import { BranchOption, FirstYearGroup, NoteDocument, SemesterOption, YearOption, SubjectMeta } from '../types';
export type { SubjectMeta };

export const YEARS: YearOption[] = [
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year',
];

export const FIRST_YEAR_GROUPS: FirstYearGroup[] = [
  'ABCD Group',
  'EFGH Group',
];

export const STANDARD_BRANCHES: BranchOption[] = [
  'CSE(AI&ML)',
  'Petroleum Engineering',
  'Chemical Engineering',
  'Civil Engineering',
  'Mechanical Engineering',
  'Electrical Engineering',
  'Electronics & Communication Engineering',
];

export const YEAR_SEMESTER_MAP: Record<YearOption, SemesterOption[]> = {
  '1st Year': ['Semester 1', 'Semester 2'],
  '2nd Year': ['Semester 3', 'Semester 4'],
  '3rd Year': ['Semester 5', 'Semester 6'],
  '4th Year': ['Semester 7', 'Semester 8'],
};



const SUBJECTS_STORAGE_KEY = 'notehub_custom_subjects_v1';

export function getSubjectsStorageKey(year: string, branch: string, semester: string): string {
  return `${year}___${branch}___${semester}`;
}

/**
 * Returns the list of subjects taught in this Year, Branch, and Semester.
 * Supports dynamic additions and deletions stored in browser storage.
 */
export function getSubjectsFor(
  year: YearOption,
  branch: BranchOption,
  semester: SemesterOption
): SubjectMeta[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(SUBJECTS_STORAGE_KEY);
      if (raw) {
        const map: Record<string, SubjectMeta[]> = JSON.parse(raw);
        const key = getSubjectsStorageKey(year, branch, semester);
        if (map[key] && Array.isArray(map[key])) {
          return map[key];
        }
      }
    } catch {
      // Ignore
    }
  }

  // Only real coordinator-added subjects are returned; no hardcoded dummy subjects.
  return [];
}

/**
 * Persists customized subject list for a specific Year, Branch, and Semester.
 */
export function saveSubjectsFor(
  year: YearOption,
  branch: BranchOption,
  semester: SemesterOption,
  subjects: SubjectMeta[]
) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(SUBJECTS_STORAGE_KEY);
    const map: Record<string, SubjectMeta[]> = raw ? JSON.parse(raw) : {};
    const key = getSubjectsStorageKey(year, branch, semester);
    map[key] = subjects;
    localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new Event('notehub_subjects_changed'));
  } catch (e) {
    console.error('Failed to save subjects', e);
  }
}

/**
 * Adds a new subject to the specified Year, Branch, and Semester.
 */
export function addSubjectFor(
  year: YearOption,
  branch: BranchOption,
  semester: SemesterOption,
  newSubj: SubjectMeta
) {
  const current = getSubjectsFor(year, branch, semester);
  if (current.some((s) => s.title.toLowerCase() === newSubj.title.toLowerCase())) {
    return false; // already exists
  }
  const updated = [...current, newSubj];
  saveSubjectsFor(year, branch, semester, updated);
  return true;
}

/**
 * Deletes a subject from the specified Year, Branch, and Semester.
 */
export function deleteSubjectFor(
  year: YearOption,
  branch: BranchOption,
  semester: SemesterOption,
  subjectTitle: string
) {
  const current = getSubjectsFor(year, branch, semester);
  const updated = current.filter((s) => s.title !== subjectTitle);
  saveSubjectsFor(year, branch, semester, updated);
}

/**
 * Updates an existing subject (renames title or code) in the specified Year, Branch, and Semester.
 */
export function updateSubjectFor(
  year: YearOption,
  branch: BranchOption,
  semester: SemesterOption,
  oldTitle: string,
  updatedSubj: Partial<SubjectMeta>
) {
  const current = getSubjectsFor(year, branch, semester);
  const updated = current.map((s) => {
    if (s.title === oldTitle) {
      return {
        ...s,
        ...updatedSubj,
        unitSnippets: s.unitSnippets && s.unitSnippets.length > 0 ? s.unitSnippets : [
          `${updatedSubj.title || s.title} Unit 1 fundamental concepts.`,
          `${updatedSubj.title || s.title} Unit 2 problem solving.`,
          `${updatedSubj.title || s.title} Unit 3 practical implementations.`
        ]
      };
    }
    return s;
  });
  saveSubjectsFor(year, branch, semester, updated);

  // Also update any custom documents referencing the old subject title
  if (typeof window !== 'undefined' && updatedSubj.title && updatedSubj.title !== oldTitle) {
    try {
      const raw = localStorage.getItem('notehub_custom_documents');
      if (raw) {
        const customDocs: NoteDocument[] = JSON.parse(raw);
        const docsUpdated = customDocs.map((d) =>
          d.subject === oldTitle ? { ...d, subject: updatedSubj.title! } : d
        );
        localStorage.setItem('notehub_custom_documents', JSON.stringify(docsUpdated));
      }
    } catch {}
  }
}

/**
 * Resolves authentic notes and PYQs specifically for the selected Year, Branch/Group, and Semester.
 * Generates multiple authentic PDF documents for each subject.
 */
export function getDocumentsFor(
  year: YearOption,
  branch: BranchOption,
  semester: SemesterOption
): NoteDocument[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('notehub_custom_documents');
      if (raw) {
        const customDocs: NoteDocument[] = JSON.parse(raw);
        return customDocs.filter(
          (d) => d.year === year && d.branch === branch && d.semester === semester
        );
      }
    } catch {
      // Ignore JSON parse errors
    }
  }
  return [];
}





/**
 * Persists an uploaded document to browser storage so student searches can retrieve it.
 */
export function saveCustomUploadedDocument(doc: NoteDocument) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('notehub_custom_documents');
    const existing: NoteDocument[] = raw ? JSON.parse(raw) : [];
    const updated = [doc, ...existing];
    localStorage.setItem('notehub_custom_documents', JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save custom document', err);
  }
}

/**
 * Removes an uploaded document from browser storage.
 */
export function deleteCustomUploadedDocument(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('notehub_custom_documents');
    if (!raw) return;
    const existing: NoteDocument[] = JSON.parse(raw);
    const updated = existing.filter((d) => d.id !== id);
    localStorage.setItem('notehub_custom_documents', JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to delete custom document', err);
  }
}
