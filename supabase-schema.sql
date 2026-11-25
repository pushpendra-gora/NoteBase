-- =====================================================================
-- NoteBase Supabase Database & Storage Setup SQL Schema
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
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
  file_url text,           -- Google Drive public link
  file_path text,          -- Google Drive file ID / path
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

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
  file_url text,           -- Google Drive public link
  file_path text,          -- Google Drive file ID / path
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_pyqs_lookup on public.pyqs(year, branch, semester, subject);

-- (Optional legacy documents table kept for backward compatibility if needed)
create table if not exists public.documents (
  id text primary key,
  title text not null,
  subject text not null,
  code text default 'DOC101',
  year text not null,
  branch text not null,
  semester text not null,
  type text not null check (type in ('Notes', 'PYQ')),
  pages integer default 20,
  size text default '3.5 MB',
  owner text default 'Department Faculty',
  file_url text,
  file_path text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. SUBJECTS TABLE (Stores branch/semester dynamic subjects)
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

-- 3. LECTURES TABLE (Stores video classes, YouTube/Drive links)
create table if not exists public.lectures (
  id text primary key,
  title text not null,
  subject text not null,
  semester text not null,
  year text not null,
  branch text not null,
  faculty text,
  link text,
  video_file_url text,
  date text default current_date::text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_lectures_lookup on public.lectures(year, branch, semester, subject);

-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- Allow public read/write access to notes, pyqs, documents, subjects, and lectures
alter table public.notes enable row level security;
alter table public.pyqs enable row level security;
alter table public.documents enable row level security;
alter table public.subjects enable row level security;
alter table public.lectures enable row level security;

-- Notes Policies
create policy "Allow public read for notes" on public.notes for select using (true);
create policy "Allow insert for notes" on public.notes for insert with check (true);
create policy "Allow update for notes" on public.notes for update using (true);
create policy "Allow delete for notes" on public.notes for delete using (true);

-- PYQs Policies
create policy "Allow public read for pyqs" on public.pyqs for select using (true);
create policy "Allow insert for pyqs" on public.pyqs for insert with check (true);
create policy "Allow update for pyqs" on public.pyqs for update using (true);
create policy "Allow delete for pyqs" on public.pyqs for delete using (true);

-- Documents Policies
create policy "Allow public read for documents"
  on public.documents for select
  using (true);

create policy "Allow insert for documents"
  on public.documents for insert
  with check (true);

create policy "Allow update for documents"
  on public.documents for update
  using (true);

create policy "Allow delete for documents"
  on public.documents for delete
  using (true);

-- Subjects Policies
create policy "Allow public read for subjects"
  on public.subjects for select
  using (true);

create policy "Allow insert for subjects"
  on public.subjects for insert
  with check (true);

create policy "Allow update for subjects"
  on public.subjects for update
  using (true);

create policy "Allow delete for subjects"
  on public.subjects for delete
  using (true);

-- Lectures Policies
create policy "Allow public read for lectures"
  on public.lectures for select
  using (true);

create policy "Allow insert for lectures"
  on public.lectures for insert
  with check (true);

create policy "Allow update for lectures"
  on public.lectures for update
  using (true);

create policy "Allow delete for lectures"
  on public.lectures for delete
  using (true);

-- 5. COORDINATORS TABLE (Stores branch coordinators and their passwords)
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

create index if not exists idx_coordinators_lookup on public.coordinators(year, branch);

alter table public.coordinators enable row level security;

create policy "Allow select for coordinators"
  on public.coordinators for select
  using (true);

create policy "Allow insert for coordinators"
  on public.coordinators for insert
  with check (true);

create policy "Allow update for coordinators"
  on public.coordinators for update
  using (true);

create policy "Allow delete for coordinators"
  on public.coordinators for delete
  using (true);

-- 6. ADMIN CREDENTIALS TABLE (Stores Admin ID & Password)
create table if not exists public.admin_credentials (
  id text primary key,             -- e.g. 'admin'
  password text not null,          -- admin password
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.admin_credentials enable row level security;

create policy "Allow select for admin_credentials"
  on public.admin_credentials for select
  using (true);

create policy "Allow insert for admin_credentials"
  on public.admin_credentials for insert
  with check (true);

create policy "Allow update for admin_credentials"
  on public.admin_credentials for update
  using (true);

-- Insert default admin credentials if not already present
insert into public.admin_credentials (id, password)
values ('admin', 'admin123')
on conflict (id) do nothing;
