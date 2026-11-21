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

-- Optional Backblaze B2 archive for the complete report and both video tracks.
alter table public.qa_jobs alter column original_blob_url drop not null;
alter table public.qa_jobs add column if not exists original_b2_key text;
alter table public.qa_jobs add column if not exists dubbed_b2_key text;
alter table public.qa_jobs add column if not exists report_b2_key text;

-- User-owned folders for grouping dubbed video projects.
create table if not exists public.qa_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  video_type text check (video_type in ('short', 'long')),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
alter table public.qa_folders add column if not exists video_type text check (video_type in ('short', 'long'));
update public.qa_folders set video_type = 'short' where video_type is null;
alter table public.qa_folders add column if not exists feedback_form_url text;
alter table public.qa_folders add column if not exists feedback_sheet_url text;

create unique index if not exists qa_folders_user_name_idx on public.qa_folders (user_id, lower(name));
alter table public.qa_folders enable row level security;
drop policy if exists "Users can read their own folders" on public.qa_folders;
drop policy if exists "Users can create their own folders" on public.qa_folders;
  drop policy if exists "Users can update their own folders" on public.qa_folders;
drop policy if exists "Users can delete their own folders" on public.qa_folders;
create policy "Users can read their own folders" on public.qa_folders for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their own folders" on public.qa_folders for insert to authenticated with check ((select auth.uid()) = user_id);
  create policy "Users can update their own folders" on public.qa_folders for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete their own folders" on public.qa_folders for delete to authenticated using ((select auth.uid()) = user_id);
  grant select, insert, update, delete on public.qa_folders to authenticated;

alter table public.qa_jobs add column if not exists folder_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qa_jobs_folder_user_fkey') then
    alter table public.qa_jobs add constraint qa_jobs_folder_user_fkey
      foreign key (folder_id, user_id) references public.qa_folders (id, user_id);
  end if;
end $$;
create index if not exists qa_jobs_folder_user_created_idx on public.qa_jobs (user_id, folder_id, created_at desc);
notify pgrst, 'reload schema';
