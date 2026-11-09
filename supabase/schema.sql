create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  role text not null check (role in ('Founder Office', 'Dubbing & Localization', 'Content / QA Reviewer', 'Admin', 'Other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Users can create their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own profile" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.profiles to authenticated;

create table if not exists public.qa_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id text unique,
  project_name text not null,
  original_name text not null,
  source_language text not null,
  target_language text not null,
  original_blob_url text not null,
  dubbed_blob_url text,
  report_blob_url text,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  issue_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.qa_jobs enable row level security;
drop policy if exists "Users can read their own QA jobs" on public.qa_jobs;
drop policy if exists "Users can create their own QA jobs" on public.qa_jobs;
drop policy if exists "Users can update their own QA jobs" on public.qa_jobs;
drop policy if exists "Users can delete their own QA jobs" on public.qa_jobs;
create policy "Users can read their own QA jobs" on public.qa_jobs for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their own QA jobs" on public.qa_jobs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own QA jobs" on public.qa_jobs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete their own QA jobs" on public.qa_jobs for delete to authenticated using ((select auth.uid()) = user_id);
create index if not exists qa_jobs_user_created_idx on public.qa_jobs (user_id, created_at desc);
grant select, insert, update, delete on public.qa_jobs to authenticated;
