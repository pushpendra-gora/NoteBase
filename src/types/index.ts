export type YearOption = '1st Year' | '2nd Year' | '3rd Year' | '4th Year';
export type Year = YearOption;

export type FirstYearGroup = 'ABCD Group' | 'EFGH Group';

export type StandardBranch =
  | 'CSE(AI&ML)'
  | 'Petroleum Engineering'
  | 'Chemical Engineering'
  | 'Civil Engineering'
  | 'Mechanical Engineering'
  | 'Electrical Engineering'
  | 'Electronics & Communication Engineering';

export type BranchOption =
  | StandardBranch
  | 'Computer Science & Engineering (CSE)'
  | 'Information Technology (IT)'
  | 'Artificial Intelligence & Data Science (AI/DS)'
  | 'Electronics & Communication (ECE)'
  | 'Mechanical Engineering (ME)'
  | 'Civil Engineering (CE)'
  | 'Electrical Engineering (EE)'
  | FirstYearGroup;

export type Branch = BranchOption;

export type SemesterOption =
  | 'Semester 1'
  | 'Semester 2'
  | 'Semester 3'
  | 'Semester 4'
  | 'Semester 5'
  | 'Semester 6'
  | 'Semester 7'
  | 'Semester 8';
export type Semester = SemesterOption;

export type MaterialType = 'All' | 'Notes' | 'PYQ' | 'Lectures';

export interface SubjectMeta {
  title: string;
  code: string;
  unitSnippets?: string[];
  pyqSnippets?: string[];
}

export interface LectureItem {
  id: string;
  title: string;
  subject: string;
  semester: string;
  faculty?: string;
  link?: string;
  videoFileName?: string;
  date: string;
}

export interface NoteDocument {
  id: string;
  title: string;
  subject: string;
  code: string;
  year: YearOption;
  branch: BranchOption;
  semester: SemesterOption;
  type: 'Notes' | 'PYQ';
  pages: number;
  size: string;
  preview: string[];
  owner?: string;
  file_url?: string;
  file_path?: string;
  created_at?: string;
}

export type NoteItem = NoteDocument;

export interface CoordinatorIssue {
  id: string;
  coordinator_id?: string | null;
  coordinator_name: string;
  year: string;
  branch: string;
  subject: string;
  description: string;
  status: 'Open' | 'Resolved';
  admin_reply?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface StudentIssue {
  id: string;
  student_name: string;
  year: string;
  branch: string;
  subject: string;
  description: string;
  status: 'Open' | 'Resolved';
  admin_reply?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface CoordinatorLoginLog {
  id: string;
  coordinator_id?: string | null;
  coordinator_name: string;
  year: string;
  branch: string;
  ip_address?: string | null;
  user_agent?: string | null;
  logged_in_at: string;
}
