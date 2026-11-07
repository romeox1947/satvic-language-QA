from __future__ import annotations

import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel

app = FastAPI(title="Satvic local Whisper worker")
MODEL_NAME = os.getenv("WHISPER_MODEL", "small")
MODEL = WhisperModel(MODEL_NAME, device="auto", compute_type="int8")


@app.get("/health")
def health():
    return {"status": "ready", "engine": "faster-whisper", "model": MODEL_NAME}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form(...)):
    suffix = Path(file.filename or "media.mp4").suffix or ".mp4"
    temp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp_path = temp.name
            while chunk := await file.read(1024 * 1024):
                temp.write(chunk)

        segments, info = MODEL.transcribe(
            temp_path,
            language=language,
            task="transcribe",
            beam_size=5,
            vad_filter=True,
            word_timestamps=True,
        )
        output = [
            {
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": segment.text.strip(),
                "words": [
                    {"start": round(word.start, 3), "end": round(word.end, 3), "text": word.word}
                    for word in (segment.words or [])
                ],
            }
            for segment in segments
        ]
        transcript = " ".join(segment["text"] for segment in output).strip()
        if not transcript:
            raise HTTPException(status_code=422, detail="Whisper found no clear speech in this file.")
        return {"transcript": transcript, "segments": output, "detectedLanguage": info.language, "engine": f"Whisper {MODEL_NAME}"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Whisper could not read this media: {exc}") from exc
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
