-- =====================================================================
-- NoteBase Supabase Production SQL Schema (Self-Healing & Idempotent)
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- Safe to run multiple times without any errors or duplicate policy conflicts.
-- =====================================================================

-- Enable extensions
create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. TABLES DEFINITIONS
-- =====================================================================

-- 1A. NOTES TABLE (Stores Notes PDF metadata & Google Drive public links)
create table if not exists public.notes (
  id text primary key,
  title text not null,
  year text not null,
  branch text not null,
  semester text not null,
  subject text not null,
  code text default 'DOC101',
  pages integer default 20,
  size text default '3.5 MB',
  owner text default 'Department Faculty',
  file_url text,           -- Google Drive public shareable link
  file_path text,          -- Google Drive file ID
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ensure all columns exist even if table was created previously with older schema
alter table public.notes add column if not exists file_url text;
alter table public.notes add column if not exists file_path text;
alter table public.notes add column if not exists code text default 'DOC101';
alter table public.notes add column if not exists pages integer default 20;
alter table public.notes add column if not exists size text default '3.5 MB';
alter table public.notes add column if not exists owner text default 'Department Faculty';

create index if not exists idx_notes_lookup on public.notes(year, branch, semester, subject);


-- 1B. PYQS TABLE (Stores PYQ PDF metadata & Google Drive public links)
create table if not exists public.pyqs (
  id text primary key,
  title text not null,
  year text not null,
  branch text not null,
  semester text not null,
  subject text not null,
  code text default 'PYQ101',
  pages integer default 20,
  size text default '3.5 MB',
  owner text default 'Department Faculty',
  file_url text,           -- Google Drive public shareable link
  file_path text,          -- Google Drive file ID
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.pyqs add column if not exists file_url text;
alter table public.pyqs add column if not exists file_path text;
alter table public.pyqs add column if not exists code text default 'PYQ101';
alter table public.pyqs add column if not exists pages integer default 20;
alter table public.pyqs add column if not exists size text default '3.5 MB';
alter table public.pyqs add column if not exists owner text default 'Department Faculty';

create index if not exists idx_pyqs_lookup on public.pyqs(year, branch, semester, subject);


-- 1C. DOCUMENTS TABLE (Legacy fallback for backwards compatibility)
create table if not exists public.documents (
  id text primary key,
  title text not null,
  subject text not null,
  code text default 'DOC101',
  year text not null,
  branch text not null,
  semester text not null,
  type text not null default 'Notes',
  pages integer default 20,
  size text default '3.5 MB',
  owner text default 'Department Faculty',
  file_url text,
  file_path text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.documents add column if not exists file_url text;
alter table public.documents add column if not exists file_path text;


-- 2. SUBJECTS TABLE (Dynamic subjects managed by Admin & Coordinators)
create table if not exists public.subjects (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  code text not null,
  year text not null,
  branch text not null,
  semester text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_subjects_lookup on public.subjects(year, branch, semester);


-- 3. LECTURES TABLE (Video classes, YouTube/Drive links)
create table if not exists public.lectures (
  id text primary key,
  title text not null,
  subject text not null,
  semester text not null,
  year text not null,
  branch text not null,
  faculty text default 'Department Faculty',
  link text,
  video_file_url text,
  date text default current_date::text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.lectures add column if not exists faculty text default 'Department Faculty';
alter table public.lectures add column if not exists link text;
alter table public.lectures add column if not exists video_file_url text;

create index if not exists idx_lectures_lookup on public.lectures(year, branch, semester, subject);


-- 4. COORDINATORS TABLE (Stores Coordinators, branch/year assignments, and login passwords)
create table if not exists public.coordinators (
  id text primary key,
  name text not null,
  branch text not null,
  year text not null,
  password text not null default '',
  initials text default '',
  status text not null default 'Active',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.coordinators add column if not exists password text not null default '';
alter table public.coordinators add column if not exists initials text default '';
alter table public.coordinators add column if not exists status text not null default 'Active';

create index if not exists idx_coordinators_lookup on public.coordinators(year, branch);


-- 5. ADMIN CREDENTIALS TABLE (Stores Admin ID, Password, and Google Drive Cloud Sync)
create table if not exists public.admin_credentials (
  id text primary key,
  password text not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.admin_credentials add column if not exists gdrive_webhook text;
alter table public.admin_credentials add column if not exists gdrive_folder_id text;
alter table public.admin_credentials add column if not exists active_drive_id text;
alter table public.admin_credentials add column if not exists gdrive_drives jsonb default '[]'::jsonb;
alter table public.admin_credentials add column if not exists material_counts jsonb;

-- Seed initial admin if empty
insert into public.admin_credentials (id, password)
values ('admin', 'admin123')
on conflict (id) do nothing;


-- 5B. COORDINATOR ISSUES TABLE (Coordinator-submitted issues managed & deleted by Admin)
create table if not exists public.coordinator_issues (
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

alter table public.coordinator_issues add column if not exists coordinator_id text;
alter table public.coordinator_issues add column if not exists admin_reply text;
alter table public.coordinator_issues add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now()) not null;

create index if not exists idx_coordinator_issues_lookup on public.coordinator_issues(year, branch, status);


-- =====================================================================
-- 6. PERMISSIONS & ROW LEVEL SECURITY (RLS) POLICIES
-- Clean, idempotent policies using FOR ALL to ensure SELECT, INSERT,
-- UPDATE, and DELETE all work seamlessly without conflicts or locks.
-- =====================================================================

-- Enable RLS on all tables
alter table public.notes enable row level security;
alter table public.pyqs enable row level security;
alter table public.documents enable row level security;
alter table public.subjects enable row level security;
alter table public.lectures enable row level security;
alter table public.coordinators enable row level security;
alter table public.admin_credentials enable row level security;
alter table public.coordinator_issues enable row level security;

-- Notes Policies (clean drop & recreate)
drop policy if exists "Allow all for notes" on public.notes;
drop policy if exists "Allow public read for notes" on public.notes;
drop policy if exists "Allow insert for notes" on public.notes;
drop policy if exists "Allow update for notes" on public.notes;
drop policy if exists "Allow delete for notes" on public.notes;
create policy "Allow all for notes" on public.notes for all using (true) with check (true);

-- PYQs Policies (clean drop & recreate)
drop policy if exists "Allow all for pyqs" on public.pyqs;
drop policy if exists "Allow public read for pyqs" on public.pyqs;
drop policy if exists "Allow insert for pyqs" on public.pyqs;
drop policy if exists "Allow update for pyqs" on public.pyqs;
drop policy if exists "Allow delete for pyqs" on public.pyqs;
create policy "Allow all for pyqs" on public.pyqs for all using (true) with check (true);

-- Documents Policies
drop policy if exists "Allow all for documents" on public.documents;
drop policy if exists "Allow public read for documents" on public.documents;
drop policy if exists "Allow insert for documents" on public.documents;
drop policy if exists "Allow update for documents" on public.documents;
drop policy if exists "Allow delete for documents" on public.documents;
create policy "Allow all for documents" on public.documents for all using (true) with check (true);

-- Subjects Policies
drop policy if exists "Allow all for subjects" on public.subjects;
drop policy if exists "Allow public read for subjects" on public.subjects;
drop policy if exists "Allow insert for subjects" on public.subjects;
drop policy if exists "Allow update for subjects" on public.subjects;
drop policy if exists "Allow delete for subjects" on public.subjects;
create policy "Allow all for subjects" on public.subjects for all using (true) with check (true);

-- Lectures Policies
drop policy if exists "Allow all for lectures" on public.lectures;
drop policy if exists "Allow public read for lectures" on public.lectures;
drop policy if exists "Allow insert for lectures" on public.lectures;
drop policy if exists "Allow update for lectures" on public.lectures;
drop policy if exists "Allow delete for lectures" on public.lectures;
create policy "Allow all for lectures" on public.lectures for all using (true) with check (true);

-- Coordinators Policies
drop policy if exists "Allow all for coordinators" on public.coordinators;
drop policy if exists "Allow select for coordinators" on public.coordinators;
drop policy if exists "Allow insert for coordinators" on public.coordinators;
drop policy if exists "Allow update for coordinators" on public.coordinators;
drop policy if exists "Allow delete for coordinators" on public.coordinators;
create policy "Allow all for coordinators" on public.coordinators for all using (true) with check (true);

-- Admin Credentials Policies
drop policy if exists "Allow all for admin_credentials" on public.admin_credentials;
drop policy if exists "Allow select for admin_credentials" on public.admin_credentials;
drop policy if exists "Allow insert for admin_credentials" on public.admin_credentials;
drop policy if exists "Allow update for admin_credentials" on public.admin_credentials;
drop policy if exists "Allow delete for admin_credentials" on public.admin_credentials;
create policy "Allow all for admin_credentials" on public.admin_credentials for all using (true) with check (true);

-- Coordinator Issues Policies
drop policy if exists "Allow all for coordinator_issues" on public.coordinator_issues;
create policy "Allow all for coordinator_issues" on public.coordinator_issues for all using (true) with check (true);

-- Grant public API permissions to Supabase roles
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

-- =====================================================================
-- 7. OPTIONAL STRICT PRODUCTION RLS LOCKDOWN
-- IMPORTANT: Run the commented statements below ONLY AFTER adding
-- SUPABASE_SERVICE_ROLE_KEY and ADMIN_SESSION_SECRET in Vercel Env Vars!
-- Once active, browser `anon` keys can NEVER read or write credentials,
-- and only Next.js server APIs (with service_role) can manage staff tables.
-- =====================================================================
-- drop policy if exists "Allow all for admin_credentials" on public.admin_credentials;
-- create policy "Deny anon for admin_credentials" on public.admin_credentials for all to anon, authenticated using (false) with check (false);
-- drop policy if exists "Allow all for coordinators" on public.coordinators;
-- create policy "Deny anon for coordinators" on public.coordinators for all to anon, authenticated using (false) with check (false);
-- drop policy if exists "Allow all for coordinator_issues" on public.coordinator_issues;
-- create policy "Deny anon for coordinator_issues" on public.coordinator_issues for all to anon, authenticated using (false) with check (false);
