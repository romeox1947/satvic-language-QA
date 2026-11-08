# Satvic Studio — AI Dub QA

A local-first dubbing workflow for creating a target-language video with Sarvam and checking it when you do not understand the target language. Choose **Generate with Sarvam** to upload one source, wait for Sarvam to dub and export it, then automatically run the existing transcription and Gemini audio QA comparison. Or choose **I already have a dub** to compare two existing files. Reports show suspected issues with source and dub time ranges; click a time to play that moment. The transcript and back-translation are supporting evidence, not the final result.

## Requirements

- Node.js 20.9+
- Sarvam API key with Dubbing, speech-to-text and translation access
- Gemini API key for direct audio comparison (required for the AI listening report)
- Optional Resend account/API key for email notifications when a generated job succeeds or fails
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
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=onboarding@resend.dev
NOTIFICATION_EMAIL=piyushkumaryadav2027@gmail.com
```

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

## Server-side jobs on Vercel

In **Generate with Sarvam** mode, the browser uploads the source directly to private Vercel Blob storage and starts a Vercel Workflow. Sarvam dubbing and QA continue on Vercel if the browser closes; the dashboard saves the workflow ID in that browser and checks the saved job when you return. The QA report and private media remain in the workflow result and Blob storage.

Before using this flow on Vercel:

1. In the Vercel project, create a Blob store and connect it to this project. Vercel supplies `BLOB_READ_WRITE_TOKEN` automatically.
2. Set `SARVAM_API_KEY` and `GEMINI_API_KEY` in the Vercel project environment variables.
3. For email alerts, add `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. `NOTIFICATION_EMAIL` defaults to `piyushkumaryadav2027@gmail.com`; set it only if you want a different recipient. Resend's `onboarding@resend.dev` sender is for initial testing; verify your sending domain with Resend before using a custom sender for ongoing delivery.
4. Set `APP_BASE_URL` to the deployed HTTPS URL if the Vercel deployment URL is not available to the workflow runtime. If you enable Vercel Deployment Protection, also set `VERCEL_AUTOMATION_BYPASS_SECRET` to that project's protection bypass secret so the workflow can call the QA API.
5. Redeploy after connecting storage and setting variables.

With Resend configured, the generated dubbing-and-QA workflow emails when Sarvam starts processing, then again when QA completes or the workflow fails. The dashboard confirms whether email alerts are enabled when a job starts and tells you when it is safe to close the browser. If Resend is not configured, the job still runs and its dashboard result is unaffected; the server logs that notifications were skipped.

Local background testing also requires a Blob store token in `.env.local`; local workflows do not keep running if the computer is turned off. Protect the deployed app with Vercel Deployment Protection or add app authentication before sharing it: the upload and job APIs are intended for the app owner and should not be left open to public traffic.

Vercel Hobby functions are limited to 300 seconds per function invocation. Sarvam dubbing waits are durable and do not hold a function open, but the QA transcription/audio-review stage still runs within that function limit. Very long media can therefore fail QA or exceed the audio-review provider's inline audio limit; inspect the job status and Vercel Workflow run details for the actual outcome.

AI audio review can miss errors or mishear speech. Findings are model estimates, not a guarantee that a dub is correct. Inline audio comparison is limited to requests under 18 MB; for longer videos, split them into shorter clips and analyze each part.

## Local data and keys

Video previews live in the current browser session and disappear after reload. The server temporarily extracts compressed audio for Gemini and deletes the temporary files after analysis. Source and dub audio are sent to the configured Sarvam and Gemini APIs. Check those providers' account terms and quotas. `.env.local` is ignored by Git; never commit or share API keys.
