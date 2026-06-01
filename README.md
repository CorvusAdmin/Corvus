# Corvus

Because Managing the Work Is Work

Corvus is a workload management app for property managers. It supports authenticated users, per-user schedules, task queues, unavailable time, recurring obligations, and generated daily/weekly/monthly schedule views.

## Features

- Supabase signup, login, logout, and persisted sessions
- Protected schedule dashboard
- Per-user schedules and schedule items
- Task queue with due dates, estimates, notes, categories, and completion tracking
- Preset and custom categories
- Workday and work-hour settings
- Unavailable time blocks with recurrence support
- Recurring task generation
- CSV export and print support

## Setup

1. Create a Supabase project.
2. Run the SQL in `supabase-rls.sql` from the Supabase SQL editor.
3. Copy `.env.example` to `.env` for local development.
4. Add your Supabase values:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Use the project URL only for `VITE_SUPABASE_URL`. Do not include `/rest/v1` or any Auth path.

5. Install and run locally:

```powershell
npm install
npm run dev
```

## Vercel

Add these environment variables in the Vercel project settings:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then deploy from GitHub. Vercel will run the Vite build.

## Files

- `index.html` - app markup
- `styles.css` - visual design
- `app.js` - app logic, Supabase auth, and scheduling
- `supabase-rls.sql` - tables, indexes, RLS, and policies
- `assets/` - Corvus logo assets
