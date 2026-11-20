alter table public.qa_jobs
  add column if not exists qa_checkpoint_blob_url text;

notify pgrst, 'reload schema';
