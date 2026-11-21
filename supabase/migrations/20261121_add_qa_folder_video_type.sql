alter table public.qa_folders
  add column if not exists video_type text
  check (video_type in ('short', 'long'));
