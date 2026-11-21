alter table public.qa_folders
  add column if not exists video_type text
  check (video_type in ('short', 'long'));

update public.qa_folders
set video_type = 'short'
where video_type is null;
