# Plan: Dictation Refactor — Pure Recording + Server-Side Transcription

**Date:** 2026-02-19
**Status:** Draft — awaiting approval
**Approach chosen:** Option A (uniform experience, drop SpeechRecognition entirely)

---

## Problem

- `VoiceDictation` uses the browser's `SpeechRecognition` API for live speech-to-text
- Firefox doesn't support this API → dictation button silently disappears for Firefox users
- The live transcript is no longer shown to participants anyway — so SpeechRecognition adds complexity with no participant-facing benefit
- Two parallel systems (SpeechRecognition + MediaRecorder) run simultaneously, creating more failure surface

---

## Current architecture (simplified)

```
Participant clicks "Dictate"
  └─ VoiceDictation (SpeechRecognition) → transcript → fills textarea (hidden from view)
  └─ FeedbackQuestionnaire MediaRecorder → audio blob → uploaded to dictation-audio bucket

On submit:
  textarea text → experiment_responses.{field_name}   (text column)
  audio blobs  → dictation-audio bucket               (researcher listens in ResponseDetails)
```

**Key insight:** The requirement gate is already `typedWords ≥ 35 OR recordingSeconds ≥ 20`.
Audio-only (≥20s) already satisfies submission — text columns just end up empty.

---

## Proposed architecture

```
Participant clicks "Record"
  └─ FeedbackQuestionnaire MediaRecorder → audio blob → uploaded to dictation-audio bucket
     (same infrastructure already in place, no change)

On submit:
  audio blobs  → dictation-audio bucket  (unchanged)
  text columns → empty string / null     (for audio-only participants)

Async (after submit, background):
  Edge Function "transcribe-dictation"
    └─ downloads audio blobs from storage per field
    └─ sends to Whisper API
    └─ writes transcript → experiment_responses.{field_name}
    └─ researcher sees it in ResponseDetails once it arrives
```

---

## What changes

### 1. Remove `VoiceDictation` from `FeedbackQuestionnaire`
- Delete all three `<VoiceDictation>` component uses (one per feedback field)
- Remove `VoiceDictation` imports, refs (`experienceDictationRef`, etc.), and the `onDictationError` / `onListeningChange` handler wiring
- Remove `stopAllDictation`, `stopOtherDictationSessions` (they wrap VoiceDictation's `stopListening`)

### 2. Add a simple `<RecordButton>` component (new file)
- Pure MediaRecorder trigger — no SpeechRecognition
- Two states: idle → recording → idle
- Props: `onStart`, `onStop`, `isRecording`, `disabled`
- Works in Chrome, Firefox, Safari, Edge — everything that supports MediaRecorder
- No `VoiceDictationRef` needed; parent (FeedbackQuestionnaire) already controls MediaRecorder directly

### 3. Wire RecordButton to existing MediaRecorder logic
- `onStart` → call existing `startOrResumeDictationRecording(field)` (already exists)
- `onStop` → call existing `pauseDictationRecording(field)` / `persistDictationSegment(field)` (already exists)
- The MediaRecorder lifecycle in FeedbackQuestionnaire is **unchanged** — just a new trigger surface

### 4. Participant UI copy update
- Current tip: *"Record your answer for each question (at least 20 seconds). You can also type below if you prefer."* — this stays accurate
- Remove any mention of "dictate" or "dictation" in button labels → use "Record" / "Stop"
- The VoiceDictation button previously showed "Dictate" — RecordButton shows "Record"

### 5. Submission: allow audio-only (text columns empty)
- Already works: `isRequirementMet = typedWords ≥ 35 OR recordingSeconds ≥ 20`
- No gate change needed — the 20-second recording is already sufficient to submit

### 6. New Edge Function: `transcribe-dictation`
- **Trigger:** Called from the existing `mark-session-complete` (or `submit-questionnaire`) Edge Function after a successful submission
- **Input:** `prolific_id`, `call_id`, list of fields to transcribe
- **Logic per field:**
  1. Query `dictation_recordings` table for all audio blobs for this `prolific_id` + `field`
  2. Download each from `dictation-audio` storage bucket
  3. If multiple clips: concatenate audio blobs in-memory (or send individually and join transcripts)
  4. POST to Whisper API → get transcript text
  5. Update `experiment_responses.{field_name}` with the transcript (only if column is currently empty, to avoid overwriting typed text)
- **Error handling:** Silently logs failures; does not block the participant's submission flow
- **Researcher visibility:** Transcript appears in ResponseDetails once available (no UI change needed — it just populates the existing text field display)

---

## Q4: Transcription service options

| Service | Accuracy | Speed | Cost | Setup |
|---|---|---|---|---|
| **OpenAI Whisper API** | Excellent | ~2–5s per min of audio | $0.006/min | Need OpenAI API key |
| **Groq Whisper** | Same model | ~0.5s per min (much faster) | Free tier generous | Need Groq API key |
| **Deepgram** | Excellent | Fast | ~$0.004/min | Need Deepgram API key |

**Recommendation: Groq Whisper**
Same Whisper accuracy, significantly faster (relevant if you ever want near-real-time), and the free tier (10 min audio/min rate limit) easily covers study-scale volumes. Groq uses the same API format as OpenAI so switching later is trivial.

---

## What's NOT changing
- The `MediaRecorder` recording + upload pipeline in `FeedbackQuestionnaire` — unchanged
- The `dictation_recordings` table and storage bucket — unchanged
- The 20-second minimum requirement — unchanged
- The researcher's audio playback in ResponseDetails — unchanged
- The `feedback_page_context` diagnostic logging — still fires on load
- Typed-text responses — work exactly as before

---

## Files touched

| File | Change |
|---|---|
| `src/components/VoiceDictation.tsx` | Kept (used elsewhere?) or removed if unused after this |
| `src/components/RecordButton.tsx` | **New** — simple record/stop button |
| `src/pages/FeedbackQuestionnaire.tsx` | Remove VoiceDictation wiring, add RecordButton; minor copy tweak |
| `supabase/functions/transcribe-dictation/index.ts` | **New** Edge Function |
| `supabase/functions/mark-session-complete/index.ts` | Add call to `transcribe-dictation` after submit |

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| MediaRecorder not available (very old browser) | Very low | Show "recording not supported" message (same as current VoiceDictation null render, but with text) |
| Transcription API down | Low | Failure is silent; text column stays empty; researcher listens to audio instead |
| Audio clips fragmented (multiple short clips per field) | Possible | Join transcripts in order, or concatenate blobs before sending to Whisper |
| Typed text overwritten by transcript | Won't happen | Only update text column if currently empty |

---

## Acceptance tests

1. **Firefox:** Record button appears and works; audio uploads; submission succeeds
2. **Chrome:** Same — no regression
3. **Audio-only participant:** Submits with 20s recording, empty text field; transcript populates in ResponseDetails async
4. **Typed-only participant:** Submits with ≥35 words, no recording; text column populated; no transcription triggered
5. **Mixed participant:** Types some text, also records; typed text preserved (transcript doesn't overwrite)

---

## Open questions before implementing

- Do you have an API key for Groq or OpenAI already, or will you need to create one?
- Is `VoiceDictation.tsx` used anywhere other than `FeedbackQuestionnaire`? (If not, it can be deleted)
- Should the `transcribe-dictation` function be triggered by `mark-session-complete` or `submit-questionnaire`? (Need to check which one fires reliably on final submission)
