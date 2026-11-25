# NoteBase

NoteBase is a college notes and academic resource portal built with Next.js 15, React 19, Tailwind CSS, and Supabase.

## Features

- **Student Portal**: Filter study materials by Year, Branch, Semester, and Subject. Includes inline PDF viewing and video lecture links.
- **Coordinator Dashboard**: Scoped login by Year and Branch to upload notes, PYQs, and lectures directly, as well as manage semester subjects.
- **Admin Portal**: Overview of upload statistics, coordinator management with password controls, and curriculum administration.
- **Supabase Cloud Database**: Relational PostgreSQL database for storing metadata for notes, PYQs, lectures, subjects, and credentials.
- **Google Drive Storage Support**: Integrates with Google Apps Script Web App endpoints for hosting PDF files with zero storage cost.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **UI Library**: React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Database**: Supabase PostgreSQL Client

## Local Setup Guide

1. **Clone the repository and install dependencies:**
   ```bash
   git clone https://github.com/pushpendra-gora/NoteBase.git
   cd NoteBase
   npm install
   ```

2. **Configure Environment Variables:**
   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Add your credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_GOOGLE_DRIVE_WEBHOOK_URL=your-script-url
   ```

3. **Database Setup:**
   Run the SQL statements from `supabase-schema.sql` in your Supabase SQL Editor to initialize all tables (`notes`, `pyqs`, `lectures`, `subjects`, `coordinators`, `admin_credentials`).

4. **Run the development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

## Vercel Deployment

1. Push this repository to your GitHub account.
2. In the Vercel dashboard, click **Add New** > **Project** and select this repository.
3. Add the environment variables from your `.env.local` file under **Environment Variables**.
4. Click **Deploy**.
