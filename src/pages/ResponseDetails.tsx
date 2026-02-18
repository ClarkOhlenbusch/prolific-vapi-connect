import { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ArrowLeft, 
  User, 
  MessageSquare, 
  Brain, 
  Heart, 
  Lightbulb, 
  Scale,
  Target,
  FileText,
  AlertCircle,
  CheckCircle,
  XCircle,
  ChevronDown,
  Route,
  MousePointer2,
  Play,
  Pause,
  RotateCcw,
  Download,
  Maximize2,
  Minimize2,
  Check,
  Flag,
  AlertTriangle,
  StickyNote,
  BarChart3,
  RefreshCw
} from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ParticipantJourneyModal } from '@/components/researcher/ParticipantJourneyModal';
import { EventType, Replayer, ReplayerEvents } from 'rrweb';
import type { eventWithTime } from '@rrweb/types';
import 'rrweb/dist/rrweb.min.css';
import { toast } from 'sonner';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import {
  buildGuestDemographics,
  buildGuestExperimentResponse,
  buildGuestJourneyEvents,
  buildGuestReplayEvents,
  getGuestParticipantForResponseRouteId,
} from '@/lib/guest-dummy-data';

type Demographics = Tables<'demographics'>;
type NavigationEvent = Tables<'navigation_events'>;
type ParticipantCall = Tables<'participant_calls'>;
type ReplayEvent = eventWithTime;
type MarkerTone = 'info' | 'success' | 'warning' | 'error';

interface ReplayMarker {
  id: string;
  timeMs: number;
  label: string;
  tone: MarkerTone;
}

type FeedbackFieldKey = "voice_assistant_feedback" | "communication_style_feedback" | "experiment_feedback";
type FeedbackInputSourceState = Record<FeedbackFieldKey, { typed: boolean; dictated: boolean }>;
type DictationRecordingsByField = Record<FeedbackFieldKey, DictationRecording[]>;
type DictationUploadSnapshotsByField = Record<FeedbackFieldKey, DictationUploadSnapshot[]>;
type DictationDiagnosticsByField = Record<FeedbackFieldKey, DictationFieldDiagnostics>;
type DictationTranscriptSegmentsByField = Record<FeedbackFieldKey, DictationTranscriptSegment[]>;
type MergedDictationByField = Record<FeedbackFieldKey, MergedDictationAudioState>;
type FeedbackDraftUsage = Record<FeedbackFieldKey, boolean>;

type BacklogDraft = {
  itemType: 'error' | 'feature';
  status: 'open' | 'in_progress' | 'resolved' | 'idea' | 'planned' | 'shipped';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  goal: string;
  proposed: string;
  impact: string;
};

interface DictationRecording {
  id: string;
  field: FeedbackFieldKey;
  createdAt: string;
  attemptCount: number;
  durationMs: number | null;
  storageBucket: string | null;
  storagePath: string | null;
  mimeType: string | null;
  source: 'table' | 'event_snapshot';
  playbackUrl: string | null;
}

interface DictationUploadSnapshot {
  storageBucket: string;
  storagePath: string;
  createdAt: string;
  attemptCount: number;
  durationMs: number | null;
}

interface DictationEventIssue {
  createdAt: string;
  eventType: string;
  message: string;
}

interface DictationTranscriptSegment {
  createdAt: string;
  text: string;
}

interface DictationFieldDiagnostics {
  started: number;
  stopped: number;
  uploadSaved: number;
  uploadFailed: number;
  blocked: number;
  runtimeErrors: number;
  issues: DictationEventIssue[];
}

interface MergedDictationAudioState {
  status: 'none' | 'building' | 'ready' | 'error';
  playbackUrl: string | null;
  durationMs: number | null;
  clipCount: number;
  errorMessage: string | null;
}

const FEEDBACK_FIELD_LABELS: Record<FeedbackFieldKey, string> = {
  voice_assistant_feedback: "Voice Assistant Feedback",
  communication_style_feedback: "Communication Style Feedback",
  experiment_feedback: "Experiment Feedback",
};
const FEEDBACK_FIELDS = Object.keys(FEEDBACK_FIELD_LABELS) as FeedbackFieldKey[];

const LEGACY_RESEARCHER_DRAFT_PLACEHOLDER = "researcher mode draft session";

const isMissingFeedbackValue = (value: string | null | undefined): boolean => {
  if (!value) return true;
  const normalized = value.trim();
  if (!normalized) return true;
  const lowered = normalized.toLowerCase();
  return lowered === "not provided" || lowered === LEGACY_RESEARCHER_DRAFT_PLACEHOLDER;
};

const createEmptyFeedbackInputSourceState = (): FeedbackInputSourceState => ({
  voice_assistant_feedback: { typed: false, dictated: false },
  communication_style_feedback: { typed: false, dictated: false },
  experiment_feedback: { typed: false, dictated: false },
});

const createEmptyDictationRecordingsByField = (): DictationRecordingsByField => ({
  voice_assistant_feedback: [],
  communication_style_feedback: [],
  experiment_feedback: [],
});

const createEmptyDictationUploadSnapshotsByField = (): DictationUploadSnapshotsByField => ({
  voice_assistant_feedback: [],
  communication_style_feedback: [],
  experiment_feedback: [],
});

const createEmptyDictationFieldDiagnostics = (): DictationFieldDiagnostics => ({
  started: 0,
  stopped: 0,
  uploadSaved: 0,
  uploadFailed: 0,
  blocked: 0,
  runtimeErrors: 0,
  issues: [],
});

const createEmptyDictationDiagnosticsByField = (): DictationDiagnosticsByField => ({
  voice_assistant_feedback: createEmptyDictationFieldDiagnostics(),
  communication_style_feedback: createEmptyDictationFieldDiagnostics(),
  experiment_feedback: createEmptyDictationFieldDiagnostics(),
});

const createEmptyDictationTranscriptSegmentsByField = (): DictationTranscriptSegmentsByField => ({
  voice_assistant_feedback: [],
  communication_style_feedback: [],
  experiment_feedback: [],
});

const createEmptyMergedDictationAudioState = (): MergedDictationAudioState => ({
  status: 'none',
  playbackUrl: null,
  durationMs: null,
  clipCount: 0,
  errorMessage: null,
});

const createEmptyMergedDictationByField = (): MergedDictationByField => ({
  voice_assistant_feedback: createEmptyMergedDictationAudioState(),
  communication_style_feedback: createEmptyMergedDictationAudioState(),
  experiment_feedback: createEmptyMergedDictationAudioState(),
});

const createEmptyFeedbackDraftUsage = (): FeedbackDraftUsage => ({
  voice_assistant_feedback: false,
  communication_style_feedback: false,
  experiment_feedback: false,
});

type ProlificExportDemographics = Pick<Tables<'prolific_export_demographics'>, 'age' | 'gender' | 'ethnicity_simplified'>;

interface ExperimentResponseWithDemographics extends Tables<'experiment_responses'> {
  demographics?: Demographics | null;
  prolificExportDemographics?: ProlificExportDemographics | null;
}

// Question definitions
const PETS_ITEMS = [
  { id: "E1", text: "Cali considered my mental state.", key: "e1", subscale: "Emotional Responsiveness" },
  { id: "E2", text: "Cali seemed emotionally intelligent.", key: "e2", subscale: "Emotional Responsiveness" },
  { id: "E3", text: "Cali expressed emotions.", key: "e3", subscale: "Emotional Responsiveness" },
  { id: "E4", text: "Cali sympathized with me.", key: "e4", subscale: "Emotional Responsiveness" },
  { id: "E5", text: "Cali showed interest in me.", key: "e5", subscale: "Emotional Responsiveness" },
  { id: "E6", text: "Cali supported me in coping with an emotional situation.", key: "e6", subscale: "Emotional Responsiveness" },
  { id: "U1", text: "Cali understood my goals.", key: "u1", subscale: "Understanding and Trust" },
  { id: "U2", text: "Cali understood my needs.", key: "u2", subscale: "Understanding and Trust" },
  { id: "U3", text: "I trusted Cali.", key: "u3", subscale: "Understanding and Trust" },
  { id: "U4", text: "Cali understood my intentions.", key: "u4", subscale: "Understanding and Trust" },
];

const TIAS_ITEMS = [
  { id: "T1", text: "Cali is deceptive.", key: "tias_1", isReversed: true },
  { id: "T2", text: "Cali behaves in an underhanded manner.", key: "tias_2", isReversed: true },
  { id: "T3", text: "I am suspicious of Cali's intent, action, or output.", key: "tias_3", isReversed: true },
  { id: "T4", text: "I am wary of Cali.", key: "tias_4", isReversed: true },
  { id: "T5", text: "Cali's action will have a harmful or injurious outcome.", key: "tias_5", isReversed: true },
  { id: "T6", text: "I am confident in Cali.", key: "tias_6", isReversed: false },
  { id: "T7", text: "Cali provides security.", key: "tias_7", isReversed: false },
  { id: "T8", text: "Cali has integrity.", key: "tias_8", isReversed: false },
  { id: "T9", text: "Cali is dependable.", key: "tias_9", isReversed: false },
  { id: "T10", text: "Cali is reliable.", key: "tias_10", isReversed: false },
  { id: "T11", text: "I can trust Cali.", key: "tias_11", isReversed: false },
  { id: "T12", text: "I am familiar with Cali.", key: "tias_12", isReversed: false },
];

const GODSPEED_ANTHRO_ITEMS = [
  { id: "A1", leftLabel: "Fake", rightLabel: "Natural", key: "godspeed_anthro_1" },
  { id: "A2", leftLabel: "Machinelike", rightLabel: "Humanlike", key: "godspeed_anthro_2" },
  { id: "A3", leftLabel: "Unconscious", rightLabel: "Conscious", key: "godspeed_anthro_3" },
  { id: "A4", leftLabel: "Artificial", rightLabel: "Lifelike", key: "godspeed_anthro_4" },
];

const GODSPEED_LIKE_ITEMS = [
  { id: "L1", leftLabel: "Dislike", rightLabel: "Like", key: "godspeed_like_1" },
  { id: "L2", leftLabel: "Unfriendly", rightLabel: "Friendly", key: "godspeed_like_2" },
  { id: "L3", leftLabel: "Unkind", rightLabel: "Kind", key: "godspeed_like_3" },
  { id: "L4", leftLabel: "Unpleasant", rightLabel: "Pleasant", key: "godspeed_like_4" },
  { id: "L5", leftLabel: "Awful", rightLabel: "Nice", key: "godspeed_like_5" },
];

const GODSPEED_INTEL_ITEMS = [
  { id: "I1", leftLabel: "Incompetent", rightLabel: "Competent", key: "godspeed_intel_1" },
  { id: "I2", leftLabel: "Ignorant", rightLabel: "Knowledgeable", key: "godspeed_intel_2" },
  { id: "I3", leftLabel: "Irresponsible", rightLabel: "Responsible", key: "godspeed_intel_3" },
  { id: "I4", leftLabel: "Unintelligent", rightLabel: "Intelligent", key: "godspeed_intel_4" },
  { id: "I5", leftLabel: "Foolish", rightLabel: "Sensible", key: "godspeed_intel_5" },
];

const INTENTION_QUESTIONS = [
  "If available, I intend to start using voice assistants like Cali within the next month.",
  "If available, in the next months, I plan to experiment or regularly use voice assistants like Cali.",
];

const FORMALITY_SCALE_LABELS = [
  { value: 1, label: "Extremely Informal" },
  { value: 2, label: "Very Informal" },
  { value: 3, label: "Mostly Informal" },
  { value: 4, label: "Neutral" },
  { value: 5, label: "Mostly Formal" },
  { value: 6, label: "Very Formal" },
  { value: 7, label: "Extremely Formal" },
];

const INTENTION_SCALE_LABELS = ["Not at all", "Slightly", "Somewhat", "Moderately", "Quite a bit", "Very", "Extremely"];

const FAMILIARITY_LABELS: { [key: number]: string } = {
  1: "Not familiar at all",
  2: "Somewhat familiar",
  3: "Moderately familiar",
  4: "Very familiar",
  5: "Completely familiar",
};

const USAGE_FREQUENCY_LABELS: { [key: number]: string } = {
  1: "Never",
  2: "More than once a year",
  3: "More than once a month",
  4: "More than once a week",
  5: "More than once a day",
};

const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'N/A';
  return Number(value).toFixed(2);
};

const formatWholeNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'N/A';
  return Math.round(Number(value)).toString();
};

// TIPI Items for Big Five personality
const TIPI_ITEMS = [
  { id: "T1", text: "Extraverted, enthusiastic", key: "tipi_1", dimension: "Extraversion", isReversed: false },
  { id: "T2", text: "Critical, quarrelsome", key: "tipi_2", dimension: "Agreeableness", isReversed: true },
  { id: "T3", text: "Dependable, self-disciplined", key: "tipi_3", dimension: "Conscientiousness", isReversed: false },
  { id: "T4", text: "Anxious, easily upset", key: "tipi_4", dimension: "Emotional Stability", isReversed: true },
  { id: "T5", text: "Open to new experiences, complex", key: "tipi_5", dimension: "Openness", isReversed: false },
  { id: "T6", text: "Reserved, quiet", key: "tipi_6", dimension: "Extraversion", isReversed: true },
  { id: "T7", text: "Sympathetic, warm", key: "tipi_7", dimension: "Agreeableness", isReversed: false },
  { id: "T8", text: "Disorganized, careless", key: "tipi_8", dimension: "Conscientiousness", isReversed: true },
  { id: "T9", text: "Calm, emotionally stable", key: "tipi_9", dimension: "Emotional Stability", isReversed: false },
  { id: "T10", text: "Conventional, uncreative", key: "tipi_10", dimension: "Openness", isReversed: true },
];

const TIPI_DIMENSIONS = [
  { key: "tipi_extraversion", label: "Extraversion" },
  { key: "tipi_agreeableness", label: "Agreeableness" },
  { key: "tipi_conscientiousness", label: "Conscientiousness" },
  { key: "tipi_emotional_stability", label: "Emotional Stability" },
  { key: "tipi_openness", label: "Openness" },
];

const MIC_STATE_LABELS: Record<string, string> = {
  granted: "Granted",
  denied: "Denied",
  prompt: "Prompt",
  unsupported: "Unsupported",
  error: "Error",
  unknown: "Unknown",
};

const formatMicPermission = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return MIC_STATE_LABELS[normalized] || "Unknown";
};

const formatMicAudio = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "detected") return "Detected";
    if (normalized === "not_detected") return "Not detected";
    if (normalized === "error") return "Error";
  }
  if (typeof value === "boolean") {
    return value ? "Detected" : "Not detected";
  }
  return "Unknown";
};

const shouldReplaceDiagnosticValue = (currentValue: string | null, nextValue: string | null): boolean => {
  if (!nextValue) return false;
  if (!currentValue) return true;
  if (currentValue === "Unknown" && nextValue !== "Unknown") return true;
  if (currentValue !== "Unknown" && nextValue === "Unknown") return false;
  return true;
};

const formatMicSummary = (practice?: string | null, main?: string | null): string => {
  const parts: string[] = [];
  if (practice) parts.push(`Practice: ${practice}`);
  if (main) parts.push(`Main: ${main}`);
  return parts.length ? parts.join(" • ") : "Unknown";
};

const formatDuration = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const isFeedbackField = (value: unknown): value is FeedbackFieldKey => (
  typeof value === "string"
  && value in FEEDBACK_FIELD_LABELS
);

const formatFeedbackInputSource = (typed: boolean, dictated: boolean): string => {
  if (typed && dictated) return "Typed + Dictated";
  if (typed) return "Typed";
  if (dictated) return "Dictated";
  return "Not captured";
};

const formatDictationIssueType = (eventType: string): string => {
  if (eventType === 'dictation_recording_upload_error') return 'Upload failed';
  if (eventType === 'dictation_start_blocked') return 'Start blocked';
  if (eventType === 'dictation_recording_error') return 'Recorder error';
  if (eventType === 'dictation_error') return 'Dictation error';
  return 'Issue';
};

const isBlobUrl = (url: string | null | undefined): boolean => {
  return typeof url === 'string' && url.startsWith('blob:');
};

const buildFeedbackTextModeParts = (
  fullText: string,
  dictatedSegments: string[],
): Array<{ text: string; mode: 'typed' | 'dictated' }> => {
  if (!dictatedSegments.length) {
    return [{ text: fullText, mode: 'typed' }];
  }

  const parts: Array<{ text: string; mode: 'typed' | 'dictated' }> = [];
  let cursor = 0;

  dictatedSegments.forEach((segment) => {
    if (!segment) return;
    let matchedSegment = segment;
    let index = fullText.indexOf(matchedSegment, cursor);
    if (index === -1) {
      const trimmed = segment.trim();
      if (!trimmed) return;
      matchedSegment = trimmed;
      index = fullText.indexOf(trimmed, cursor);
    }
    if (index === -1) return;

    if (index > cursor) {
      parts.push({
        text: fullText.slice(cursor, index),
        mode: 'typed',
      });
    }

    parts.push({
      text: matchedSegment,
      mode: 'dictated',
    });
    cursor = index + matchedSegment.length;
  });

  if (cursor < fullText.length) {
    parts.push({
      text: fullText.slice(cursor),
      mode: 'typed',
    });
  }

  if (!parts.length) {
    return [{ text: fullText, mode: 'typed' }];
  }

  return parts;
};

const resolveAudioDurationMs = async (playbackUrl: string): Promise<number | null> => {
  return new Promise((resolve) => {
    const audio = new Audio();
    const cleanup = () => {
      audio.removeAttribute('src');
      audio.load();
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const durationMs = Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : null;
      cleanup();
      resolve(durationMs && durationMs > 0 ? durationMs : null);
    };
    audio.onerror = () => {
      cleanup();
      resolve(null);
    };
    audio.src = playbackUrl;
  });
};

const encodeAudioBufferToWav = (buffer: AudioBuffer): Blob => {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples * blockAlign;
  const bufferSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  let offset = 0;
  const writeString = (value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
    offset += value.length;
  };

  writeString('RIFF');
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeString('WAVE');
  writeString('fmt ');
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, channels, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeString('data');
  view.setUint32(offset, dataSize, true);
  offset += 4;

  const channelData: Float32Array[] = [];
  for (let channel = 0; channel < channels; channel += 1) {
    channelData.push(buffer.getChannelData(channel));
  }

  for (let i = 0; i < samples; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const raw = channelData[channel]?.[i] ?? 0;
      const sample = Math.max(-1, Math.min(1, raw));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
};

const mergeAudioUrlsIntoWav = async (playbackUrls: string[]): Promise<{ playbackUrl: string; durationMs: number }> => {
  if (playbackUrls.length < 2) {
    throw new Error('Need at least two clips to merge.');
  }
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined' || typeof window.OfflineAudioContext === 'undefined') {
    throw new Error('Audio merge is not supported in this browser.');
  }

  const decodeContext = new window.AudioContext();
  let decodedBuffers: AudioBuffer[] = [];
  try {
    decodedBuffers = await Promise.all(playbackUrls.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch clip (${response.status})`);
      }
      const bytes = await response.arrayBuffer();
      return await decodeContext.decodeAudioData(bytes.slice(0));
    }));
  } finally {
    await decodeContext.close();
  }

  if (!decodedBuffers.length) {
    throw new Error('No decodable clips available.');
  }

  const sampleRate = Math.max(...decodedBuffers.map((buffer) => buffer.sampleRate));
  const channelCount = Math.max(...decodedBuffers.map((buffer) => buffer.numberOfChannels));
  const totalDurationSeconds = decodedBuffers.reduce((sum, buffer) => sum + buffer.duration, 0);
  const totalFrames = Math.max(1, Math.ceil(totalDurationSeconds * sampleRate));
  const offlineContext = new window.OfflineAudioContext(channelCount, totalFrames, sampleRate);

  let startTimeSeconds = 0;
  decodedBuffers.forEach((buffer) => {
    const source = offlineContext.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineContext.destination);
    source.start(startTimeSeconds);
    startTimeSeconds += buffer.duration;
  });

  const renderedBuffer = await offlineContext.startRendering();
  const wavBlob = encodeAudioBufferToWav(renderedBuffer);
  return {
    playbackUrl: URL.createObjectURL(wavBlob),
    durationMs: Math.max(0, Math.round(renderedBuffer.duration * 1000)),
  };
};

const SessionReplayPanel = ({
  events,
  markers,
}: {
  events: ReplayEvent[];
  markers: ReplayMarker[];
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const playerRootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const replayerRef = useRef<Replayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(2);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [totalTimeMs, setTotalTimeMs] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const hasRenderableReplay = events.some((event) => event.type === EventType.FullSnapshot);

  const fitReplayToViewport = useCallback(() => {
    const root = playerRootRef.current;
    const viewport = viewportRef.current;
    if (!root || !viewport) return;

    const wrapper = root.querySelector<HTMLElement>('.replayer-wrapper');
    if (!wrapper) return;

    const viewportRect = viewport.getBoundingClientRect();
    const rawWidth = wrapper.offsetWidth;
    const rawHeight = wrapper.offsetHeight;
    if (!viewportRect.width || !viewportRect.height || !rawWidth || !rawHeight) return;

    const padding = 12;
    const availableWidth = Math.max(1, viewportRect.width - padding * 2);
    const availableHeight = Math.max(1, viewportRect.height - padding * 2);
    const scale = Math.max(0.1, Math.min(availableWidth / rawWidth, availableHeight / rawHeight));
    const scaledWidth = rawWidth * scale;
    const scaledHeight = rawHeight * scale;
    const left = Math.max(0, (viewportRect.width - scaledWidth) / 2);
    const top = Math.max(0, (viewportRect.height - scaledHeight) / 2);

    root.style.position = 'relative';
    root.style.width = '100%';
    root.style.height = '100%';
    root.style.overflow = 'hidden';

    wrapper.style.position = 'absolute';
    wrapper.style.left = `${left}px`;
    wrapper.style.top = `${top}px`;
    wrapper.style.transformOrigin = 'top left';
    wrapper.style.transform = `scale(${scale})`;
    wrapper.style.margin = '0';
  }, []);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTimeMs(0);
    setTotalTimeMs(0);

    const root = playerRootRef.current;
    const viewport = viewportRef.current;
    if (!(root instanceof Element) || !(viewport instanceof Element)) return;
    root.innerHTML = '';

    if (!events.length || !hasRenderableReplay) {
      if (replayerRef.current) {
        replayerRef.current.destroy();
        replayerRef.current = null;
      }
      return;
    }

    const replayer = new Replayer(events, {
      root,
      mouseTail: true,
      skipInactive: false,
      showWarning: false,
      showDebug: false,
    });

    replayerRef.current = replayer;
    replayer.setConfig({ speed });

    const meta = replayer.getMetaData();
    setTotalTimeMs(meta.totalTime || 0);

    const handleFinish = () => {
      const endTime = replayer.getMetaData().totalTime || 0;
      setCurrentTimeMs(endTime);
      setIsPlaying(false);
    };
    const handleSnapshotRebuild = () => {
      fitReplayToViewport();
    };
    replayer.on(ReplayerEvents.Finish, handleFinish);
    replayer.on(ReplayerEvents.FullsnapshotRebuilded, handleSnapshotRebuild);

    const rafId = window.requestAnimationFrame(() => {
      fitReplayToViewport();
    });
    const fitTimers = [
      window.setTimeout(() => fitReplayToViewport(), 40),
      window.setTimeout(() => fitReplayToViewport(), 180),
      window.setTimeout(() => fitReplayToViewport(), 420),
    ];
    const resizeHandler = () => fitReplayToViewport();
    window.addEventListener('resize', resizeHandler);
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => fitReplayToViewport())
      : null;
    if (resizeObserver) {
      resizeObserver.observe(viewport);
      resizeObserver.observe(root);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      fitTimers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('resize', resizeHandler);
      resizeObserver?.disconnect();
      replayer.off(ReplayerEvents.Finish, handleFinish);
      replayer.off(ReplayerEvents.FullsnapshotRebuilded, handleSnapshotRebuild);
      replayer.pause();
      replayer.destroy();
      if (replayerRef.current === replayer) {
        replayerRef.current = null;
      }
    };
  }, [events, hasRenderableReplay, fitReplayToViewport]);

  useEffect(() => {
    replayerRef.current?.setConfig({ speed });
  }, [speed]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      const replayer = replayerRef.current;
      if (!replayer) return;
      setCurrentTimeMs(Math.max(0, replayer.getCurrentTime()));
    }, 120);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === panelRef.current;
      setIsFullscreen(active);
      fitReplayToViewport();
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [fitReplayToViewport]);

  if (!events.length) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No replay events captured for this participant yet.
      </p>
    );
  }

  if (!hasRenderableReplay) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Replay chunks exist, but no full snapshot was captured. Run a fresh session after this update.
      </p>
    );
  }

  const handlePlayPause = () => {
    const replayer = replayerRef.current;
    if (!replayer) return;

    if (isPlaying) {
      replayer.pause();
      setCurrentTimeMs(Math.max(0, replayer.getCurrentTime()));
      setIsPlaying(false);
      return;
    }

    const endTime = replayer.getMetaData().totalTime || totalTimeMs;
    const shouldRestart = currentTimeMs >= Math.max(0, endTime - 200);
    const startAt = shouldRestart ? 0 : currentTimeMs;
    replayer.play(startAt);
    setCurrentTimeMs(startAt);
    setIsPlaying(true);
  };

  const handleReset = () => {
    const replayer = replayerRef.current;
    if (!replayer) return;
    replayer.pause(0);
    setCurrentTimeMs(0);
    setIsPlaying(false);
  };

  const handleSeek = (value: number) => {
    const replayer = replayerRef.current;
    if (!replayer) return;
    replayer.pause(value);
    setCurrentTimeMs(value);
    setIsPlaying(false);
  };

  const handleMarkerClick = (timeMs: number) => {
    handleSeek(timeMs);
  };

  const handleToggleFullscreen = async () => {
    const panel = panelRef.current;
    if (!panel) return;
    try {
      if (document.fullscreenElement === panel) {
        await document.exitFullscreen();
      } else if (!document.fullscreenElement) {
        await panel.requestFullscreen();
      }
    } catch (error) {
      console.error('Unable to toggle fullscreen replay:', error);
    }
  };

  const downloadReplayJson = () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'session-replay-events.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const markerColorClass: Record<MarkerTone, string> = {
    info: 'bg-sky-500',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-rose-500',
  };

  return (
    <div
      ref={panelRef}
      className={cn(
        "space-y-4",
        isFullscreen && "bg-background p-4 md:p-6"
      )}
    >
      <div className={cn("flex flex-wrap items-center gap-2", isFullscreen && "sticky top-0 z-20 bg-background pb-2")}>
        <Button
          size="sm"
          variant="outline"
          onClick={handlePlayPause}
        >
          {isPlaying ? <Pause className="h-4 w-4 mr-1.5" /> : <Play className="h-4 w-4 mr-1.5" />}
          {isPlaying ? 'Pause' : 'Play'}
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-1.5" />
          Reset
        </Button>
        <Button size="sm" variant="outline" onClick={handleToggleFullscreen}>
          {isFullscreen ? <Minimize2 className="h-4 w-4 mr-1.5" /> : <Maximize2 className="h-4 w-4 mr-1.5" />}
          {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
        </Button>
        <Button size="sm" variant="outline" onClick={downloadReplayJson}>
          <Download className="h-4 w-4 mr-1.5" />
          Download JSON
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {[1, 2, 4].map((value) => (
            <Button
              key={value}
              size="sm"
              variant={speed === value ? 'default' : 'outline'}
              onClick={() => setSpeed(value as 1 | 2 | 4)}
            >
              {value}x
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <input
            type="range"
            min={0}
            max={Math.max(1, totalTimeMs)}
            value={Math.min(currentTimeMs, Math.max(1, totalTimeMs))}
            onChange={(event) => handleSeek(Number(event.target.value))}
            className="relative z-10 w-full cursor-pointer accent-blue-500"
          />
          {totalTimeMs > 0 && markers.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 h-4">
              {markers.map((marker) => {
                const left = Math.max(0, Math.min(100, (marker.timeMs / totalTimeMs) * 100));
                return (
                  <button
                    type="button"
                    key={marker.id}
                    onClick={() => handleMarkerClick(marker.timeMs)}
                    className={`pointer-events-auto absolute top-0 h-4 w-0.5 ${markerColorClass[marker.tone]} cursor-pointer`}
                    style={{ left: `${left}%` }}
                    title={`${marker.label} (${formatDuration(marker.timeMs)})`}
                    aria-label={`Jump to ${marker.label}`}
                  />
                );
              })}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Events: {events.length}</span>
          <span>Elapsed: {formatDuration(currentTimeMs)} / {formatDuration(totalTimeMs)}</span>
          <span>Markers: {markers.length}</span>
        </div>
        {markers.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded border text-xs">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr className="text-left text-muted-foreground">
                  <th className="px-2 py-1 font-medium w-16">Time</th>
                  <th className="px-2 py-1 font-medium">Event</th>
                </tr>
              </thead>
              <tbody>
                {[...markers].sort((a, b) => a.timeMs - b.timeMs).map((marker) => (
                  <tr
                    key={`${marker.id}-legend`}
                    className="cursor-pointer hover:bg-muted/40 border-t border-border/50"
                    onClick={() => handleMarkerClick(marker.timeMs)}
                    title={`Jump to ${formatDuration(marker.timeMs)}`}
                  >
                    <td className="px-2 py-1 font-mono text-muted-foreground whitespace-nowrap">
                      {formatDuration(marker.timeMs)}
                    </td>
                    <td className="px-2 py-1">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${markerColorClass[marker.tone]}`} />
                        <span className="text-muted-foreground">{marker.label}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div
        ref={viewportRef}
        className={cn(
          "relative w-full rounded-md border bg-black overflow-hidden",
          isFullscreen ? "h-[calc(100vh-230px)]" : "h-[420px] md:h-[560px]"
        )}
      >
        <div ref={playerRootRef} className="absolute inset-0" />
      </div>
    </div>
  );
};

// Section navigation items - in experiment flow order
const SECTIONS = [
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'evaluation', label: 'Call evaluation', icon: BarChart3 },
  { id: 'journey', label: 'Journey', icon: Route },
  { id: 'replay', label: 'Replay', icon: MousePointer2 },
  { id: 'demographics', label: 'Demographics', icon: User },
  { id: 'attention', label: 'Attention Checks', icon: AlertCircle },
  { id: 'formality', label: 'Formality', icon: Scale },
  { id: 'pets', label: 'PETS', icon: Heart },
  { id: 'tias', label: 'TIAS', icon: Brain },
  { id: 'godspeed', label: 'Godspeed', icon: Lightbulb },
  { id: 'tipi', label: 'TIPI', icon: User },
  { id: 'intention', label: 'Intention', icon: Target },
  { id: 'feedback', label: 'Feedback', icon: MessageSquare },
];

const ResponseDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isGuestMode, user } = useResearcherAuth();
  const [data, setData] = useState<ExperimentResponseWithDemographics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPendingRecord, setIsPendingRecord] = useState(false);
  const [nonSubmittedStatus, setNonSubmittedStatus] = useState<'pending' | 'abandoned' | null>(null);
  const [formalityCalcId, setFormalityCalcId] = useState<string | null>(null);
  const [journeyModalOpen, setJourneyModalOpen] = useState(false);
  const [createBatchDialog, setCreateBatchDialog] = useState<{ open: boolean; batchLabel: string | null }>({ open: false, batchLabel: null });
  const [journeyDiagnostics, setJourneyDiagnostics] = useState<{
    practice: { micPermission?: string | null; micAudio?: string | null };
    main: { micPermission?: string | null; micAudio?: string | null };
    feedback: { micPermission?: string | null; micAudio?: string | null };
  } | null>(null);
  const [feedbackInputSources, setFeedbackInputSources] = useState<FeedbackInputSourceState>(createEmptyFeedbackInputSourceState());
  const [feedbackDraftUsage, setFeedbackDraftUsage] = useState<FeedbackDraftUsage>(createEmptyFeedbackDraftUsage());
  const [feedbackDraftSavedAt, setFeedbackDraftSavedAt] = useState<string | null>(null);
  const [dictationRecordingsByField, setDictationRecordingsByField] = useState<DictationRecordingsByField>(createEmptyDictationRecordingsByField());
  const [dictationDiagnosticsByField, setDictationDiagnosticsByField] = useState<DictationDiagnosticsByField>(createEmptyDictationDiagnosticsByField());
  const [dictationTranscriptSegmentsByField, setDictationTranscriptSegmentsByField] = useState<DictationTranscriptSegmentsByField>(createEmptyDictationTranscriptSegmentsByField());
  const [showIndividualClipsByField, setShowIndividualClipsByField] = useState<Record<FeedbackFieldKey, boolean>>({
    voice_assistant_feedback: false,
    communication_style_feedback: false,
    experiment_feedback: false,
  });
  const [resolvedClipDurationsById, setResolvedClipDurationsById] = useState<Record<string, number>>({});
  const [mergedDictationByField, setMergedDictationByField] = useState<MergedDictationByField>(createEmptyMergedDictationByField());
  const mergedAudioUrlsRef = useRef<Partial<Record<FeedbackFieldKey, string>>>({});
  const [replayEvents, setReplayEvents] = useState<ReplayEvent[]>([]);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayLoadingMore, setReplayLoadingMore] = useState(false);
  const [replayBatchProgress, setReplayBatchProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [replayMarkers, setReplayMarkers] = useState<ReplayMarker[]>([]);
  const [pendingMarkerEvents, setPendingMarkerEvents] = useState<Pick<NavigationEvent, 'call_id' | 'page_name' | 'event_type' | 'metadata' | 'created_at'>[]>([]);
  const [researcherNotesDraft, setResearcherNotesDraft] = useState('');
  const [researcherNotesSaving, setResearcherNotesSaving] = useState(false);
  const [dictationDownloadId, setDictationDownloadId] = useState<string | null>(null);
  const [futureFeaturesDialogOpen, setFutureFeaturesDialogOpen] = useState(false);
  const [futureFeaturesSaving, setFutureFeaturesSaving] = useState(false);
  const [futureFeaturesDraft, setFutureFeaturesDraft] = useState<BacklogDraft>({
    itemType: 'feature',
    status: 'idea',
    priority: 'medium',
    title: '',
    goal: '',
    proposed: '',
    impact: '',
  });
  const [runEvaluationLoading, setRunEvaluationLoading] = useState(false);
  const [checkResultsLoading, setCheckResultsLoading] = useState(false);
  const sectionRefs = useRef<{ [key: string]: HTMLElement | null }>({});

  const setMergedFieldState = useCallback((field: FeedbackFieldKey, next: MergedDictationAudioState) => {
    setMergedDictationByField((prev) => {
      const previousUrl = prev[field]?.playbackUrl;
      if (previousUrl && previousUrl !== next.playbackUrl && isBlobUrl(previousUrl)) {
        URL.revokeObjectURL(previousUrl);
      }
      if (next.playbackUrl) {
        mergedAudioUrlsRef.current[field] = next.playbackUrl;
      } else {
        delete mergedAudioUrlsRef.current[field];
      }
      return {
        ...prev,
        [field]: next,
      };
    });
  }, []);

  const resetMergedFieldState = useCallback(() => {
    setMergedDictationByField((prev) => {
      FEEDBACK_FIELDS.forEach((field) => {
        const previousUrl = prev[field]?.playbackUrl;
        if (previousUrl && isBlobUrl(previousUrl)) {
          URL.revokeObjectURL(previousUrl);
        }
      });
      return createEmptyMergedDictationByField();
    });
    mergedAudioUrlsRef.current = {};
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      const fetchStartedAt = performance.now();
      console.info('[ResponseDetails] Fetching response details', { id });

      setIsLoading(true);
      setJourneyDiagnostics(null);
      setFeedbackInputSources(createEmptyFeedbackInputSourceState());
      setFeedbackDraftUsage(createEmptyFeedbackDraftUsage());
      setFeedbackDraftSavedAt(null);
      setDictationRecordingsByField(createEmptyDictationRecordingsByField());
      setDictationDiagnosticsByField(createEmptyDictationDiagnosticsByField());
      setDictationTranscriptSegmentsByField(createEmptyDictationTranscriptSegmentsByField());
      setShowIndividualClipsByField({
        voice_assistant_feedback: false,
        communication_style_feedback: false,
        experiment_feedback: false,
      });
      setResolvedClipDurationsById({});
      resetMergedFieldState();
      setReplayEvents([]);
      setReplayLoading(false);
      setReplayLoadingMore(false);
      setReplayBatchProgress(null);
      setReplayMarkers([]);
      setPendingMarkerEvents([]);
      try {
        setIsPendingRecord(false);

        if (isGuestMode) {
          const guestParticipant = getGuestParticipantForResponseRouteId(id);
          if (!guestParticipant) {
            setError('Demo response not found');
            setData(null);
            return;
          }

          const response = buildGuestExperimentResponse(guestParticipant, id) as unknown as ExperimentResponseWithDemographics;
          const demographics = buildGuestDemographics(guestParticipant) as unknown as Demographics;

          // For demo mode, render a lightweight synthetic session replay and journey events.
          const navigationEvents = buildGuestJourneyEvents(guestParticipant) as unknown as NavigationEvent[];
          const replayStartMs = Date.parse(String(response.created_at || guestParticipant.created_at || new Date().toISOString()));
          setReplayEvents(buildGuestReplayEvents(replayStartMs) as unknown as ReplayEvent[]);

          setIsPendingRecord(guestParticipant.status !== 'Completed');
          setFormalityCalcId(null);
          setData({ ...response, demographics });

          // Reuse the existing diagnostics + marker pipeline with the synthetic navigation events.
          if (navigationEvents) {
            const scopedNavigationEvents = navigationEvents.filter((event: NavigationEvent) => {
              if (!response.call_id) return true;
              return !event.call_id || event.call_id === response.call_id;
            });
            const diagnostics = {
              practice: { micPermission: null, micAudio: null },
              main: { micPermission: null, micAudio: null },
              feedback: { micPermission: null, micAudio: null },
            };
            const nextFeedbackInputSources = createEmptyFeedbackInputSourceState();
            const nextDictationDiagnosticsByField = createEmptyDictationDiagnosticsByField();
            const nextDictationTranscriptSegmentsByField = createEmptyDictationTranscriptSegmentsByField();

            scopedNavigationEvents.forEach((event: NavigationEvent) => {
              const pageKey = event.page_name === 'practice-conversation'
                ? 'practice'
                : event.page_name === 'voice-conversation'
                  ? 'main'
                  : null;
              const metadata = (event.metadata || {}) as Record<string, unknown>;
              const feedbackField = isFeedbackField(metadata.field) ? metadata.field : null;

              const isFeedbackPageEvent = event.page_name === 'feedback';
              const isFeedbackDictationEvent = isFeedbackPageEvent
                && (
                  metadata.context === 'dictation'
                  || Boolean(feedbackField)
                );

              if (feedbackField) {
                const fieldDiagnostics = nextDictationDiagnosticsByField[feedbackField];
                if (event.event_type === 'dictation_started') {
                  fieldDiagnostics.started += 1;
                } else if (event.event_type === 'dictation_stopped') {
                  fieldDiagnostics.stopped += 1;
                } else if (event.event_type === 'dictation_recording_uploaded') {
                  fieldDiagnostics.uploadSaved += 1;
                } else if (event.event_type === 'dictation_recording_upload_error') {
                  fieldDiagnostics.uploadFailed += 1;
                  fieldDiagnostics.issues.push({
                    createdAt: event.created_at,
                    eventType: event.event_type,
                    message: typeof metadata.message === 'string' && metadata.message
                      ? metadata.message
                      : 'Upload failed',
                  });
                } else if (event.event_type === 'dictation_start_blocked') {
                  fieldDiagnostics.blocked += 1;
                  fieldDiagnostics.issues.push({
                    createdAt: event.created_at,
                    eventType: event.event_type,
                    message: typeof metadata.reasonCode === 'string' && metadata.reasonCode
                      ? metadata.reasonCode
                      : 'Microphone access blocked',
                  });
                } else if (event.event_type === 'dictation_error' || event.event_type === 'dictation_recording_error') {
                  if (event.event_type === 'dictation_recording_error') {
                    fieldDiagnostics.runtimeErrors += 1;
                  }
                  const message = [
                    typeof metadata.errorCode === 'string' ? metadata.errorCode : null,
                    typeof metadata.message === 'string' ? metadata.message : null,
                  ].filter(Boolean).join(': ');
                  fieldDiagnostics.issues.push({
                    createdAt: event.created_at,
                    eventType: event.event_type,
                    message: message || 'Dictation error',
                  });
                }

                if (event.event_type === 'dictation_transcript_appended') {
                  const appendedText = typeof metadata.text === 'string' ? metadata.text : '';
                  if (appendedText) {
                    nextDictationTranscriptSegmentsByField[feedbackField].push({
                      createdAt: event.created_at,
                      text: appendedText,
                    });
                  }
                }
              }

              if (pageKey && event.event_type === 'mic_permission') {
                const permissionValue = formatMicPermission(metadata.state as string | null);
                if (shouldReplaceDiagnosticValue(diagnostics[pageKey].micPermission, permissionValue)) {
                  diagnostics[pageKey].micPermission = permissionValue;
                }
              }
              if (pageKey && event.event_type === 'call_preflight_result') {
                const permissionValue = formatMicPermission(metadata.state as string | null);
                if (shouldReplaceDiagnosticValue(diagnostics[pageKey].micPermission, permissionValue)) {
                  diagnostics[pageKey].micPermission = permissionValue;
                }
              }
              if (pageKey && event.event_type === 'mic_audio_check') {
                const micAudioValue = formatMicAudio(metadata.detected);
                if (shouldReplaceDiagnosticValue(diagnostics[pageKey].micAudio, micAudioValue)) {
                  diagnostics[pageKey].micAudio = micAudioValue;
                }
              }
              if (isFeedbackPageEvent && event.event_type === 'mic_permission') {
                const stateOrPermission = (metadata.state ?? metadata.permissionState) as string | null;
                const permissionValue = formatMicPermission(stateOrPermission);
                if (shouldReplaceDiagnosticValue(diagnostics.feedback.micPermission, permissionValue)) {
                  diagnostics.feedback.micPermission = permissionValue;
                }
              }
              if (isFeedbackPageEvent && event.event_type === 'mic_audio_check') {
                const micAudioValue = formatMicAudio(metadata.detected);
                if (shouldReplaceDiagnosticValue(diagnostics.feedback.micAudio, micAudioValue)) {
                  diagnostics.feedback.micAudio = micAudioValue;
                }
              }
              if (isFeedbackDictationEvent && event.event_type === 'dictation_start_blocked') {
                const blockedPermissionValue = formatMicPermission(metadata.permissionState as string | null);
                if (shouldReplaceDiagnosticValue(diagnostics.feedback.micPermission, blockedPermissionValue)) {
                  diagnostics.feedback.micPermission = blockedPermissionValue;
                }
              }

              if (event.event_type === 'feedback_input_mode') {
                const mode = metadata.mode;
                const field = metadata.field;
                if (isFeedbackField(field) && (mode === 'typed' || mode === 'dictated')) {
                  nextFeedbackInputSources[field][mode] = true;
                }
              }
            });

            setPendingMarkerEvents(scopedNavigationEvents);
            setJourneyDiagnostics(diagnostics);
            setFeedbackInputSources(nextFeedbackInputSources);
            setDictationDiagnosticsByField(nextDictationDiagnosticsByField);
            setDictationTranscriptSegmentsByField(nextDictationTranscriptSegmentsByField);
            setFeedbackDraftSavedAt(null);
          }

          // No dictation audio blobs in guest mode (keep UI lightweight).
          setDictationRecordingsByField(createEmptyDictationRecordingsByField());
          return;
        }

        // Try experiment_responses lookup first (submitted or draft)
        const { data: completedResponse, error: completedResponseError } = await supabase
          .from('experiment_responses')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (completedResponseError) throw completedResponseError;

        let response: ExperimentResponseWithDemographics | null = completedResponse;
        if (response && (response as any).submission_status && (response as any).submission_status !== 'submitted') {
          setIsPendingRecord(true);
          setNonSubmittedStatus((response as any).submission_status === 'abandoned' ? 'abandoned' : 'pending');
        }

        // Fallback for pending records: route id corresponds to participant_calls.id
        if (!response) {
          const { data: pendingCall, error: pendingCallError } = await supabase
            .from('participant_calls')
            .select('*')
            .eq('id', id)
            .maybeSingle();

          if (pendingCallError) throw pendingCallError;
          if (!pendingCall) throw new Error('Response not found');

          // If the route came from a pending row but a completed response now exists for the same call,
          // load the completed response instead of showing pending placeholders.
          const { data: completedByCall, error: completedByCallError } = await supabase
            .from('experiment_responses')
            .select('*')
            .eq('prolific_id', pendingCall.prolific_id)
            .eq('call_id', pendingCall.call_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (completedByCallError) throw completedByCallError;

          if (completedByCall) {
            response = completedByCall as ExperimentResponseWithDemographics;
            const status = (completedByCall as any).submission_status;
            const isNonSubmitted = status && status !== 'submitted';
            setIsPendingRecord(Boolean(isNonSubmitted));
            setNonSubmittedStatus(isNonSubmitted ? (status === 'abandoned' ? 'abandoned' : 'pending') : null);
          } else {
            setIsPendingRecord(true);
            setNonSubmittedStatus('pending');
            response = {
              id: pendingCall.id,
              prolific_id: pendingCall.prolific_id,
              call_id: pendingCall.call_id,
              created_at: pendingCall.created_at,
              call_attempt_number: null as unknown as number,
              assistant_type: null,
              batch_label: null,
              pets_total: null as unknown as number,
              pets_er: null as unknown as number,
              pets_ut: null as unknown as number,
              formality: null as unknown as number,
              intention_1: null as unknown as number,
              intention_2: null as unknown as number,
              voice_assistant_feedback: '',
              communication_style_feedback: '',
              experiment_feedback: '',
            } as ExperimentResponseWithDemographics;
          }
        }

        // Fetch demographics and Prolific export demographics
        const [
          { data: demographics },
          { data: prolificExportDemographics },
        ] = await Promise.all([
          supabase
            .from('demographics')
            .select('*')
            .eq('prolific_id', response.prolific_id)
            .maybeSingle(),
          supabase
            .from('prolific_export_demographics')
            .select('age, gender, ethnicity_simplified')
            .eq('prolific_id', response.prolific_id)
            .maybeSingle(),
        ]);

        // Build session replay query with the most specific filters available
        let replayQuery = supabase
          .from('navigation_events')
          .select('metadata, created_at')
          .eq('prolific_id', response.prolific_id)
          .eq('event_type', 'session_replay_chunk')
          .order('created_at', { ascending: true })
          .limit(2000);

        if (response.call_id) {
          replayQuery = replayQuery.eq('call_id', response.call_id);
        }

        const [
          { data: formalityCalc },
          { data: navigationEvents },
        ] = await Promise.all([
          supabase
            .from('formality_calculations')
            .select('id')
            .eq('linked_call_id', response.call_id)
            .maybeSingle(),
          supabase
            .from('navigation_events')
            .select('call_id, page_name, event_type, metadata, created_at')
            .eq('prolific_id', response.prolific_id)
            .in('event_type', [
              'mic_permission',
              'mic_audio_check',
              'call_preflight_result',
              'call_connected',
              'call_start_failed',
              'call_quality_warning',
              'call_error',
              'assistant_audio_timeout',
              'dictation_started',
              'dictation_stopped',
              'dictation_error',
              'dictation_start_blocked',
              'dictation_recording_error',
              'dictation_recording_uploaded',
              'dictation_recording_upload_error',
              'dictation_transcript_appended',
              'feedback_input_mode',
              'feedback_draft_autosave',
            ])
            .order('created_at', { ascending: true }),
        ]);

        let replayStartTimestamp: number | null = null;
        let replayDurationMs = 0;
        const dictationUploadSnapshots = createEmptyDictationUploadSnapshotsByField();
        const latestFeedbackDraft: Partial<Record<FeedbackFieldKey, string>> = {};
        let latestFeedbackDraftSavedAt: string | null = null;
        const processReplayChunks = (chunks: { metadata: unknown; created_at: string }[] | null) => {
          if (!chunks || chunks.length === 0) return;
          const flattenedEvents: ReplayEvent[] = [];
          chunks.forEach((chunk) => {
            const metadata = (chunk.metadata || {}) as Record<string, unknown>;
            const chunkEvents = Array.isArray(metadata.rrwebEvents)
              ? metadata.rrwebEvents
              : Array.isArray(metadata.events)
                ? metadata.events
                : [];

            chunkEvents.forEach((event) => {
              const replayEvent = event as Record<string, unknown>;
              if (typeof replayEvent.type !== 'number') return;
              if (typeof replayEvent.timestamp !== 'number') return;
              flattenedEvents.push(replayEvent as unknown as ReplayEvent);
            });
          });
          if (!flattenedEvents.length) return;
          flattenedEvents.sort((a, b) => a.timestamp - b.timestamp);
          replayStartTimestamp = flattenedEvents[0]?.timestamp || null;
          const replayEndTimestamp = flattenedEvents[flattenedEvents.length - 1]?.timestamp || replayStartTimestamp || 0;
          replayDurationMs = Math.max(0, replayEndTimestamp - (replayStartTimestamp || replayEndTimestamp));
          setReplayEvents(flattenedEvents);
        };

        // Load session replay in the background so the rest of the page
        // does not wait on potentially heavy queries.
        const prolificIdForReplay = response.prolific_id;
        const callIdForReplay = response.call_id;
        void (async () => {
          setReplayLoading(true);
          const replayOverallStart = performance.now();
          const BATCH_SIZE = 25;

          const log = (phase: string, extra: Record<string, unknown> = {}) => {
            console.info(`[SessionReplay] ${phase}`, {
              prolificId: prolificIdForReplay,
              callId: callIdForReplay,
              elapsedMs: Math.round(performance.now() - replayOverallStart),
              ...extra,
            });
          };

          // Helper: flatten raw chunks into sorted rrweb events.
          const flattenChunks = (chunks: { metadata: unknown; created_at: string }[]): ReplayEvent[] => {
            const events: ReplayEvent[] = [];
            chunks.forEach((chunk) => {
              const md = (chunk.metadata || {}) as Record<string, unknown>;
              const arr = Array.isArray(md.rrwebEvents)
                ? md.rrwebEvents
                : Array.isArray(md.events)
                  ? md.events
                  : [];
              arr.forEach((e) => {
                const re = e as Record<string, unknown>;
                if (typeof re.type === 'number' && typeof re.timestamp === 'number') {
                  events.push(re as unknown as ReplayEvent);
                }
              });
            });
            events.sort((a, b) => a.timestamp - b.timestamp);
            return events;
          };

          // Helper: fetch replay chunks in paginated batches, streaming events
          // to the player after the first batch so the user can start watching
          // immediately while remaining batches load in the background.
          const fetchChunksPaginated = async (
            useCallId: boolean,
            totalCount: number,
          ): Promise<{ metadata: unknown; created_at: string }[]> => {
            const allChunks: { metadata: unknown; created_at: string }[] = [];
            const totalBatches = Math.ceil(totalCount / BATCH_SIZE);

            for (let batch = 0; batch < totalBatches; batch++) {
              const from = batch * BATCH_SIZE;
              const to = from + BATCH_SIZE - 1;
              const batchStart = performance.now();

              let query = supabase
                .from('navigation_events')
                .select('metadata, created_at')
                .eq('prolific_id', prolificIdForReplay)
                .eq('event_type', 'session_replay_chunk')
                .order('created_at', { ascending: true })
                .range(from, to);

              if (useCallId && callIdForReplay) {
                query = query.eq('call_id', callIdForReplay);
              }

              const { data, error } = await query;
              if (error) {
                log(`Batch ${batch + 1}/${totalBatches} failed`, {
                  from, to,
                  errorCode: (error as { code?: string }).code,
                  errorMessage: error.message,
                  batchMs: Math.round(performance.now() - batchStart),
                });
                throw error;
              }

              const fetched = data?.length ?? 0;
              allChunks.push(...(data || []));
              setReplayBatchProgress({ loaded: allChunks.length, total: totalCount });
              log(`Batch ${batch + 1}/${totalBatches}`, {
                from, to,
                fetched,
                totalSoFar: allChunks.length,
                batchMs: Math.round(performance.now() - batchStart),
              });

              // After the first batch, show what we have so the user can
              // start watching while remaining batches load.
              if (batch === 0 && fetched > 0 && totalBatches > 1) {
                const partial = flattenChunks(allChunks);
                if (partial.length > 0) {
                  setReplayEvents(partial);
                  setReplayLoading(false);
                  setReplayLoadingMore(true);
                }
              }

              if (fetched < BATCH_SIZE) break; // last page
            }
            return allChunks;
          };

          try {
            // Step 1: Count chunks with call_id filter (fast, no metadata)
            const countStart = performance.now();
            let useCallId = Boolean(callIdForReplay);
            let countQuery = supabase
              .from('navigation_events')
              .select('id', { count: 'exact', head: true })
              .eq('prolific_id', prolificIdForReplay)
              .eq('event_type', 'session_replay_chunk');
            if (useCallId) {
              countQuery = countQuery.eq('call_id', callIdForReplay);
            }

            const { count: callScopedCount, error: countError } = await countQuery;
            log('Step 1: count (call-scoped)', {
              count: callScopedCount ?? 0,
              errorCode: countError ? (countError as { code?: string }).code : null,
              durationMs: Math.round(performance.now() - countStart),
            });

            if (countError) {
              log('Count query failed, skipping replay.');
              return;
            }

            // Step 2: If call-scoped found nothing, try without call_id (legacy data)
            let totalChunks = callScopedCount ?? 0;
            if (totalChunks === 0 && callIdForReplay) {
              const fallbackCountStart = performance.now();
              const { count: fallbackCount, error: fallbackCountError } = await supabase
                .from('navigation_events')
                .select('id', { count: 'exact', head: true })
                .eq('prolific_id', prolificIdForReplay)
                .eq('event_type', 'session_replay_chunk');

              log('Step 2: count (prolific-only fallback)', {
                count: fallbackCount ?? 0,
                errorCode: fallbackCountError ? (fallbackCountError as { code?: string }).code : null,
                durationMs: Math.round(performance.now() - fallbackCountStart),
              });

              if (fallbackCountError || !fallbackCount) {
                if (fallbackCount === 0 || fallbackCount === null) {
                  log('No replay chunks exist for this participant.');
                }
                return;
              }
              totalChunks = fallbackCount;
              useCallId = false;
            }

            if (totalChunks === 0) {
              log('No replay chunks found.');
              return;
            }

            const MAX_REPLAY_CHUNKS = 2000;
            if (totalChunks > MAX_REPLAY_CHUNKS) {
              log(`Too many replay chunks (${totalChunks}), skipping.`, {
                totalChunks,
                maxAllowed: MAX_REPLAY_CHUNKS,
              });
              return;
            }

            // Step 3: Fetch in batches
            log(`Step 3: Fetching ${totalChunks} chunks in batches of ${BATCH_SIZE}`, {
              useCallId,
              totalChunks,
            });

            const chunks = await fetchChunksPaginated(useCallId, totalChunks);
            // Final update with all chunks (replayer resets once with full data)
            processReplayChunks(chunks);
            log('Done', {
              totalChunks: chunks.length,
            });
          } catch (err) {
            log('Failed', {
              error: err instanceof Error ? err.message : String(err),
            });
          } finally {
            setReplayLoading(false);
            setReplayLoadingMore(false);
            setReplayBatchProgress(null);
          }
        })();

        if (navigationEvents) {
          const scopedNavigationEvents = navigationEvents.filter((event: NavigationEvent) => {
            if (!response.call_id) return true;
            return !event.call_id || event.call_id === response.call_id;
          });
          const diagnostics = {
            practice: { micPermission: null, micAudio: null },
            main: { micPermission: null, micAudio: null },
            feedback: { micPermission: null, micAudio: null },
          };
          const nextFeedbackInputSources = createEmptyFeedbackInputSourceState();
          const nextDictationDiagnosticsByField = createEmptyDictationDiagnosticsByField();
          const nextDictationTranscriptSegmentsByField = createEmptyDictationTranscriptSegmentsByField();
          const markers: ReplayMarker[] = [];

          const pageLabel = (pageName: string) => {
            if (pageName === 'practice-conversation') return 'Practice';
            if (pageName === 'voice-conversation') return 'Main';
            if (pageName === 'feedback') return 'Feedback';
            return pageName;
          };

          scopedNavigationEvents.forEach((event: NavigationEvent, index: number) => {
            const pageKey = event.page_name === 'practice-conversation'
              ? 'practice'
              : event.page_name === 'voice-conversation'
                ? 'main'
                : null;
            const metadata = (event.metadata || {}) as Record<string, unknown>;
            const feedbackField = isFeedbackField(metadata.field) ? metadata.field : null;

            const isFeedbackPageEvent = event.page_name === 'feedback';
            const isFeedbackDictationEvent = isFeedbackPageEvent
              && (
                metadata.context === 'dictation'
                || Boolean(feedbackField)
              );

            if (feedbackField) {
              const fieldDiagnostics = nextDictationDiagnosticsByField[feedbackField];
              if (event.event_type === 'dictation_started') {
                fieldDiagnostics.started += 1;
              } else if (event.event_type === 'dictation_stopped') {
                fieldDiagnostics.stopped += 1;
              } else if (event.event_type === 'dictation_recording_uploaded') {
                fieldDiagnostics.uploadSaved += 1;
              } else if (event.event_type === 'dictation_recording_upload_error') {
                fieldDiagnostics.uploadFailed += 1;
                fieldDiagnostics.issues.push({
                  createdAt: event.created_at,
                  eventType: event.event_type,
                  message: typeof metadata.message === 'string' && metadata.message
                    ? metadata.message
                    : 'Upload failed',
                });
              } else if (event.event_type === 'dictation_start_blocked') {
                fieldDiagnostics.blocked += 1;
                fieldDiagnostics.issues.push({
                  createdAt: event.created_at,
                  eventType: event.event_type,
                  message: typeof metadata.reasonCode === 'string' && metadata.reasonCode
                    ? metadata.reasonCode
                    : 'Microphone access blocked',
                });
              } else if (event.event_type === 'dictation_error' || event.event_type === 'dictation_recording_error') {
                if (event.event_type === 'dictation_recording_error') {
                  fieldDiagnostics.runtimeErrors += 1;
                }
                const message = [
                  typeof metadata.errorCode === 'string' ? metadata.errorCode : null,
                  typeof metadata.message === 'string' ? metadata.message : null,
                ].filter(Boolean).join(': ');
                fieldDiagnostics.issues.push({
                  createdAt: event.created_at,
                  eventType: event.event_type,
                  message: message || 'Dictation error',
                });
              }

              if (event.event_type === 'dictation_transcript_appended') {
                const appendedText = typeof metadata.text === 'string' ? metadata.text : '';
                if (appendedText) {
                  nextDictationTranscriptSegmentsByField[feedbackField].push({
                    createdAt: event.created_at,
                    text: appendedText,
                  });
                }
              }
            }

            if (pageKey && event.event_type === 'mic_permission') {
              const permissionValue = formatMicPermission(metadata.state as string | null);
              if (shouldReplaceDiagnosticValue(diagnostics[pageKey].micPermission, permissionValue)) {
                diagnostics[pageKey].micPermission = permissionValue;
              }
            }
            if (pageKey && event.event_type === 'call_preflight_result') {
              const permissionValue = formatMicPermission(metadata.state as string | null);
              if (shouldReplaceDiagnosticValue(diagnostics[pageKey].micPermission, permissionValue)) {
                diagnostics[pageKey].micPermission = permissionValue;
              }
            }
            if (pageKey && event.event_type === 'mic_audio_check') {
              const micAudioValue = formatMicAudio(metadata.detected);
              if (shouldReplaceDiagnosticValue(diagnostics[pageKey].micAudio, micAudioValue)) {
                diagnostics[pageKey].micAudio = micAudioValue;
              }
            }
            if (isFeedbackPageEvent && event.event_type === 'mic_permission') {
              const stateOrPermission = (metadata.state ?? metadata.permissionState) as string | null;
              const permissionValue = formatMicPermission(stateOrPermission);
              if (shouldReplaceDiagnosticValue(diagnostics.feedback.micPermission, permissionValue)) {
                diagnostics.feedback.micPermission = permissionValue;
              }
            }
            if (isFeedbackPageEvent && event.event_type === 'mic_audio_check') {
              const micAudioValue = formatMicAudio(metadata.detected);
              if (shouldReplaceDiagnosticValue(diagnostics.feedback.micAudio, micAudioValue)) {
                diagnostics.feedback.micAudio = micAudioValue;
              }
            }
            if (isFeedbackDictationEvent && event.event_type === 'dictation_start_blocked') {
              const blockedPermissionValue = formatMicPermission(metadata.permissionState as string | null);
              if (shouldReplaceDiagnosticValue(diagnostics.feedback.micPermission, blockedPermissionValue)) {
                diagnostics.feedback.micPermission = blockedPermissionValue;
              }
            }

            if (event.event_type === 'feedback_input_mode') {
              const mode = metadata.mode;
              const field = metadata.field;
              if (isFeedbackField(field) && (mode === 'typed' || mode === 'dictated')) {
                nextFeedbackInputSources[field][mode] = true;
              }
            }

            if (event.event_type === 'feedback_draft_autosave') {
              const responses = (metadata.responses || {}) as Record<string, unknown>;
              (Object.keys(FEEDBACK_FIELD_LABELS) as FeedbackFieldKey[]).forEach((field) => {
                const value = responses[field];
                if (typeof value === 'string') {
                  latestFeedbackDraft[field] = value;
                }
              });
              const inputModes = (metadata.inputModes || {}) as Record<string, unknown>;
              (Object.keys(FEEDBACK_FIELD_LABELS) as FeedbackFieldKey[]).forEach((field) => {
                const fieldModes = (inputModes[field] || {}) as Record<string, unknown>;
                if (fieldModes.typed === true) {
                  nextFeedbackInputSources[field].typed = true;
                }
                if (fieldModes.dictated === true) {
                  nextFeedbackInputSources[field].dictated = true;
                }
              });
              latestFeedbackDraftSavedAt = event.created_at;
            }

            // Dictation upload snapshot tracking for marker events
            if (event.event_type === 'dictation_recording_uploaded') {
              const storagePath = typeof metadata.storagePath === 'string' ? metadata.storagePath : '';
              if (feedbackField && storagePath) {
                const snapshot: DictationUploadSnapshot = {
                  storageBucket: typeof metadata.storageBucket === 'string' && metadata.storageBucket
                    ? metadata.storageBucket
                    : 'dictation-audio',
                  storagePath,
                  createdAt: event.created_at,
                  attemptCount: typeof metadata.attemptCount === 'number' ? metadata.attemptCount : 1,
                  durationMs: typeof metadata.durationMs === 'number' ? metadata.durationMs : null,
                };
                const alreadyTracked = dictationUploadSnapshots[feedbackField].some((existing) => (
                  existing.storagePath === snapshot.storagePath && existing.createdAt === snapshot.createdAt
                ));
                if (!alreadyTracked) {
                  dictationUploadSnapshots[feedbackField].push(snapshot);
                }
              }
            }
          });

          // Save scoped navigation events for marker building (happens in a
          // useEffect once replayEvents are available from background loading).
          setPendingMarkerEvents(scopedNavigationEvents);

          setJourneyDiagnostics(diagnostics);
          setFeedbackInputSources(nextFeedbackInputSources);
          setDictationDiagnosticsByField(nextDictationDiagnosticsByField);
          setDictationTranscriptSegmentsByField(nextDictationTranscriptSegmentsByField);
          setFeedbackDraftSavedAt(latestFeedbackDraftSavedAt);
        }

        try {
          const dictationFetchStartedAt = performance.now();
          const nextRecordings = createEmptyDictationRecordingsByField();
          const { data: dictationRows, error: dictationError } = await supabase
            .from('dictation_recordings' as never)
            .select('id, prolific_id, call_id, field, storage_bucket, storage_path, mime_type, duration_ms, attempt_count, created_at')
            .eq('prolific_id', response.prolific_id)
            .order('created_at', { ascending: true });

          if (dictationError) {
            console.warn('Unable to load dictation recordings:', dictationError.message);
          } else if (Array.isArray(dictationRows)) {
            console.info('[DictationAudio][Replay] Loaded dictation rows', {
              prolificId: response.prolific_id,
              callId: response.call_id,
              rowCount: dictationRows.length,
            });
            const filteredRows = dictationRows.filter((row: Record<string, unknown>) => {
              if (!response.call_id) return true;
              const rowCallId = typeof row.call_id === 'string' ? row.call_id : null;
              return rowCallId === null || rowCallId === response.call_id;
            });
            console.info('[DictationAudio][Replay] Filtered dictation rows by call', {
              prolificId: response.prolific_id,
              callId: response.call_id,
              rowCount: filteredRows.length,
            });

            const resolvedRows = await Promise.all(filteredRows.map(async (row: Record<string, unknown>) => {
              const field = row.field;
              if (!isFeedbackField(field)) return null;

              const storageBucket = typeof row.storage_bucket === 'string' && row.storage_bucket
                ? row.storage_bucket
                : 'dictation-audio';
              const storagePath = typeof row.storage_path === 'string' ? row.storage_path : '';

              let playbackUrl: string | null = null;
              if (storagePath) {
                const { data: signedData, error: signedError } = await supabase.storage
                  .from(storageBucket)
                  .createSignedUrl(storagePath, 60 * 60);
                if (!signedError) {
                  playbackUrl = signedData?.signedUrl || null;
                } else {
                  console.warn('[DictationAudio][Replay] Signed URL failed', {
                    field,
                    storageBucket,
                    storagePath,
                    message: signedError.message,
                  });
                }
              }

              return {
                id: typeof row.id === 'string' ? row.id : `${field}-${row.created_at}`,
                field,
                createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
                attemptCount: typeof row.attempt_count === 'number' ? row.attempt_count : 1,
                durationMs: typeof row.duration_ms === 'number' ? row.duration_ms : null,
                storageBucket,
                storagePath: storagePath || null,
                mimeType: typeof row.mime_type === 'string' ? row.mime_type : null,
                source: 'table',
                playbackUrl,
              } as DictationRecording;
            }));

            resolvedRows.forEach((recording) => {
              if (!recording) return;
              nextRecordings[recording.field].push(recording);
            });
          }

          // Fallback for pending/in-progress sessions and metadata insert failures:
          // resolve each uploaded snapshot event that's missing in dictation_recordings.
          for (const field of Object.keys(FEEDBACK_FIELD_LABELS) as FeedbackFieldKey[]) {
            const snapshots = [...dictationUploadSnapshots[field]]
              .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
            for (const snapshot of snapshots) {
              const alreadyPresent = nextRecordings[field].some((recording) => (
                recording.storagePath
                && snapshot.storagePath
                && recording.storagePath === snapshot.storagePath
              ));
              if (alreadyPresent) continue;

              const { data: signedData, error: signedError } = await supabase.storage
                .from(snapshot.storageBucket)
                .createSignedUrl(snapshot.storagePath, 60 * 60);
              if (signedError) {
                console.warn('[DictationAudio][Replay] Snapshot signed URL failed', {
                  field,
                  storageBucket: snapshot.storageBucket,
                  storagePath: snapshot.storagePath,
                  message: signedError.message,
                });
              } else {
                console.info('[DictationAudio][Replay] Using snapshot fallback audio', {
                  field,
                  storageBucket: snapshot.storageBucket,
                  storagePath: snapshot.storagePath,
                });
              }
              nextRecordings[field].push({
                id: `${field}-${snapshot.createdAt}-${snapshot.storagePath}`,
                field,
                createdAt: snapshot.createdAt,
                attemptCount: snapshot.attemptCount,
                durationMs: snapshot.durationMs,
                storageBucket: snapshot.storageBucket,
                storagePath: snapshot.storagePath,
                mimeType: null,
                source: 'event_snapshot',
                playbackUrl: signedError ? null : (signedData?.signedUrl || null),
              });
            }

            nextRecordings[field].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
          }

          console.info('[DictationAudio][Replay] Final audio recordings by field', {
            voice_assistant_feedback: nextRecordings.voice_assistant_feedback.length,
            communication_style_feedback: nextRecordings.communication_style_feedback.length,
            experiment_feedback: nextRecordings.experiment_feedback.length,
            durationMs: Math.round(performance.now() - dictationFetchStartedAt),
          });
          setDictationRecordingsByField(nextRecordings);
        } catch (dictationLoadError) {
          console.warn('Unexpected error loading dictation recordings:', dictationLoadError);
        }

        const nextFeedbackDraftUsage = createEmptyFeedbackDraftUsage();
        const mergedResponse = { ...response } as ExperimentResponseWithDemographics;
        (Object.keys(FEEDBACK_FIELD_LABELS) as FeedbackFieldKey[]).forEach((field) => {
          const existingValue = mergedResponse[field];
          const isMissing = isMissingFeedbackValue(existingValue);
          const draftValue = latestFeedbackDraft[field];
          if (isMissing && typeof draftValue === 'string' && draftValue.trim()) {
            mergedResponse[field] = draftValue as ExperimentResponseWithDemographics[typeof field];
            nextFeedbackDraftUsage[field] = true;
            return;
          }
          if (isMissing) {
            mergedResponse[field] = '' as ExperimentResponseWithDemographics[typeof field];
          }
        });
        setFeedbackDraftUsage(nextFeedbackDraftUsage);

        setData({ ...mergedResponse, demographics, prolificExportDemographics });
        setFormalityCalcId(formalityCalc?.id || null);
      } catch (err) {
        console.error('Error fetching response details:', err);
        setError('Failed to load response details');
      } finally {
        const totalDurationMs = Math.round(performance.now() - fetchStartedAt);
        console.info('[ResponseDetails] Finished loading response details', {
          id,
          durationMs: totalDurationMs,
        });
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id, resetMergedFieldState, isGuestMode]);

  // Build replay markers once both replayEvents and navigation events are ready.
  // Markers are placed on the replay timeline relative to the first rrweb event.
  useEffect(() => {
    if (!replayEvents.length || !pendingMarkerEvents.length) {
      if (!replayEvents.length && replayMarkers.length) {
        setReplayMarkers([]);
      }
      return;
    }

    const replayStart = replayEvents[0]?.timestamp || null;
    const replayEnd = replayEvents[replayEvents.length - 1]?.timestamp || replayStart || 0;
    const replayDuration = Math.max(0, replayEnd - (replayStart || replayEnd));
    if (!replayStart) return;

    const pageLabel = (pageName: string) => {
      if (pageName === 'practice-conversation') return 'Practice';
      if (pageName === 'voice-conversation') return 'Main';
      if (pageName === 'feedback') return 'Feedback';
      return pageName;
    };

    const markers: ReplayMarker[] = [];
    pendingMarkerEvents.forEach((event, index) => {
      const metadata = (event.metadata || {}) as Record<string, unknown>;
      const feedbackField = isFeedbackField(metadata.field) ? metadata.field : null;

      const eventTimestamp = Date.parse(event.created_at);
      if (Number.isNaN(eventTimestamp)) return;

      const timeMsRaw = eventTimestamp - replayStart;
      const timeMs = Math.max(0, replayDuration > 0 ? Math.min(replayDuration, timeMsRaw) : timeMsRaw);

      const labelPrefix = pageLabel(event.page_name);
      const feedbackFieldLabel = isFeedbackField(metadata.field) ? FEEDBACK_FIELD_LABELS[metadata.field] : 'Feedback';
      let label: string | null = null;
      let tone: MarkerTone = 'info';

      if (event.event_type === 'mic_permission') {
        const state = formatMicPermission(metadata.state as string | null) || 'Unknown';
        const isDictationContext = event.page_name === 'feedback' || metadata.context === 'dictation';
        label = isDictationContext
          ? `${labelPrefix}: ${feedbackFieldLabel} dictation mic permission ${state}`
          : `${labelPrefix}: Mic permission ${state}`;
        tone = state === 'Denied' ? 'error' : state === 'Granted' ? 'success' : 'info';
      } else if (event.event_type === 'mic_audio_check') {
        const detected = formatMicAudio(metadata.detected) || 'Unknown';
        const isDictationContext = event.page_name === 'feedback' || metadata.context === 'dictation';
        label = isDictationContext
          ? `${labelPrefix}: ${feedbackFieldLabel} dictation audio ${detected}`
          : `${labelPrefix}: Mic audio ${detected}`;
        tone = detected === 'Not detected' || detected === 'Error' ? 'warning' : 'success';
      } else if (event.event_type === 'call_connected') {
        label = `${labelPrefix}: Call connected`;
        tone = 'success';
      } else if (event.event_type === 'call_start_failed') {
        label = `${labelPrefix}: Call start failed`;
        tone = 'error';
      } else if (event.event_type === 'call_quality_warning') {
        label = `${labelPrefix}: Audio quality warning`;
        tone = 'warning';
      } else if (event.event_type === 'call_error') {
        const errorText = typeof metadata.errorMessage === 'string'
          ? metadata.errorMessage
          : typeof metadata.error === 'string'
            ? metadata.error
            : '';
        const normalizedError = errorText.toLowerCase();
        const isExpected = metadata.isExpected === true
          || normalizedError.includes('meeting ended')
          || normalizedError.includes('meeting has ended')
          || normalizedError.includes('max-duration')
          || normalizedError.includes('max duration')
          || normalizedError.includes('exceeded-max-duration')
          || normalizedError.includes('ejection');

        if (isExpected) {
          label = `${labelPrefix}: Call ended (expected)`;
          tone = 'info';
        } else {
          label = `${labelPrefix}: Call error`;
          tone = 'error';
        }
      } else if (event.event_type === 'assistant_audio_timeout') {
        label = `${labelPrefix}: Assistant audio timeout`;
        tone = 'warning';
      } else if (event.event_type === 'dictation_started') {
        label = `${labelPrefix}: ${feedbackFieldLabel} dictation started`;
        tone = 'info';
      } else if (event.event_type === 'dictation_stopped') {
        label = `${labelPrefix}: ${feedbackFieldLabel} dictation stopped`;
        tone = 'info';
      } else if (event.event_type === 'dictation_error' || event.event_type === 'dictation_start_blocked') {
        label = `${labelPrefix}: ${feedbackFieldLabel} dictation issue`;
        tone = 'warning';
      } else if (event.event_type === 'dictation_recording_error') {
        label = `${labelPrefix}: ${feedbackFieldLabel} recorder error`;
        tone = 'warning';
      } else if (event.event_type === 'dictation_recording_uploaded') {
        label = `${labelPrefix}: ${feedbackFieldLabel} dictation audio saved`;
        tone = 'success';
      } else if (event.event_type === 'dictation_recording_upload_error') {
        label = `${labelPrefix}: ${feedbackFieldLabel} dictation upload failed`;
        tone = 'error';
      } else if (event.event_type === 'dictation_transcript_appended') {
        label = `${labelPrefix}: ${feedbackFieldLabel} dictation transcript appended`;
        tone = 'info';
      } else if (event.event_type === 'feedback_input_mode') {
        if (metadata.mode === 'typed') {
          label = `${labelPrefix}: ${feedbackFieldLabel} typed`;
        } else if (metadata.mode === 'dictated') {
          label = `${labelPrefix}: ${feedbackFieldLabel} dictated`;
        }
        tone = 'info';
      }

      if (label) {
        markers.push({
          id: `${event.event_type}-${event.created_at}-${index}`,
          timeMs,
          label,
          tone,
        });
      }
    });

    setReplayMarkers(markers.slice(0, 80));
  }, [replayEvents, pendingMarkerEvents]);

  useEffect(() => {
    let cancelled = false;
    const pending = FEEDBACK_FIELDS.flatMap((field) => dictationRecordingsByField[field])
      .filter((recording) => (
        Boolean(recording.playbackUrl)
        && ((recording.durationMs ?? 0) <= 0)
        && resolvedClipDurationsById[recording.id] === undefined
      ));

    if (!pending.length) return;

    const resolveDurations = async () => {
      const startedAt = performance.now();
      console.info('[DictationAudio][Durations] Resolving pending clip durations', {
        pendingCount: pending.length,
      });
      for (const recording of pending) {
        if (!recording.playbackUrl) continue;
        const durationMs = await resolveAudioDurationMs(recording.playbackUrl);
        if (cancelled || !durationMs || durationMs <= 0) continue;
        setResolvedClipDurationsById((prev) => (
          prev[recording.id] !== undefined ? prev : { ...prev, [recording.id]: durationMs }
        ));
      }
      console.info('[DictationAudio][Durations] Finished resolving clip durations', {
        pendingCount: pending.length,
        durationMs: Math.round(performance.now() - startedAt),
      });
    };

    void resolveDurations();
    return () => {
      cancelled = true;
    };
  }, [dictationRecordingsByField, resolvedClipDurationsById]);

  useEffect(() => {
    let cancelled = false;

    const buildMergedByField = async () => {
      const startedAt = performance.now();
      console.info('[DictationAudio][Merge] Building merged dictation audio by field');
      for (const field of FEEDBACK_FIELDS) {
        const clips = [...dictationRecordingsByField[field]]
          .filter((recording) => Boolean(recording.playbackUrl))
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

        if (clips.length === 0) {
          setMergedFieldState(field, {
            status: 'none',
            playbackUrl: null,
            durationMs: null,
            clipCount: 0,
            errorMessage: null,
          });
          continue;
        }

        if (clips.length === 1) {
          const clip = clips[0];
          const durationMs = (clip.durationMs && clip.durationMs > 0)
            ? clip.durationMs
            : (resolvedClipDurationsById[clip.id] ?? null);
          setMergedFieldState(field, {
            status: 'ready',
            playbackUrl: clip.playbackUrl,
            durationMs,
            clipCount: 1,
            errorMessage: null,
          });
          continue;
        }

        setMergedFieldState(field, {
          status: 'building',
          playbackUrl: null,
          durationMs: null,
          clipCount: clips.length,
          errorMessage: null,
        });

        try {
          const merged = await mergeAudioUrlsIntoWav(clips.map((clip) => clip.playbackUrl as string));
          if (cancelled) {
            URL.revokeObjectURL(merged.playbackUrl);
            continue;
          }
          setMergedFieldState(field, {
            status: 'ready',
            playbackUrl: merged.playbackUrl,
            durationMs: merged.durationMs,
            clipCount: clips.length,
            errorMessage: null,
          });
          console.info('[DictationAudio][Merge] Field merged', {
            field,
            clipCount: clips.length,
            durationMs: merged.durationMs,
          });
        } catch (error) {
          if (cancelled) continue;
          setMergedFieldState(field, {
            status: 'error',
            playbackUrl: null,
            durationMs: null,
            clipCount: clips.length,
            errorMessage: error instanceof Error ? error.message : 'Unable to merge clips.',
          });
        }
      }
      console.info('[DictationAudio][Merge] Finished building merged audio', {
        durationMs: Math.round(performance.now() - startedAt),
      });
    };

    void buildMergedByField();
    return () => {
      cancelled = true;
    };
  }, [dictationRecordingsByField, resolvedClipDurationsById, setMergedFieldState]);

  useEffect(() => {
    return () => {
      FEEDBACK_FIELDS.forEach((field) => {
        const url = mergedAudioUrlsRef.current[field];
        if (url && isBlobUrl(url)) URL.revokeObjectURL(url);
      });
      mergedAudioUrlsRef.current = {};
    };
  }, []);

  // Scroll to section on load
  useEffect(() => {
    const section = searchParams.get('section');
    if (section && !isLoading && data) {
      const element = sectionRefs.current[section];
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
  }, [searchParams, isLoading, data]);

  const scrollToSection = (sectionId: string) => {
    const element = sectionRefs.current[sectionId];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleToggleReviewed = async () => {
    if (!data?.id || isPendingRecord || isGuestMode) return;
    const next = !(data.reviewed_by_researcher ?? false);
    try {
      const { error } = await supabase
        .from('experiment_responses')
        .update({ reviewed_by_researcher: next })
        .eq('id', data.id);
      if (error) throw error;
      setData((prev) => (prev ? { ...prev, reviewed_by_researcher: next } : null));
      if (next && data.batch_label) {
        const { data: batchResponses } = await supabase
          .from('experiment_responses')
          .select('id, reviewed_by_researcher')
          .eq('batch_label', data.batch_label);
        const allReviewed = (batchResponses ?? []).length > 0
          && (batchResponses ?? []).every((r) => r.reviewed_by_researcher === true);
        if (allReviewed) setCreateBatchDialog({ open: true, batchLabel: data.batch_label });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleFlagged = async () => {
    if (!data?.id || isPendingRecord || isGuestMode) return;
    const next = !(data.flagged ?? false);
    try {
      const { error } = await supabase
        .from('experiment_responses')
        .update({ flagged: next })
        .eq('id', data.id);
      if (error) throw error;
      setData((prev) => (prev ? { ...prev, flagged: next } : null));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (data?.researcher_notes !== undefined) setResearcherNotesDraft(data.researcher_notes ?? '');
  }, [data?.id, data?.researcher_notes]);

  const ensureWritableResponseId = async (): Promise<string> => {
    if (!data) throw new Error('Response not loaded');

    // Typical case: route id is already an experiment_responses row.
    if (!isPendingRecord) return data.id;

    const { data: exactRow, error: exactError } = await supabase
      .from('experiment_responses')
      .select('id')
      .eq('id', data.id)
      .maybeSingle();
    if (exactError) throw exactError;
    if (exactRow?.id) return exactRow.id;

    const { data: matchedRow, error: matchedError } = await supabase
      .from('experiment_responses')
      .select('id')
      .eq('prolific_id', data.prolific_id)
      .eq('call_id', data.call_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (matchedError) throw matchedError;
    if (matchedRow?.id) {
      if (matchedRow.id !== data.id) {
        setData((prev) => (prev ? { ...prev, id: matchedRow.id } : prev));
      }
      return matchedRow.id;
    }

    // Pending/abandoned without an experiment_responses row yet: create a minimal draft row.
    const now = new Date().toISOString();
    const { data: insertedRow, error: insertError } = await supabase
      .from('experiment_responses')
      .insert({
        prolific_id: data.prolific_id,
        call_id: data.call_id,
        submission_status: nonSubmittedStatus === 'abandoned' ? 'abandoned' : 'pending',
        last_saved_at: now,
        last_step: (data as any).last_step ?? null,
      })
      .select('id')
      .single();
    if (insertError) throw insertError;
    if (!insertedRow?.id) throw new Error('Failed to create pending response row');

    setData((prev) => (prev ? { ...prev, id: insertedRow.id } : prev));
    return insertedRow.id;
  };

  const handleSaveResearcherNotes = async () => {
    if (!data || isGuestMode) return;
    setResearcherNotesSaving(true);
    try {
      const responseId = await ensureWritableResponseId();
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('experiment_responses')
        .update({
          researcher_notes: researcherNotesDraft.trim() || null,
          researcher_notes_at: researcherNotesDraft.trim() ? now : null,
        })
        .eq('id', responseId);
      if (error) throw error;
      setData((prev) =>
        prev
          ? {
              ...prev,
              id: responseId,
              researcher_notes: researcherNotesDraft.trim() || null,
              researcher_notes_at: researcherNotesDraft.trim() ? now : null,
            }
          : null
      );
      toast.success('Notes saved');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save notes');
    } finally {
      setResearcherNotesSaving(false);
    }
  };

  const guessAudioExtension = (storagePath: string | null, mimeType: string | null): string => {
    if (storagePath && storagePath.includes('.')) {
      const ext = storagePath.split('.').pop() || '';
      const clean = ext.trim().toLowerCase();
      if (clean && clean.length <= 6) return clean;
    }
    const mt = (mimeType || '').toLowerCase();
    if (mt.includes('wav')) return 'wav';
    if (mt.includes('mp4') || mt.includes('m4a')) return 'm4a';
    if (mt.includes('ogg')) return 'ogg';
    if (mt.includes('mpeg') || mt.includes('mp3')) return 'mp3';
    return 'webm';
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(href);
  };

  const decodeAudioBlob = async (blob: Blob): Promise<AudioBuffer> => {
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
      throw new Error('Audio decoding is not supported in this browser.');
    }
    const ctx = new window.AudioContext();
    try {
      const bytes = await blob.arrayBuffer();
      return await ctx.decodeAudioData(bytes.slice(0));
    } finally {
      await ctx.close();
    }
  };

  const ensureFfmpeg = async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      // Use package export subpaths so Vite can resolve assets under "exports".
      coreURL: new URL('@ffmpeg/core', import.meta.url).toString(),
      wasmURL: new URL('@ffmpeg/core/wasm', import.meta.url).toString(),
      classWorkerURL: new URL('@ffmpeg/ffmpeg/worker', import.meta.url).toString(),
    });
    return ffmpeg;
  };

  const transcodeWavToMp3 = async (wavBlob: Blob): Promise<Blob> => {
    const ffmpeg = await ensureFfmpeg();
    const inputBytes = new Uint8Array(await wavBlob.arrayBuffer());
    await ffmpeg.writeFile('input.wav', inputBytes);
    // VBR around ~165kbps; adjust with -q:a (0 best, 9 worst).
    const code = await ffmpeg.exec(['-i', 'input.wav', '-codec:a', 'libmp3lame', '-q:a', '4', 'output.mp3']);
    if (code !== 0) throw new Error(`FFmpeg failed (exit ${code})`);
    const out = await ffmpeg.readFile('output.mp3');
    await ffmpeg.deleteFile('input.wav').catch(() => {});
    await ffmpeg.deleteFile('output.mp3').catch(() => {});
    // readFile returns FileData; copy into a plain Uint8Array to avoid TS/shared-buffer typing issues.
    const outBytes = out instanceof Uint8Array ? new Uint8Array(out) : new TextEncoder().encode(String(out));
    return new Blob([outBytes], { type: 'audio/mpeg' });
  };

  const handleDownloadDictationRecording = async (recording: DictationRecording, clipIndex: number) => {
    if (!recording.storageBucket || !recording.storagePath) {
      toast.error('No storage path available for this clip.');
      return;
    }
    if (!data) return;
    setDictationDownloadId(recording.id);
    try {
      const { data: file, error } = await supabase.storage
        .from(recording.storageBucket)
        .download(recording.storagePath);
      if (error) throw error;
      const ext = guessAudioExtension(recording.storagePath, recording.mimeType);
      const safeField = recording.field.replace(/[^a-z0-9_]+/gi, '_');
      const ts = new Date(recording.createdAt).toISOString().replace(/[:.]/g, '-');
      const filename = `${data.prolific_id}_${data.call_id || 'no-call'}_${safeField}_clip${clipIndex + 1}_start${recording.attemptCount}_${ts}.${ext}`;
      downloadBlob(file, filename);
      toast.success('Download started');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to download audio');
    } finally {
      setDictationDownloadId(null);
    }
  };

  const handleDownloadDictationRecordingAsWav = async (recording: DictationRecording, clipIndex: number) => {
    if (!recording.storageBucket || !recording.storagePath) {
      toast.error('No storage path available for this clip.');
      return;
    }
    if (!data) return;
    setDictationDownloadId(recording.id);
    try {
      const { data: file, error } = await supabase.storage
        .from(recording.storageBucket)
        .download(recording.storagePath);
      if (error) throw error;

      const audioBuffer = await decodeAudioBlob(file);
      const wavBlob = encodeAudioBufferToWav(audioBuffer);

      const safeField = recording.field.replace(/[^a-z0-9_]+/gi, '_');
      const ts = new Date(recording.createdAt).toISOString().replace(/[:.]/g, '-');
      const filename = `${data.prolific_id}_${data.call_id || 'no-call'}_${safeField}_clip${clipIndex + 1}_start${recording.attemptCount}_${ts}.wav`;
      downloadBlob(wavBlob, filename);
      toast.success('WAV download started');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to download WAV');
    } finally {
      setDictationDownloadId(null);
    }
  };

  const handleDownloadDictationRecordingAsMp3 = async (recording: DictationRecording, clipIndex: number) => {
    if (!recording.storageBucket || !recording.storagePath) {
      toast.error('No storage path available for this clip.');
      return;
    }
    if (!data) return;
    setDictationDownloadId(recording.id);
    try {
      const { data: file, error } = await supabase.storage
        .from(recording.storageBucket)
        .download(recording.storagePath);
      if (error) throw error;

      // Decode via WebAudio, then encode to wav, then mp3 via ffmpeg.wasm.
      const audioBuffer = await decodeAudioBlob(file);
      const wavBlob = encodeAudioBufferToWav(audioBuffer);
      const mp3Blob = await transcodeWavToMp3(wavBlob);

      const safeField = recording.field.replace(/[^a-z0-9_]+/gi, '_');
      const ts = new Date(recording.createdAt).toISOString().replace(/[:.]/g, '-');
      const filename = `${data.prolific_id}_${data.call_id || 'no-call'}_${safeField}_clip${clipIndex + 1}_start${recording.attemptCount}_${ts}.mp3`;
      downloadBlob(mp3Blob, filename);
      toast.success('MP3 download started');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to download MP3');
    } finally {
      setDictationDownloadId(null);
    }
  };

  const handleDownloadMergedDictation = (field: FeedbackFieldKey) => {
    if (!data) return;
    const merged = mergedDictationByField[field];
    if (merged.status !== 'ready' || !merged.playbackUrl) {
      toast.error('Merged audio is not available.');
      return;
    }
    const safeField = field.replace(/[^a-z0-9_]+/gi, '_');
    const filename = `${data.prolific_id}_${data.call_id || 'no-call'}_${safeField}_merged.wav`;
    fetch(merged.playbackUrl)
      .then((r) => r.blob())
      .then((blob) => downloadBlob(blob, filename))
      .catch(() => toast.error('Failed to download merged audio'));
  };

  const handleDownloadMergedDictationAsMp3 = async (field: FeedbackFieldKey) => {
    if (!data) return;
    const merged = mergedDictationByField[field];
    if (merged.status !== 'ready' || !merged.playbackUrl) {
      toast.error('Merged audio is not available.');
      return;
    }
    setDictationDownloadId(`merged-${field}`);
    try {
      const wavBlob = await fetch(merged.playbackUrl).then((r) => r.blob());
      const mp3Blob = await transcodeWavToMp3(wavBlob);
      const safeField = field.replace(/[^a-z0-9_]+/gi, '_');
      const filename = `${data.prolific_id}_${data.call_id || 'no-call'}_${safeField}_merged.mp3`;
      downloadBlob(mp3Blob, filename);
      toast.success('MP3 download started');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to download merged MP3');
    } finally {
      setDictationDownloadId(null);
    }
  };

  const openFutureFeaturesDialog = () => {
    if (!data) return;
    const callLabel = data.call_id ? `Call ${data.call_id}` : `Response ${data.id}`;
    setFutureFeaturesDraft((prev) => ({
      itemType: prev.itemType || 'feature',
      status: prev.itemType === 'error' ? 'open' : 'idea',
      priority: prev.priority || 'medium',
      title: prev.title || `${callLabel}: `,
      goal: prev.goal || researcherNotesDraft.trim(),
      proposed: prev.proposed,
      impact: prev.impact || 'src/pages/ResponseDetails.tsx, src/pages/VoiceConversation.tsx, src/components/researcher/ParticipantJourneyModal.tsx',
    }));
    setFutureFeaturesDialogOpen(true);
  };

  const handleSaveToFutureFeatures = async () => {
    if (isGuestMode) {
      toast.error('Not available in Guest Mode.');
      return;
    }
    if (!data) return;

    const title = futureFeaturesDraft.title.trim();
    const goal = futureFeaturesDraft.goal.trim();
    const proposed = futureFeaturesDraft.proposed.trim();
    const impact = futureFeaturesDraft.impact.trim();

    if (!title || !goal) {
      toast.error('Title and Goal are required.');
      return;
    }

    const itemType = futureFeaturesDraft.itemType;
    const status = futureFeaturesDraft.status;
    const priority = futureFeaturesDraft.priority;
    const allowedStatuses =
      itemType === 'error'
        ? (['open', 'in_progress', 'resolved'] as const)
        : (['idea', 'planned', 'in_progress', 'shipped'] as const);
    if (!allowedStatuses.includes(status as (typeof allowedStatuses)[number])) {
      toast.error('Selected status is not valid for this item type.');
      return;
    }

    setFutureFeaturesSaving(true);
    try {
      const details = [
        `Goal: ${goal}`,
        proposed ? `Proposed UI/behavior: ${proposed}` : null,
        impact ? `Likely impact: ${impact}` : null,
      ].filter(Boolean).join('\n\n');

      const { data: orderRow, error: orderError } = await supabase
        .from('researcher_backlog_items')
        .select('display_order')
        .eq('item_type', itemType)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (orderError) throw orderError;
      const nextDisplayOrder = (orderRow?.display_order ?? -1) + 1;

      if (!user?.id) throw new Error('No authenticated researcher found');

      const { error: insertError } = await supabase.from('researcher_backlog_items').insert({
        item_type: itemType,
        title,
        details,
        status,
        priority,
        linked_response_id: await ensureWritableResponseId(),
        display_order: nextDisplayOrder,
        created_by: user.id,
      });
      if (insertError) throw insertError;

      toast.success('Saved to backlog');
      setFutureFeaturesDialogOpen(false);
      setFutureFeaturesDraft({
        itemType: 'feature',
        status: 'idea',
        priority: 'medium',
        title: '',
        goal: '',
        proposed: '',
        impact: '',
      });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to save to backlog');
    } finally {
      setFutureFeaturesSaving(false);
    }
  };

  const handleRunVapiEvaluation = async () => {
    if (!data?.call_id || isPendingRecord || isGuestMode) return;
    setRunEvaluationLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('run-vapi-structured-output', {
        body: { callIds: [data.call_id] },
      });
      if (error) throw error;
      toast.success(res?.message ?? 'Evaluation started. Check back in 1–2 min or click Check for results.');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to start evaluation');
    } finally {
      setRunEvaluationLoading(false);
    }
  };

  const handleCheckVapiResults = async () => {
    if (!data?.call_id || !data?.id || isPendingRecord || isGuestMode) return;
    setCheckResultsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('fetch-vapi-structured-output-results', {
        body: { callIds: [data.call_id] },
      });
      if (error) throw error;
      const { data: updated, error: fetchErr } = await supabase
        .from('experiment_responses')
        .select('vapi_structured_output, vapi_structured_output_at, vapi_structured_outputs, vapi_structured_outputs_at')
        .eq('id', data.id)
        .single();
      if (!fetchErr && updated) {
        setData((prev) => (prev ? { ...prev, ...updated } : null));
        toast.success('Results updated.');
      } else {
        toast.success('Check complete. Results may still be processing.');
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to fetch results');
    } finally {
      setCheckResultsLoading(false);
    }
  };

  const renderFeedbackTextWithHighlights = (field: FeedbackFieldKey, value: string | null | undefined) => {
    if (!value) {
      return <span className="italic text-muted-foreground">No feedback provided</span>;
    }
    const dictatedSegments = dictationTranscriptSegmentsByField[field]
      .map((segment) => segment.text)
      .filter((segment) => Boolean(segment));
    const parts = buildFeedbackTextModeParts(value, dictatedSegments);
    const hasDictatedPart = parts.some((part) => part.mode === 'dictated');
    const isDictatedOnly = feedbackInputSources[field].dictated && !feedbackInputSources[field].typed;
    const safeParts = !hasDictatedPart && isDictatedOnly
      ? [{ text: value, mode: 'dictated' as const }]
      : parts;
    return (
      <span className="whitespace-pre-wrap">
        {safeParts.map((part, idx) => (
          <span
            key={`${field}-${idx}-${part.mode}`}
            className={part.mode === 'dictated'
              ? 'rounded bg-sky-100/80 px-0.5 text-sky-900'
              : 'rounded bg-amber-100/60 px-0.5 text-amber-900'}
          >
            {part.text}
          </span>
        ))}
      </span>
    );
  };

  const renderDictationRecordings = (field: FeedbackFieldKey) => {
    const recordings = dictationRecordingsByField[field];
    const diagnostics = dictationDiagnosticsByField[field];
    const merged = mergedDictationByField[field];
    const showIndividualClips = showIndividualClipsByField[field];
    const recentIssues = diagnostics.issues.slice(-3).reverse();
    const hasDictationTelemetry = (
      diagnostics.started > 0
      || diagnostics.stopped > 0
      || diagnostics.uploadSaved > 0
      || diagnostics.uploadFailed > 0
      || diagnostics.blocked > 0
      || diagnostics.runtimeErrors > 0
      || recentIssues.length > 0
    );
    const hasMergedSection = merged.status !== 'none' || merged.clipCount >= 2;

    if (!recordings.length && !hasDictationTelemetry && !hasMergedSection) {
      return <p className="mt-2 text-xs italic text-muted-foreground">No dictation audio recorded.</p>;
    }

    return (
      <div className="mt-2 space-y-2">
        {hasDictationTelemetry && (
          <div className="rounded border border-dashed bg-muted/40 p-2 text-xs text-muted-foreground">
            <p>
              Dictation starts: {diagnostics.started}
              {' '}• Stops: {diagnostics.stopped}
              {' '}• Uploads saved: {diagnostics.uploadSaved}
              {' '}• Upload failures: {diagnostics.uploadFailed}
            </p>
            <p>Start # is the order of dictation starts for this question (1, 2, 3...).</p>
            {(diagnostics.blocked > 0 || diagnostics.runtimeErrors > 0) && (
              <p>
                Blocked starts: {diagnostics.blocked}
                {' '}• Recorder/runtime errors: {diagnostics.runtimeErrors}
              </p>
            )}
            {recentIssues.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {recentIssues.map((issue, idx) => (
                  <p key={`${issue.createdAt}-${issue.eventType}-${idx}`}>
                    {formatDictationIssueType(issue.eventType)} ({new Date(issue.createdAt).toLocaleTimeString()}): {issue.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        {hasMergedSection && (
          <div className="rounded border bg-muted/30 p-2">
            <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Merged clip</span>
              <span>Source clips: {merged.clipCount}</span>
              <span>
                Duration: {merged.durationMs != null ? formatDuration(merged.durationMs) : 'Unknown'}
              </span>
            </div>
            {merged.status === 'building' && (
              <p className="text-xs italic text-muted-foreground">
                Building merged audio from clips...
              </p>
            )}
            {merged.status === 'error' && (
              <p className="text-xs italic text-muted-foreground">
                Merged audio unavailable: {merged.errorMessage || 'Unknown error'}
              </p>
            )}
            {merged.status === 'ready' && merged.playbackUrl && (
              <div className="space-y-2">
                <audio controls preload="metadata" src={merged.playbackUrl} className="w-full" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownloadMergedDictation(field)}
                  className="w-full justify-center"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download merged audio (.wav)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleDownloadMergedDictationAsMp3(field)}
                  className="w-full justify-center"
                  disabled={dictationDownloadId === `merged-${field}`}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {dictationDownloadId === `merged-${field}` ? 'Encoding MP3...' : 'Download merged audio (.mp3)'}
                </Button>
              </div>
            )}
          </div>
        )}
        {recordings.length === 0 && (
          <p className="text-xs italic text-muted-foreground">
            No playable audio resolved for this field. Check upload failures above.
          </p>
        )}
        {recordings.length > 0 && (
          <Collapsible
            open={showIndividualClips}
            onOpenChange={(next) => {
              setShowIndividualClipsByField((prev) => ({
                ...prev,
                [field]: next,
              }));
            }}
          >
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between text-xs">
                {showIndividualClips ? 'Hide individual clips' : `Show individual clips (${recordings.length})`}
                <ChevronDown className={cn("h-4 w-4 transition-transform", showIndividualClips && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {recordings.map((recording, idx) => (
                <div key={recording.id} className="rounded border bg-background p-2">
                  {(() => {
                    const displayDurationMs = recording.durationMs && recording.durationMs > 0
                      ? recording.durationMs
                      : (resolvedClipDurationsById[recording.id] ?? null);
                    return (
                      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>Clip {idx + 1}</span>
                        <span>Start #: {recording.attemptCount}</span>
                        <span>Duration: {displayDurationMs != null ? formatDuration(displayDurationMs) : "Unknown"}</span>
                        <span>Source: {recording.source === 'table' ? 'Database row' : 'Upload event'}</span>
                        <span>{new Date(recording.createdAt).toLocaleString()}</span>
                      </div>
                    );
                  })()}
                  {recording.playbackUrl ? (
                    <div className="space-y-2">
                      <audio controls preload="metadata" src={recording.playbackUrl} className="w-full" />
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full justify-center"
                          disabled={dictationDownloadId === recording.id || !recording.storageBucket || !recording.storagePath}
                          onClick={() => handleDownloadDictationRecording(recording, idx)}
                          title={!recording.storageBucket || !recording.storagePath ? 'No storage path available' : 'Download original clip'}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {dictationDownloadId === recording.id ? 'Working...' : 'Original'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full justify-center"
                          disabled={dictationDownloadId === recording.id || !recording.storageBucket || !recording.storagePath}
                          onClick={() => void handleDownloadDictationRecordingAsWav(recording, idx)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {dictationDownloadId === recording.id ? 'Working...' : 'WAV'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full justify-center"
                          disabled={dictationDownloadId === recording.id || !recording.storageBucket || !recording.storagePath}
                          onClick={() => void handleDownloadDictationRecordingAsMp3(recording, idx)}
                          title="MP3 encoding runs in the browser (ffmpeg.wasm) and may take a few seconds."
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {dictationDownloadId === recording.id ? 'Working...' : 'MP3'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs italic text-muted-foreground">Audio reference exists, but signed URL could not be resolved.</p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full justify-center"
                          disabled={dictationDownloadId === recording.id || !recording.storageBucket || !recording.storagePath}
                          onClick={() => handleDownloadDictationRecording(recording, idx)}
                          title={!recording.storageBucket || !recording.storagePath ? 'No storage path available' : 'Download original clip'}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {dictationDownloadId === recording.id ? 'Working...' : 'Original'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full justify-center"
                          disabled={dictationDownloadId === recording.id || !recording.storageBucket || !recording.storagePath}
                          onClick={() => void handleDownloadDictationRecordingAsWav(recording, idx)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {dictationDownloadId === recording.id ? 'Working...' : 'WAV'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full justify-center"
                          disabled={dictationDownloadId === recording.id || !recording.storageBucket || !recording.storagePath}
                          onClick={() => void handleDownloadDictationRecordingAsMp3(recording, idx)}
                          title="MP3 encoding runs in the browser (ffmpeg.wasm) and may take a few seconds."
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {dictationDownloadId === recording.id ? 'Working...' : 'MP3'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {error || 'Response not found'}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/researcher/dashboard')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
              <div className="h-6 w-px bg-border" />
              <div>
                <h1 className="font-semibold">Response Details</h1>
                <p className="text-sm text-muted-foreground font-mono">{data.prolific_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isPendingRecord && (
                <Badge variant={nonSubmittedStatus === 'abandoned' ? 'destructive' : 'secondary'}>
                  {nonSubmittedStatus === 'abandoned' ? 'Abandoned' : 'Pending'}
                </Badge>
              )}
              {data.assistant_type && (
                <Badge variant={data.assistant_type === 'formal' ? 'default' : 'secondary'}>
                  {data.assistant_type}
                </Badge>
              )}
              {data.batch_label && (
                <Badge variant="outline">{data.batch_label}</Badge>
              )}
              {!isPendingRecord && data.id && (
                <>
                  <button
                    type="button"
                    onClick={handleToggleReviewed}
                    className={cn(
                      'inline-flex items-center justify-center w-8 h-8 rounded border transition-colors',
                      data.reviewed_by_researcher ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground/30 hover:bg-muted'
                    )}
                    title={data.reviewed_by_researcher ? 'Reviewed' : 'Mark as reviewed'}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleFlagged}
                    className={cn(
                      'inline-flex items-center justify-center w-8 h-8 rounded border transition-colors',
                      data.flagged ? 'bg-destructive/15 text-destructive border-destructive/50' : 'border-muted-foreground/30 hover:bg-muted'
                    )}
                    title={data.flagged ? 'Flagged' : 'Flag'}
                  >
                    <Flag className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Section Navigation */}
        <div className="max-w-5xl mx-auto px-6 pb-3">
          <div className="flex gap-2 overflow-x-auto">
            {SECTIONS.map(section => (
              <Button
                key={section.id}
                variant="ghost"
                size="sm"
                onClick={() => scrollToSection(section.id)}
                className="flex-shrink-0"
              >
                <section.icon className="h-4 w-4 mr-1.5" />
                {section.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-8">
        {isPendingRecord && (
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">
              <div className="font-medium text-foreground mb-1">
                {nonSubmittedStatus === 'abandoned' ? 'Abandoned (not submitted)' : 'Pending (not submitted)'}
              </div>
              <div>
                Saved up to: <span className="font-mono">{(data as any).last_step ?? 'unknown'}</span>
                {` `}
                at {new Date(((data as any).last_saved_at ?? data.created_at) as string).toLocaleString()}.
              </div>
            </CardContent>
          </Card>
        )}
        {/* Summary Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Response Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm text-muted-foreground">Call ID</label>
                <p className="font-mono text-sm truncate">{data.call_id}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Created</label>
                <p className="text-sm">{new Date(data.created_at).toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Call Attempt</label>
                <p className="text-sm">{data.call_attempt_number ?? '-'}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">PETS Total</label>
                <p className="text-sm font-semibold">{formatNumber(data.pets_total)}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Practice Mic Permission</label>
                <p className="text-sm">{journeyDiagnostics?.practice?.micPermission || "Unknown"}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Practice Mic Audio</label>
                <p className="text-sm">{journeyDiagnostics?.practice?.micAudio || "Unknown"}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Main Mic Permission</label>
                <p className="text-sm">{journeyDiagnostics?.main?.micPermission || "Unknown"}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Main Mic Audio</label>
                <p className="text-sm">{journeyDiagnostics?.main?.micAudio || "Unknown"}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Feedback Dictation Mic</label>
                <p className="text-sm">{journeyDiagnostics?.feedback?.micPermission || "Unknown"}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Feedback Dictation Audio</label>
                <p className="text-sm">{journeyDiagnostics?.feedback?.micAudio || "Unknown"}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Early Access Opt-In</label>
                <p className="text-sm">
                  {isPendingRecord
                    ? 'Pending response'
                    : data.early_access_notify === true
                      ? 'Yes'
                      : data.early_access_notify === false
                        ? 'No'
                        : 'NA'}
                </p>
              </div>
              <div className="col-span-2 md:col-span-4">
                <label className="text-sm text-muted-foreground">Early Access Notes</label>
                <p className="text-sm whitespace-pre-wrap">
                  {isPendingRecord
                    ? 'Pending response'
                    : data.early_access_notes?.trim() || 'None'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Researcher notes */}
        <section ref={el => sectionRefs.current['notes'] = el} id="notes" className="scroll-mt-32">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <StickyNote className="h-5 w-5" />
                Researcher notes
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Private notes for this response. Not visible to participants.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.researcher_notes_at != null && (
                <p className="text-xs text-muted-foreground">
                  Last updated: {new Date(data.researcher_notes_at).toLocaleString()}
                </p>
              )}
              <Textarea
                className="min-h-[120px] resize-y"
                placeholder="Add notes…"
                value={researcherNotesDraft}
                onChange={(e) => setResearcherNotesDraft(e.target.value)}
                disabled={isGuestMode}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveResearcherNotes}
                  disabled={isGuestMode || researcherNotesSaving}
                >
                  {researcherNotesSaving ? 'Saving…' : 'Save notes'}
                </Button>
                {!isGuestMode && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={openFutureFeaturesDialog}
                  >
                    Add to backlog
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <Dialog open={futureFeaturesDialogOpen} onOpenChange={setFutureFeaturesDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Add to Backlog</DialogTitle>
              <DialogDescription>
                Creates a linked backlog item for this response.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Type</label>
                  <Select
                    value={futureFeaturesDraft.itemType}
                    onValueChange={(value) => {
                      const itemType = value as 'error' | 'feature';
                      setFutureFeaturesDraft((p) => ({
                        ...p,
                        itemType,
                        status: itemType === 'error' ? 'open' : 'idea',
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="feature">Future Feature</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Status</label>
                  <Select
                    value={futureFeaturesDraft.status}
                    onValueChange={(value) => setFutureFeaturesDraft((p) => ({ ...p, status: value as BacklogDraft['status'] }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {futureFeaturesDraft.itemType === 'error' ? (
                        <>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in_progress">In progress</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="idea">Idea</SelectItem>
                          <SelectItem value="planned">Planned</SelectItem>
                          <SelectItem value="in_progress">In progress</SelectItem>
                          <SelectItem value="shipped">Shipped</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Priority</label>
                  <Select
                    value={futureFeaturesDraft.priority}
                    onValueChange={(value) => setFutureFeaturesDraft((p) => ({ ...p, priority: value as BacklogDraft['priority'] }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Title</label>
                <Textarea
                  className="min-h-[60px] resize-y"
                  placeholder="Short, specific title…"
                  value={futureFeaturesDraft.title}
                  onChange={(e) => setFutureFeaturesDraft((p) => ({ ...p, title: e.target.value }))}
                  disabled={futureFeaturesSaving}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Goal</label>
                <Textarea
                  className="min-h-[80px] resize-y"
                  placeholder="Problem / user-facing goal…"
                  value={futureFeaturesDraft.goal}
                  onChange={(e) => setFutureFeaturesDraft((p) => ({ ...p, goal: e.target.value }))}
                  disabled={futureFeaturesSaving}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Proposed UI/behavior</label>
                <Textarea
                  className="min-h-[80px] resize-y"
                  placeholder="How it should work…"
                  value={futureFeaturesDraft.proposed}
                  onChange={(e) => setFutureFeaturesDraft((p) => ({ ...p, proposed: e.target.value }))}
                  disabled={futureFeaturesSaving}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Likely impact</label>
                <Textarea
                  className="min-h-[70px] resize-y"
                  placeholder="Key files/areas likely impacted…"
                  value={futureFeaturesDraft.impact}
                  onChange={(e) => setFutureFeaturesDraft((p) => ({ ...p, impact: e.target.value }))}
                  disabled={futureFeaturesSaving}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setFutureFeaturesDialogOpen(false)} disabled={futureFeaturesSaving}>
                Cancel
              </Button>
              <Button onClick={handleSaveToFutureFeatures} disabled={futureFeaturesSaving}>
                {futureFeaturesSaving ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* VAPI structured output evaluation - right under Researcher notes */}
        <section ref={el => sectionRefs.current['evaluation'] = el} id="evaluation" className="scroll-mt-32">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Call evaluation (VAPI structured output)
              </CardTitle>
              <CardDescription>
                Scores and reasons from the VAPI structured output evaluation. Run evaluation for this call, then check for results after 1–2 minutes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isPendingRecord && !isGuestMode && data.call_id && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRunVapiEvaluation}
                    disabled={runEvaluationLoading}
                  >
                    {runEvaluationLoading ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <BarChart3 className="h-4 w-4 mr-2" />
                    )}
                    Run evaluation
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCheckVapiResults}
                    disabled={checkResultsLoading}
                  >
                    {checkResultsLoading ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Check for results
                  </Button>
                </div>
              )}
              {(() => {
                const structuredOutputsMap = (
                  data.vapi_structured_outputs && typeof data.vapi_structured_outputs === 'object'
                    ? (data.vapi_structured_outputs as Record<string, unknown>)
                    : null
                );
                const derivedFromStructuredOutputs = (() => {
                  if (!structuredOutputsMap) return null;
                  const first = Object.values(structuredOutputsMap)[0] as any;
                  if (!first || typeof first !== 'object') return null;
                  const result = (first as any).result;
                  if (!result || typeof result !== 'object') return null;
                  return result as Record<string, unknown>;
                })();

                const evaluationFromDb = (
                  data.vapi_structured_output && typeof data.vapi_structured_output === 'object'
                    ? (data.vapi_structured_output as Record<string, unknown>)
                    : null
                );
                const vo = evaluationFromDb ?? derivedFromStructuredOutputs;
                const hasEvaluation = Boolean(vo);

                if (!hasEvaluation && !structuredOutputsMap) {
                  return (
                    <p className="text-sm text-muted-foreground">
                      No evaluation yet. Click “Run evaluation” above, wait 1–2 minutes, then “Check for results.”
                    </p>
                  );
                }

                  const categories: { key: string; label: string }[] = [
                    { key: 'greeting_and_setup', label: 'Greeting & Setup' },
                    { key: 'turn_discipline', label: 'Turn discipline' },
                    { key: 'follow_up_limits', label: 'Follow-up limits' },
                    { key: 'reflection', label: 'Reflection' },
                    { key: 'adaptation_to_user_errors', label: 'Adaptation to user errors' },
                    { key: 'summary_check', label: 'Summary check' },
                    { key: 'closing', label: 'Closing' },
                    { key: 'boundaries', label: 'Boundaries' },
                  ];
                  const totalScore = vo && typeof vo.total_score === 'number' ? vo.total_score : null;
                  const maxScore = 24;
                  return (
                    <div className="space-y-4">
                      {hasEvaluation ? (
                        <>
                          <div className="rounded-md border overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b bg-muted/50">
                                  <th className="text-left p-3 font-medium">Category</th>
                                  <th className="text-center p-3 font-medium w-20">Score</th>
                                  <th className="text-left p-3 font-medium">Reason</th>
                                </tr>
                              </thead>
                              <tbody>
                                {categories.map(({ key, label }) => {
                                  const score = vo ? vo[key] : null;
                                  const reason = vo ? vo[`${key}_reason`] : null;
                                  return (
                                    <tr key={key} className="border-b last:border-0">
                                      <td className="p-3 font-medium">{label}</td>
                                      <td className="p-3 text-center">
                                        {typeof score === 'number' ? (
                                          <span className={cn(
                                            score === 3 && 'text-green-600 dark:text-green-500',
                                            score === 2 && 'text-amber-600 dark:text-amber-500',
                                            score === 1 && 'text-red-600 dark:text-red-500'
                                          )}>
                                            {score}/3
                                          </span>
                                        ) : '—'}
                                      </td>
                                      <td className="p-3 text-muted-foreground">{typeof reason === 'string' ? reason : '—'}</td>
                                    </tr>
                                  );
                                })}
                                <tr className="border-t-2 bg-muted/30">
                                  <td className="p-3 font-semibold">Total</td>
                                  <td className="p-3 text-center font-mono">
                                    {totalScore != null ? `${totalScore}/${maxScore}` : '—'}
                                  </td>
                                  <td className="p-3 text-muted-foreground">
                                    {vo && typeof vo.overall_justification === 'string' ? vo.overall_justification : '—'}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          {data.vapi_structured_output_at && (
                            <p className="text-xs text-muted-foreground">
                              Evaluation fetched: {new Date(data.vapi_structured_output_at).toLocaleString()}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No flattened evaluation saved yet, but raw structured outputs are available below.
                        </p>
                      )}

                      <div className="rounded-md border bg-muted/10 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">Raw structured outputs (Vapi)</p>
                            <p className="text-xs text-muted-foreground">
                              Useful for debugging shape issues (e.g., long calls, missing fields, truncation upstream).
                            </p>
                          </div>
                          {data.vapi_structured_outputs_at && (
                            <p className="text-xs text-muted-foreground shrink-0">
                              Fetched: {new Date(data.vapi_structured_outputs_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                        {structuredOutputsMap ? (
                          <div className="mt-3 space-y-2">
                            {Object.entries(structuredOutputsMap).map(([key, entry]) => {
                              const entryObj = entry && typeof entry === 'object' ? (entry as any) : null;
                              const name = typeof entryObj?.name === 'string' ? entryObj.name : null;
                              const payload = entryObj?.result ?? entryObj ?? entry;
                              const text = (() => {
                                try {
                                  return JSON.stringify(payload, null, 2);
                                } catch {
                                  return String(payload);
                                }
                              })();
                              return (
                                <Collapsible key={key} defaultOpen={false}>
                                  <div className="flex items-center justify-between gap-2 rounded border bg-background px-3 py-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium truncate">
                                        {name ? `${name} (${key})` : key}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                          try {
                                            await navigator.clipboard.writeText(text);
                                            toast.success('Copied JSON');
                                          } catch (e) {
                                            console.error(e);
                                            toast.error('Failed to copy JSON');
                                          }
                                        }}
                                      >
                                        Copy JSON
                                      </Button>
                                      <CollapsibleTrigger asChild>
                                        <Button size="sm" variant="outline">
                                          <ChevronDown className="h-4 w-4" />
                                        </Button>
                                      </CollapsibleTrigger>
                                    </div>
                                  </div>
                                  <CollapsibleContent className="mt-2">
                                    <pre className="max-h-96 overflow-auto rounded border bg-background p-3 text-xs leading-relaxed">
                                      {text}
                                    </pre>
                                  </CollapsibleContent>
                                </Collapsible>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="mt-3 text-xs italic text-muted-foreground">
                            No raw structured outputs saved yet. Click “Check for results” above to fetch from Vapi.
                          </p>
                        )}
                      </div>
                    </div>
                  );
              })()}
            </CardContent>
          </Card>
        </section>

        {/* Journey Section */}
        <section ref={el => sectionRefs.current['journey'] = el} id="journey" className="scroll-mt-32">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Route className="h-5 w-5 text-primary" />
                Participant Journey
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                View the participant's navigation timeline through the experiment, including page visits, time spent, and any back button usage.
              </p>
              <Button onClick={() => setJourneyModalOpen(true)} variant="outline">
                <Route className="h-4 w-4 mr-2" />
                View Full Journey Timeline
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Session Replay Section */}
        <section ref={el => sectionRefs.current['replay'] = el} id="replay" className="scroll-mt-32">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MousePointer2 className="h-5 w-5 text-sky-500" />
                Session Replay
                {(replayLoading || replayLoadingMore) && (
                  <span className="ml-2 inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    {replayLoading
                      ? 'Loading...'
                      : replayBatchProgress
                        ? `Loading more data (${replayBatchProgress.loaded}/${replayBatchProgress.total} chunks)...`
                        : 'Loading more data...'}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                This replay is powered by rrweb event capture and includes DOM changes, cursor movement, clicks, and scrolling as they occurred during the participant session.
              </p>
              {replayLoading && replayEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                  <span className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-muted-foreground" />
                  <p className="text-sm">
                    {replayBatchProgress
                      ? `Loading session replay data (${replayBatchProgress.loaded}/${replayBatchProgress.total} chunks)...`
                      : 'Loading session replay data...'}
                  </p>
                </div>
              ) : (
                <>
                  {replayLoadingMore && (
                    <div className="mb-3 flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
                      Partial replay loaded — still fetching remaining data
                      {replayBatchProgress ? ` (${replayBatchProgress.loaded}/${replayBatchProgress.total} chunks)` : ''}...
                      The full timeline will update automatically.
                    </div>
                  )}
                  <SessionReplayPanel events={replayEvents} markers={replayMarkers} />
                </>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Demographics Section */}
        <section ref={el => sectionRefs.current['demographics'] = el} id="demographics" className="scroll-mt-32">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-cyan-500" />
                Demographics
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.demographics || data.prolificExportDemographics ? (
                <>
                  {(() => {
                    const demo = data.demographics;
                    const prolific = data.prolificExportDemographics;
                    const norm = (s: string | null | undefined) => (s ?? '').toString().trim().toLowerCase();
                    const birthYearRaw = (demo?.age ?? '').toString().trim();
                    const birthYear = /^\d{4}$/.test(birthYearRaw) ? parseInt(birthYearRaw, 10) : null;
                    const surveyYear = demo?.created_at ? new Date(demo.created_at).getUTCFullYear() : null;
                    const ageAtSurvey = birthYear != null && surveyYear != null ? surveyYear - birthYear : null;
                    const prolificAge = prolific?.age != null && Number.isFinite(Number(prolific.age)) ? Number(prolific.age) : null;
                    const ageMismatch = ageAtSurvey != null && prolificAge != null && Math.abs(ageAtSurvey - prolificAge) > 1;
                    const genderMismatch = demo && prolific && norm(demo.gender) !== norm(prolific.gender ?? '');
                    const anyMismatch = ageMismatch || genderMismatch;
                    const hasBoth = Boolean(demo && prolific);
                    return (
                      <div className="space-y-4">
                        {hasBoth && (
                          <div className="flex items-center gap-2">
                            {anyMismatch ? (
                              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50/80 dark:bg-amber-950/30 dark:border-amber-700 dark:text-amber-400">
                                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                                Mismatch with Prolific export
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50/80 dark:bg-green-950/30 dark:border-green-700 dark:text-green-400">
                                <Check className="h-3.5 w-3.5 mr-1" />
                                Matches Prolific export
                              </Badge>
                            )}
                          </div>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          <div>
                            <label className="text-sm text-muted-foreground">Age</label>
                            <p className="font-medium">
                              {ageMismatch && prolificAge != null && ageAtSurvey != null
                                ? `Prolific: ${prolificAge} | In-app (at survey): ${ageAtSurvey}`
                                : prolificAge != null
                                  ? String(prolificAge)
                                  : ageAtSurvey != null
                                    ? `${ageAtSurvey} (from birth year at survey)`
                                    : demo
                                      ? (demo.age ?? '–')
                                      : '–'}
                            </p>
                          </div>
                          <div>
                            <label className="text-sm text-muted-foreground">Gender</label>
                            <p className="font-medium">
                              {genderMismatch && prolific?.gender != null && demo?.gender != null
                                ? `Prolific: ${prolific.gender} | In-app: ${demo.gender}`
                                : (prolific?.gender ?? demo?.gender ?? '–')}
                            </p>
                          </div>
                          {prolific?.ethnicity_simplified != null && (
                            <div>
                              <label className="text-sm text-muted-foreground">Ethnicity (Prolific)</label>
                              <p className="font-medium">{prolific.ethnicity_simplified}</p>
                            </div>
                          )}
                          {demo && (
                            <>
                              <div>
                                <label className="text-sm text-muted-foreground">Native English Speaker</label>
                                <p className="font-medium">{demo.native_english}</p>
                              </div>
                              <div className="col-span-2 md:col-span-3">
                                <label className="text-sm text-muted-foreground">Ethnicity (in-app)</label>
                                <p className="font-medium">
                                  {Array.isArray(demo.ethnicity)
                                    ? (demo.ethnicity as string[]).join(', ')
                                    : String(demo.ethnicity)}
                                </p>
                              </div>
                              {demo.voice_assistant_familiarity != null && (
                                <div>
                                  <label className="text-sm text-muted-foreground">Voice Assistant Familiarity</label>
                                  <p className="font-medium">
                                    {formatWholeNumber(demo.voice_assistant_familiarity)} - {FAMILIARITY_LABELS[demo.voice_assistant_familiarity] || "Unknown"}
                                  </p>
                                </div>
                              )}
                              {demo.voice_assistant_usage_frequency != null && (
                                <div>
                                  <label className="text-sm text-muted-foreground">Voice Assistant Usage Frequency</label>
                                  <p className="font-medium">
                                    {formatWholeNumber(demo.voice_assistant_usage_frequency)} - {USAGE_FREQUENCY_LABELS[demo.voice_assistant_usage_frequency] || "Unknown"}
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <p className="text-muted-foreground italic">No demographic data available</p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Attention Checks Section */}
        <section ref={el => sectionRefs.current['attention'] = el} id="attention" className="scroll-mt-32">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-500" />
                Attention Check Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* PETS Attention Check */}
                {data.attention_check_1 != null && (
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                    <span className="font-medium">PETS Attention Check</span>
                    <div className="flex-1" />
                    <span className="text-sm">Response: {data.attention_check_1}</span>
                    <span className="text-sm text-muted-foreground">Expected: {data.attention_check_1_expected}</span>
                    {data.attention_check_1 === data.attention_check_1_expected ? (
                      <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" /> Pass</Badge>
                    ) : (
                      <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Fail</Badge>
                    )}
                  </div>
                )}

                {/* TIAS Attention Check */}
                {data.tias_attention_check_1 != null && (
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                    <span className="font-medium">TIAS Attention Check</span>
                    <div className="flex-1" />
                    <span className="text-sm">Response: {data.tias_attention_check_1}</span>
                    <span className="text-sm text-muted-foreground">Expected: {data.tias_attention_check_1_expected}</span>
                    {data.tias_attention_check_1 === data.tias_attention_check_1_expected ? (
                      <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" /> Pass</Badge>
                    ) : (
                      <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Fail</Badge>
                    )}
                  </div>
                )}

                {/* Godspeed Attention Check */}
                {data.godspeed_attention_check_1 != null && (
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                    <span className="font-medium">Godspeed Attention Check</span>
                    <div className="flex-1" />
                    <span className="text-sm">Response: {data.godspeed_attention_check_1}</span>
                    <span className="text-sm text-muted-foreground">Expected: {data.godspeed_attention_check_1_expected}</span>
                    {data.godspeed_attention_check_1 === data.godspeed_attention_check_1_expected ? (
                      <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" /> Pass</Badge>
                    ) : (
                      <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Fail</Badge>
                    )}
                  </div>
                )}

                {/* TIPI Attention Check */}
                {data.tipi_attention_check_1 != null && (
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                    <span className="font-medium">TIPI Attention Check</span>
                    <div className="flex-1" />
                    <span className="text-sm">Response: {data.tipi_attention_check_1}</span>
                    <span className="text-sm text-muted-foreground">Expected: {data.tipi_attention_check_1_expected}</span>
                    {data.tipi_attention_check_1 === data.tipi_attention_check_1_expected ? (
                      <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" /> Pass</Badge>
                    ) : (
                      <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Fail</Badge>
                    )}
                  </div>
                )}

                {data.attention_check_1 == null && data.tias_attention_check_1 == null && data.godspeed_attention_check_1 == null && data.tipi_attention_check_1 == null && (
                  <p className="text-muted-foreground italic">No attention check data available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Formality Section */}
        <section ref={el => sectionRefs.current['formality'] = el} id="formality" className="scroll-mt-32">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-purple-500" />
                Formality Perception
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* User Perception of Formality */}
              <div>
                <h4 className="font-medium mb-3">User Perception of Cali's Formality</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  "How formal did you find Cali?" (1-7 scale)
                </p>
                <div className="flex items-center gap-2">
                  {FORMALITY_SCALE_LABELS.map(item => (
                    <div 
                      key={item.value}
                      className={cn(
                        "flex-1 py-3 rounded text-center",
                        data.formality === item.value 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <div className="text-lg font-bold">{item.value}</div>
                      <div className="text-xs px-1">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI F-Score */}
              <div>
                <h4 className="font-medium mb-3">AI-Calculated Formality Score</h4>
                {data.ai_formality_score != null ? (
                  <div className="flex items-center gap-4">
                    <div className="text-3xl font-bold">{formatNumber(data.ai_formality_score)}</div>
                    {data.ai_formality_interpretation && (
                      <Badge variant="outline">{data.ai_formality_interpretation}</Badge>
                    )}
                    {formalityCalcId && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => navigate(`/researcher/formality/${formalityCalcId}`)}
                      >
                        View Full Breakdown
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Not calculated</p>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* PETS Section */}
        <section ref={el => sectionRefs.current['pets'] = el} id="pets" className="scroll-mt-32">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-rose-500" />
                PETS - Perceived Empathy of Technology Scale
              </CardTitle>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Total:</span>
                  <span className="ml-1 font-bold">{formatNumber(data.pets_total)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">ER (Emotional Responsiveness):</span>
                  <span className="ml-1 font-semibold">{formatNumber(data.pets_er)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">UT (Understanding and Trust):</span>
                  <span className="ml-1 font-semibold">{formatNumber(data.pets_ut)}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {PETS_ITEMS.map(item => {
                  const value = data[item.key as keyof typeof data] as number | null;
                  const position = data[`${item.key}_position` as keyof typeof data] as number | null;
                  return (
                    <div key={item.id} className="flex items-center gap-4 py-2 border-b last:border-0">
                      <Badge variant="outline" className="font-mono w-10 justify-center flex-shrink-0">
                        {item.id}
                      </Badge>
                      <Badge variant="secondary" className="flex-shrink-0 text-xs">
                        {item.subscale}
                      </Badge>
                      <span className="flex-1 text-sm">{item.text}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-muted rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${value ?? 0}%` }}
                          />
                        </div>
                        <span className="font-mono text-sm w-12 text-right">{value ?? 'N/A'}</span>
                      </div>
                      {position != null && (
                        <span className="text-xs text-muted-foreground w-12">Pos: {position}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* TIAS Section */}
        <section ref={el => sectionRefs.current['tias'] = el} id="tias" className="scroll-mt-32">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-blue-500" />
                TIAS - Trust in Automation Scale
              </CardTitle>
              <div className="text-sm">
                <span className="text-muted-foreground">Total Score:</span>
                <span className="ml-1 font-bold">{formatNumber(data.tias_total)}</span>
                <span className="text-xs text-muted-foreground ml-2">(Scale: 1-7, higher = more trust)</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {TIAS_ITEMS.map(item => {
                  const value = data[item.key as keyof typeof data] as number | null;
                  const position = data[`${item.key}_position` as keyof typeof data] as number | null;
                  return (
                    <div key={item.id} className="flex items-center gap-4 py-2 border-b last:border-0">
                      <Badge variant="outline" className="font-mono w-10 justify-center flex-shrink-0">
                        {item.id}
                      </Badge>
                      {item.isReversed && (
                        <Badge variant="destructive" className="flex-shrink-0 text-xs">
                          Reversed
                        </Badge>
                      )}
                      <span className={cn("flex-1 text-sm", !item.isReversed && "ml-[68px]")}>{item.text}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          {[1,2,3,4,5,6,7].map(v => (
                            <div 
                              key={v}
                              className={cn(
                                "w-5 h-5 rounded-full flex items-center justify-center text-xs",
                                value === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                              )}
                            >
                              {v}
                            </div>
                          ))}
                        </div>
                      </div>
                      {position != null && (
                        <span className="text-xs text-muted-foreground w-12">Pos: {position}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Godspeed Section */}
        <section ref={el => sectionRefs.current['godspeed'] = el} id="godspeed" className="scroll-mt-32">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                Godspeed Questionnaire
              </CardTitle>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Anthropomorphism:</span>
                  <span className="ml-1 font-bold">{formatNumber(data.godspeed_anthro_total)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Likeability:</span>
                  <span className="ml-1 font-bold">{formatNumber(data.godspeed_like_total)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Intelligence:</span>
                  <span className="ml-1 font-bold">{formatNumber(data.godspeed_intel_total)}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Anthropomorphism */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Badge>Anthropomorphism</Badge>
                  <span className="text-sm text-muted-foreground">Total: {formatNumber(data.godspeed_anthro_total)}</span>
                </h4>
                <div className="space-y-2">
                  {GODSPEED_ANTHRO_ITEMS.map(item => {
                    const value = data[item.key as keyof typeof data] as number | null;
                    const position = data[`${item.key}_position` as keyof typeof data] as number | null;
                    return (
                      <div key={item.id} className="flex items-center gap-3 py-2">
                        <span className="text-sm text-muted-foreground w-24 text-right">{item.leftLabel}</span>
                        <div className="flex-1 flex items-center gap-1">
                          {[1,2,3,4,5].map(v => (
                            <div 
                              key={v}
                              className={cn(
                                "flex-1 h-6 rounded flex items-center justify-center text-xs font-medium",
                                value === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                              )}
                            >
                              {v}
                            </div>
                          ))}
                        </div>
                        <span className="text-sm text-muted-foreground w-24">{item.rightLabel}</span>
                        {position != null && (
                          <span className="text-xs text-muted-foreground">Pos: {position}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Likeability */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Badge variant="secondary">Likeability</Badge>
                  <span className="text-sm text-muted-foreground">Total: {formatNumber(data.godspeed_like_total)}</span>
                </h4>
                <div className="space-y-2">
                  {GODSPEED_LIKE_ITEMS.map(item => {
                    const value = data[item.key as keyof typeof data] as number | null;
                    const position = data[`${item.key}_position` as keyof typeof data] as number | null;
                    return (
                      <div key={item.id} className="flex items-center gap-3 py-2">
                        <span className="text-sm text-muted-foreground w-24 text-right">{item.leftLabel}</span>
                        <div className="flex-1 flex items-center gap-1">
                          {[1,2,3,4,5].map(v => (
                            <div 
                              key={v}
                              className={cn(
                                "flex-1 h-6 rounded flex items-center justify-center text-xs font-medium",
                                value === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                              )}
                            >
                              {v}
                            </div>
                          ))}
                        </div>
                        <span className="text-sm text-muted-foreground w-24">{item.rightLabel}</span>
                        {position != null && (
                          <span className="text-xs text-muted-foreground">Pos: {position}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Intelligence */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Badge variant="outline">Intelligence</Badge>
                  <span className="text-sm text-muted-foreground">Total: {formatNumber(data.godspeed_intel_total)}</span>
                </h4>
                <div className="space-y-2">
                  {GODSPEED_INTEL_ITEMS.map(item => {
                    const value = data[item.key as keyof typeof data] as number | null;
                    const position = data[`${item.key}_position` as keyof typeof data] as number | null;
                    return (
                      <div key={item.id} className="flex items-center gap-3 py-2">
                        <span className="text-sm text-muted-foreground w-24 text-right">{item.leftLabel}</span>
                        <div className="flex-1 flex items-center gap-1">
                          {[1,2,3,4,5].map(v => (
                            <div 
                              key={v}
                              className={cn(
                                "flex-1 h-6 rounded flex items-center justify-center text-xs font-medium",
                                value === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                              )}
                            >
                              {v}
                            </div>
                          ))}
                        </div>
                        <span className="text-sm text-muted-foreground w-24">{item.rightLabel}</span>
                        {position != null && (
                          <span className="text-xs text-muted-foreground">Pos: {position}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* TIPI Section */}
        <section ref={el => sectionRefs.current['tipi'] = el} id="tipi" className="scroll-mt-32">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-violet-500" />
                TIPI - Ten-Item Personality Inventory
              </CardTitle>
              <div className="flex gap-4 text-sm flex-wrap">
                {TIPI_DIMENSIONS.map(dim => {
                  const value = data[dim.key as keyof typeof data] as number | null;
                  return (
                    <div key={dim.key}>
                      <span className="text-muted-foreground">{dim.label}:</span>
                      <span className="ml-1 font-semibold">{formatNumber(value)}</span>
                    </div>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                "I see myself as..." (1 = Disagree strongly, 7 = Agree strongly)
              </p>
              <div className="space-y-3">
                {TIPI_ITEMS.map(item => {
                  const value = data[item.key as keyof typeof data] as number | null;
                  const position = data[`${item.key}_position` as keyof typeof data] as number | null;
                  return (
                    <div key={item.id} className="flex items-center gap-4 py-2 border-b last:border-0">
                      <Badge variant="outline" className="font-mono w-12 justify-center flex-shrink-0">
                        {item.id}
                      </Badge>
                      <Badge 
                        variant={item.isReversed ? "destructive" : "secondary"} 
                        className="flex-shrink-0 text-xs min-w-[100px] justify-center"
                      >
                        {item.dimension}{item.isReversed ? " (R)" : ""}
                      </Badge>
                      <span className="flex-1 text-sm">{item.text}</span>
                      <div className="flex items-center gap-1">
                        {[1,2,3,4,5,6,7].map(v => (
                          <div 
                            key={v}
                            className={cn(
                              "w-7 h-7 rounded flex items-center justify-center text-xs font-medium",
                              value === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                            )}
                          >
                            {v}
                          </div>
                        ))}
                      </div>
                      {position != null && (
                        <span className="text-xs text-muted-foreground w-12">Pos: {position}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Intention Section */}
        <section ref={el => sectionRefs.current['intention'] = el} id="intention" className="scroll-mt-32">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-indigo-500" />
                Behavioral Intention to Use Voice Assistants
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {INTENTION_QUESTIONS.map((question, index) => {
                  const value = index === 0 ? data.intention_1 : data.intention_2;
                  return (
                    <div key={index} className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm mb-3">{question}</p>
                      <div className="flex gap-1">
                        {INTENTION_SCALE_LABELS.map((label, i) => (
                          <div 
                            key={i}
                            className={cn(
                              "flex-1 py-2 rounded text-center text-xs",
                              value === i + 1 
                                ? "bg-primary text-primary-foreground" 
                                : "bg-background border"
                            )}
                          >
                            <div className="font-bold">{i + 1}</div>
                            <div className="hidden sm:block">{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Feedback Section */}
        <section ref={el => sectionRefs.current['feedback'] = el} id="feedback" className="scroll-mt-32">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-green-500" />
                Participant Feedback
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {feedbackDraftSavedAt && (
                <p className="text-xs text-muted-foreground">
                  Latest autosaved feedback draft: {new Date(feedbackDraftSavedAt).toLocaleString()}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-amber-100/60 px-2 py-0.5 text-amber-900">Typed text</span>
                <span className="rounded bg-sky-100/80 px-2 py-0.5 text-sky-900">Dictated text</span>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-muted-foreground">Voice Assistant Feedback</label>
                  <div className="flex items-center gap-2">
                    {feedbackDraftUsage.voice_assistant_feedback && (
                      <Badge variant="secondary">Draft (not submitted)</Badge>
                    )}
                    <Badge variant="outline">
                      Input: {formatFeedbackInputSource(
                        feedbackInputSources.voice_assistant_feedback.typed,
                        feedbackInputSources.voice_assistant_feedback.dictated
                      )}
                    </Badge>
                  </div>
                </div>
                <p className="mt-1 p-3 bg-muted/50 rounded-lg text-sm">
                  {renderFeedbackTextWithHighlights("voice_assistant_feedback", data.voice_assistant_feedback)}
                </p>
                {renderDictationRecordings("voice_assistant_feedback")}
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-muted-foreground">Communication Style Feedback</label>
                  <div className="flex items-center gap-2">
                    {feedbackDraftUsage.communication_style_feedback && (
                      <Badge variant="secondary">Draft (not submitted)</Badge>
                    )}
                    <Badge variant="outline">
                      Input: {formatFeedbackInputSource(
                        feedbackInputSources.communication_style_feedback.typed,
                        feedbackInputSources.communication_style_feedback.dictated
                      )}
                    </Badge>
                  </div>
                </div>
                <p className="mt-1 p-3 bg-muted/50 rounded-lg text-sm">
                  {renderFeedbackTextWithHighlights("communication_style_feedback", data.communication_style_feedback)}
                </p>
                {renderDictationRecordings("communication_style_feedback")}
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-muted-foreground">Experiment Feedback</label>
                  <div className="flex items-center gap-2">
                    {feedbackDraftUsage.experiment_feedback && (
                      <Badge variant="secondary">Draft (not submitted)</Badge>
                    )}
                    <Badge variant="outline">
                      Input: {formatFeedbackInputSource(
                        feedbackInputSources.experiment_feedback.typed,
                        feedbackInputSources.experiment_feedback.dictated
                      )}
                    </Badge>
                  </div>
                </div>
                <p className="mt-1 p-3 bg-muted/50 rounded-lg text-sm">
                  {renderFeedbackTextWithHighlights("experiment_feedback", data.experiment_feedback)}
                </p>
                {renderDictationRecordings("experiment_feedback")}
              </div>
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-muted-foreground">Early Access Signup</label>
                  <Badge
                    variant={
                      isPendingRecord
                        ? "outline"
                        : data.early_access_notify === true
                          ? "default"
                          : data.early_access_notify === false
                            ? "secondary"
                            : "outline"
                    }
                  >
                    {isPendingRecord
                      ? "Pending response"
                      : data.early_access_notify === true
                        ? "Opted in"
                        : data.early_access_notify === false
                          ? "Did not opt in"
                          : "Not available"}
                  </Badge>
                </div>
                <p className="mt-1 p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
                  {isPendingRecord
                    ? "No early access response recorded yet."
                    : data.early_access_notes?.trim() || "No notes provided."}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Journey Modal */}
      <ParticipantJourneyModal
        open={journeyModalOpen}
        onOpenChange={setJourneyModalOpen}
        prolificId={data.prolific_id}
        status="Completed"
        condition={data.assistant_type}
      />

      <AlertDialog open={createBatchDialog.open} onOpenChange={(open) => !open && setCreateBatchDialog({ open: false, batchLabel: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batch fully reviewed</AlertDialogTitle>
            <AlertDialogDescription>
              All participants in batch {createBatchDialog.batchLabel ?? ''} are reviewed. Do you want to create a new batch?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Later</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCreateBatchDialog({ open: false, batchLabel: null });
                navigate('/researcher/dashboard', { state: { openTab: 'settings', openBatchCreate: true } });
              }}
            >
              Create new batch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ResponseDetails;
