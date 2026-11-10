# Satvic Studio — AI Dub QA

A local-first dubbing workflow for creating a target-language video with Sarvam and checking it when you do not understand the target language. Choose **Generate with Sarvam** to upload one source, wait for Sarvam to dub and export it, then automatically run the existing transcription and Gemini audio QA comparison. Or choose **I already have a dub** to compare two existing files. Reports show suspected issues with source and dub time ranges; click a time to play that moment. The transcript and back-translation are supporting evidence, not the final result.

## Requirements

- Node.js 20.9+
- Sarvam API key with Dubbing, speech-to-text and translation access
- Gemini API key for direct audio comparison (required for the AI listening report)
- Optional Gmail App Password for email notifications to the signed-in Google account
- Optional Python 3.11 environment for the local Whisper transcription worker

## Setup on Windows

In PowerShell, from this folder:

```powershell
npm install
Copy-Item .env.local.example .env.local
```

Add your keys to `.env.local`:

```text
SARVAM_API_KEY=your_key_here
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
GMAIL_USER=piyushkumaryadav2027@gmail.com
GMAIL_APP_PASSWORD=your_16_character_google_app_password
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
WORKFLOW_INTERNAL_TOKEN=generate_a_long_random_secret
```

## Google sign-in and saved history

The dashboard requires Google sign-in. Supabase stores each user's job metadata and status; row-level security scopes history to the signed-in account. Background workflows use the server-only service role key to save completion and failure status. Keep that key out of browser code and never commit it.

1. Create a Supabase project. In the project dashboard, use **Connect** to copy the Project URL and Publishable key. For the server-only key, open **Settings → API Keys → Secret keys** and create/reveal the default secret key. Put them in `.env.local` using the names above. Never use a `NEXT_PUBLIC_` prefix for the Secret key.
2. In the Supabase SQL editor, run [`supabase/schema.sql`](supabase/schema.sql) to create the `profiles` table for each user's name and role, the private `qa_jobs` table, and their row-level security policies. Re-run it if the project was set up before profile onboarding was added.
3. In **Authentication → Providers → Google**, enable Google. Create a Google OAuth web client in Google Cloud. Add your app origin (`http://localhost:3000` for local development) to the Google authorized JavaScript origins. Add the callback URL shown by Supabase (usually `https://<project-ref>.supabase.co/auth/v1/callback`) to Google authorized redirect URIs, then paste the Google client ID and secret into Supabase.
4. In Supabase **Authentication → URL Configuration**, set the local Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to allowed redirect URLs. For production, add your Vercel app origin and `https://<your-domain>/auth/callback`, then update `NEXT_PUBLIC_APP_URL` in Vercel.
5. Restart `npm run dev` after adding local environment values. The public home page offers **Log in** and **Create account**. Both use Google sign-in; after Google confirms the account, Satvic Studio checks for a saved profile. Existing profiles go to the dashboard and their saved job history. New or older accounts without a profile are asked for a name and role once, then sent to the dashboard. Jobs and QA history load on any device where you sign in.
6. Set `WORKFLOW_INTERNAL_TOKEN` to a long random secret locally and in Vercel. The background workflow uses it to call the protected QA API after Sarvam finishes.

Supabase's Google provider setup and redirect allow-list must match the app callback URLs exactly. See the official [Google sign-in setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) and [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

To use local Whisper for transcription, install and run the worker in a second terminal:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r services/whisper_worker/requirements.txt
uvicorn services.whisper_worker.app:app --host 127.0.0.1 --port 8001
```

Start Next.js in another terminal:

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If the Whisper worker is unavailable, the app extracts audio with bundled FFmpeg and uses Sarvam for transcription.

## Review flow

1. Click **New QA project** and choose the source and dubbed languages.
2. Upload the original video and finished dub.
3. In **Generate with Sarvam** mode, Sarvam receives the original file, creates a dubbed video in the selected target language, and the app downloads that export locally. Dubbing is billed according to your Sarvam account and plan. The existing-dub mode skips this step.
4. Sarvam or the local Whisper worker transcribes both tracks and returns timed segments. Sarvam Translate back-translates the dub transcript as additional evidence.
5. Gemini checks the actual compressed audio tracks and also runs a separate text cross-check using both transcripts and Sarvam back-translation. Findings show whether a matching phrase was flagged by both passes or only one. Times are anchored to ASR segment boundaries when available.
6. While processing, the analysis dialog shows elapsed time, provider stage and progress. The report lists suspected findings with categories and source/dub time ranges. It avoids model-reported confidence percentages; matching audio and text evidence is shown as corroboration, not proof. Click a time button to jump to that moment. Generated Sarvam dubs can also be downloaded from the report. The transcript evidence can be expanded, and the JSON export includes findings and timestamps.

## Preflight, storage and provider checks

The upload dialog has a two-part start gate. The first click performs preflight before any video is uploaded or Sarvam dubbing starts:

1. The server checks that the signed-in user, Blob store, Sarvam key, Gemini key and background-job configuration (for generated dubs) are present.
2. Gemini receives a tiny “reply READY” request using the configured model. This confirms that the key/model responds at that moment. It uses a small amount of Gemini quota; it does not reserve future capacity or guarantee the later audio-review request will fit quota or avoid a 429/503.
3. The browser reads media duration and the server rejects uploads over the current 450 MiB/file limit or clips likely to exceed Gemini’s 18 MiB two-audio request limit (roughly 15–20 minutes at the app’s current audio encoding; generated dubbing uses a more conservative estimate). This protects generated jobs from spending Sarvam dubbing usage on media the existing QA endpoint cannot review in one request.
4. The server lists this app’s `satvic-jobs/` Blob objects, reads their sizes, and estimates whether the selected upload fits. For Sarvam generation it budgets two copies of the source size plus a 50 MiB reserve; for an existing dub it budgets both selected file sizes plus that reserve. `BLOB_STORAGE_LIMIT_BYTES` controls the soft limit and defaults to 1 GiB. Adjust this env var to reflect the storage capacity you want this app to enforce.
5. The dialog shows the estimate and the limits of the check. Review it, and check the Sarvam dashboard’s **Settings → Billing** for available credits. There is no Sarvam balance/reservation check in this app.
6. The second click rechecks storage immediately before upload. If free space is short, the app deletes the oldest inactive media files under `satvic-jobs/` until the estimated job fits. It skips blobs attached to active jobs and media uploaded in the last 10 minutes, and keeps `*-qa-report*.json` reports. Deleted videos can no longer be played or downloaded from history. The existing daily retention job continues to remove expired media automatically.
7. Only after preparation succeeds does the browser upload the source (and, in existing-dub mode, both tracks) to private Blob storage. Generated mode then starts the Sarvam workflow; existing-dub mode starts transcription and QA.

This is an estimate of the current objects in this app’s Blob store. It cannot read Vercel’s account-level monthly-average storage or data-transfer budget, and deleting blobs does not immediately reset those billing/usage meters. Actual output size may differ from the estimate. Gemini’s successful ping does not guarantee later capacity; Sarvam credits and provider availability can also change between preflight and the real request. The app retries a Gemini 503/429 once, then checks `GEMINI_FALLBACK_MODEL` (default `gemini-3.5-flash-lite`), which supports audio input and structured output. If the fallback succeeds, actual analysis requests also fail over to it and the report names the model used. The fallback can have different quality, latency, and pricing, so choose it deliberately. If both models are unavailable, the app stops before video upload/dubbing. Keep the logic in `app/api/jobs/preflight/route.ts`, `app/api/analyze/route.ts`, and this section in sync when replacing storage or AI providers.

### Editing the workflow later

- Change provider readiness checks, storage estimates, safe-cleanup rules, or the soft storage limit in `app/api/jobs/preflight/route.ts`.
- Change which stage runs first or the confirmation copy in `app/dashboard/DashboardClient.tsx`.
- Change the automatic 24-hour cleanup cadence in `vercel.json` and the retention implementation in `app/api/cron/blob-cleanup/route.ts`.
- Keep this README flow and `.env.local.example` updated whenever providers, limits, or retention rules change.

### Transcript timing and clip playback

Sarvam Batch Speech-to-Text provides sentence/phrase timestamps, not word-level timestamps. The QA parser accepts the timestamp field variants returned by Sarvam and normalizes them to timed transcript rows. If a provider response has transcript text but no timing data, the report marks timing coverage incomplete instead of inventing timestamps. Finding and transcript playback waits for the media seek to finish, supports pause/resume, and stops at the selected clip end. Gemini transcript/audio reviews request schema-constrained JSON to avoid malformed model output breaking the review. Indic number tokenization retains Unicode combining marks so number words are not split during the heuristic comparison.

Research references: [Sarvam Batch Speech-to-Text](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/batch-api) documents phrase-level timestamps and the two-hour batch limit. [WhisperX (INTERSPEECH 2023)](https://arxiv.org/abs/2303.00747) describes VAD plus forced phoneme alignment for word-level timing; it is a possible local enhancement, but requires a suitable alignment model for each target language. [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) documents schema-constrained JSON for model responses.

## Background jobs on Vercel

In **Generate with Sarvam** mode, the browser uploads the source to private Vercel Blob storage and starts a Vercel Workflow. Sarvam creates the dub, then the workflow calls the QA API on Vercel. Supabase stores the job history, and Blob stores the media and QA report. The browser can close while the generated dubbing workflow runs; email alerts are sent when it starts and when it completes or fails.

For the deployed app, connect a Vercel Blob store and configure `BLOB_READ_WRITE_TOKEN`, `SARVAM_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`, and `WORKFLOW_INTERNAL_TOKEN`. Keep secret values server-side. `APP_BASE_URL` is optional; use the stable production domain if you set it. If deployment protection is enabled, configure `VERCEL_AUTOMATION_BYPASS_SECRET` for the workflow callback.

For Gmail email alerts, configure `GMAIL_USER=piyushkumaryadav2027@gmail.com` and `GMAIL_APP_PASSWORD` in Vercel. The sender is this Gmail account, and each job's start, completion, or failure notices go to the email address of the user signed into Satvic Studio. To create the app password, first enable 2-Step Verification on that Google account, then create an App Password in its Google Account security settings. Use that generated app password, not the regular Google password. Google may not offer App Passwords for some account configurations; see [Google's App Password requirements](https://support.google.com/mail/answer/185833). Add the same two values in `.env.local` for local testing. Keep the app password private and redeploy Vercel after adding it. Standard Gmail accounts have a daily sending limit, so this is suitable for low-volume job notifications rather than bulk email; see [Gmail sending limits](https://support.google.com/mail/answer/22839).

Vercel Hobby functions can run for up to five minutes. The QA analysis still runs inside a Vercel function, so a long video can hit that limit. If QA times out, try a shorter clip. Generated dubbing waits run durably in the Vercel Workflow, but this does not extend the QA function's time limit. Local background testing needs a Blob token and the local computer/server must stay on. Protect the deployed app with authentication or Vercel Deployment Protection before sharing it.

### Blob media retention

The production Vercel Cron Job calls `/api/cron/blob-cleanup` daily. It deletes original and dubbed media in `satvic-jobs/` only after they are at least 24 hours old, skips media used by queued or running jobs, and keeps the small QA report JSON and Supabase history. On Hobby, actual deletion can happen between 24 and roughly 49 hours after upload because scheduled jobs run once a day with up to 59 minutes of timing variation. After media expires, transcripts and QA findings remain in history, but the videos can no longer be played or downloaded. Vercel storage usage is averaged over time, so the displayed monthly average decreases gradually after deletion. Set `CRON_SECRET` in Vercel to authorize the cleanup route.

AI audio review can miss errors or mishear speech. Findings are model estimates, not a guarantee that a dub is correct. Inline audio comparison is limited to requests under 18 MB; for longer videos, split them into shorter clips and analyze each part.

## Local data and keys

Video and report history is tied to the signed-in Supabase account. The server temporarily extracts compressed audio for Gemini and deletes the temporary files after analysis. Source and dub audio are sent to the configured Sarvam and Gemini APIs. Check those providers' account terms and quotas. `.env.local` is ignored by Git; never commit or share API keys.
