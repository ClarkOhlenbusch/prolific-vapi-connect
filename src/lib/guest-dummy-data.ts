// Guest mode dummy data - realistic sample data for dashboard preview

export interface GuestParticipant {
  id: string;
  prolific_id: string;
  call_id: string;
  created_at: string;
  is_completed: boolean;
  response_id?: string;
  assistant_type?: string | null;
  batch_label?: string | null;
  pets_total?: number | null;
  tias_total?: number | null;
  formality?: number | null;
  reviewed_by_researcher?: boolean;
  flagged?: boolean;
  age?: string | null;
  gender?: string | null;
  status: 'Completed' | 'Pending';
}

export interface GuestBatch {
  id: string;
  name: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string;
  display_order: number;
}

export interface GuestNoConsentFeedback {
  id: string;
  feedback: string | null;
  prolific_id: string | null;
  created_at: string;
}

export interface GuestNavigationEvent {
  page_name: string;
  time_on_page_seconds: number | null;
  prolific_id: string;
}

export interface GuestPrompt {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  name: string;
  prompt_text: string;
  condition: 'formal' | 'informal';
  batch_label: string | null;
  version: number;
  parent_version_id: string | null;
  vapi_assistant_id: string | null;
  vapi_assistant_name: string | null;
  notes: string | null;
  is_active: boolean;
}

// Generate realistic Prolific IDs (24 characters)
const generateProlificId = (index: number): string => {
  const chars = 'abcdef0123456789';
  let id = '';
  // Use index as seed for reproducibility
  for (let i = 0; i < 24; i++) {
    id += chars[(index * 7 + i * 13) % chars.length];
  }
  return id;
};

// Generate realistic call IDs (UUID format)
const generateCallId = (index: number): string => {
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  return `${hex(index * 12345)}-${hex(index * 67).slice(0, 4)}-${hex(index * 89).slice(0, 4)}-${hex(index * 23).slice(0, 4)}-${hex(index * 456789).slice(0, 12)}`;
};

// Generate dates going back from today
const generateDate = (daysAgo: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(Math.floor(Math.random() * 12) + 8); // 8 AM to 8 PM
  date.setMinutes(Math.floor(Math.random() * 60));
  return date.toISOString();
};

// Batches
export const GUEST_BATCHES: GuestBatch[] = [
  {
    id: 'batch-001',
    name: 'Main Collection',
    notes: 'Primary data collection phase with balanced conditions',
    is_active: true,
    created_at: generateDate(45),
    created_by: 'researcher-001',
    display_order: 2,
  },
  {
    id: 'batch-002',
    name: 'Pilot Study',
    notes: 'Initial pilot testing with 12 participants',
    is_active: false,
    created_at: generateDate(60),
    created_by: 'researcher-001',
    display_order: 1,
  },
  {
    id: 'batch-003',
    name: 'Follow-up',
    notes: 'Additional participants for power analysis',
    is_active: false,
    created_at: generateDate(14),
    created_by: 'researcher-001',
    display_order: 3,
  },
];

// Generate 42 realistic participants (24 formal, 18 informal)
export const GUEST_PARTICIPANTS: GuestParticipant[] = (() => {
  const participants: GuestParticipant[] = [];
  const batches = ['Main Collection', 'Pilot Study', 'Follow-up'];
  const ages = ['18-24', '25-34', '35-44', '45-54', '55+'];
  const genders = ['male', 'female', 'non-binary', 'prefer not to say'];
  
  // 24 formal participants
  for (let i = 0; i < 24; i++) {
    const daysAgo = Math.floor(i / 3) + 1;
    participants.push({
      id: `participant-formal-${i}`,
      prolific_id: generateProlificId(i),
      call_id: generateCallId(i),
      created_at: generateDate(daysAgo),
      is_completed: true,
      response_id: `response-formal-${i}`,
      assistant_type: 'formal',
      batch_label: batches[i % 3],
      pets_total: 45 + Math.floor(Math.random() * 15), // 45-60
      tias_total: 50 + Math.floor(Math.random() * 20), // 50-70
      formality: 4.5 + Math.random() * 2, // 4.5-6.5
      reviewed_by_researcher: i < 12,
      flagged: i % 5 === 2,
      age: ages[i % ages.length],
      gender: genders[i % genders.length],
      status: 'Completed',
    });
  }
  
  // 18 informal participants
  for (let i = 0; i < 18; i++) {
    const daysAgo = Math.floor(i / 3) + 2;
    participants.push({
      id: `participant-informal-${i}`,
      prolific_id: generateProlificId(i + 100),
      call_id: generateCallId(i + 100),
      created_at: generateDate(daysAgo),
      is_completed: true,
      response_id: `response-informal-${i}`,
      assistant_type: 'informal',
      batch_label: batches[i % 3],
      pets_total: 40 + Math.floor(Math.random() * 15), // 40-55
      tias_total: 45 + Math.floor(Math.random() * 20), // 45-65
      formality: 2.5 + Math.random() * 2, // 2.5-4.5
      reviewed_by_researcher: i < 9,
      flagged: i % 4 === 1,
      age: ages[(i + 2) % ages.length],
      gender: genders[(i + 1) % genders.length],
      status: 'Completed',
    });
  }
  
  // 5 pending participants
  for (let i = 0; i < 5; i++) {
    participants.push({
      id: `participant-pending-${i}`,
      prolific_id: generateProlificId(i + 200),
      call_id: generateCallId(i + 200),
      created_at: generateDate(i),
      is_completed: false,
      status: 'Pending',
    });
  }
  
  return participants;
})();

// No-consent feedback
export const GUEST_NO_CONSENT_FEEDBACK: GuestNoConsentFeedback[] = [
  {
    id: 'feedback-001',
    feedback: 'I was uncomfortable with the idea of speaking to an AI voice assistant. I prefer text-based interactions and did not want to participate in a voice-based study.',
    prolific_id: generateProlificId(500),
    created_at: generateDate(5),
  },
  {
    id: 'feedback-002',
    feedback: 'The time commitment seemed longer than initially expected. I also have concerns about how my voice data will be stored and used.',
    prolific_id: generateProlificId(501),
    created_at: generateDate(8),
  },
  {
    id: 'feedback-003',
    feedback: 'I am not a native English speaker and was worried about being understood correctly by the AI. I think this might affect the study results negatively.',
    prolific_id: generateProlificId(502),
    created_at: generateDate(12),
  },
  {
    id: 'feedback-004',
    feedback: 'Privacy concerns about recording my voice. Even with anonymization, I am not comfortable with this type of data collection.',
    prolific_id: generateProlificId(503),
    created_at: generateDate(18),
  },
  {
    id: 'feedback-005',
    feedback: 'I was in a noisy environment and could not find a quiet space to complete the conversation task properly. I did not want to provide low quality data.',
    prolific_id: generateProlificId(504),
    created_at: generateDate(22),
  },
];

// Navigation events for time analysis
export const GUEST_NAVIGATION_EVENTS: GuestNavigationEvent[] = (() => {
  const events: GuestNavigationEvent[] = [];
  const pages = [
    { name: 'consent', avgTime: 45 },
    { name: 'prolific-id', avgTime: 15 },
    { name: 'demographics', avgTime: 60 },
    { name: 'voice-assistant-familiarity', avgTime: 40 },
    { name: 'practice-conversation', avgTime: 120 },
    { name: 'voice-conversation', avgTime: 240 },
    { name: 'formality', avgTime: 25 },
    { name: 'pets', avgTime: 90 },
    { name: 'tias', avgTime: 75 },
    { name: 'godspeed', avgTime: 60 },
    { name: 'tipi', avgTime: 55 },
    { name: 'intention', avgTime: 30 },
    { name: 'feedback', avgTime: 85 },
    { name: 'debriefing', avgTime: 35 },
    { name: 'complete', avgTime: 10 },
  ];
  
  // Generate events for each completed participant
  GUEST_PARTICIPANTS.filter(p => p.status === 'Completed').forEach((participant) => {
    pages.forEach((page) => {
      // Add some variance to times
      const variance = (Math.random() - 0.5) * page.avgTime * 0.4;
      events.push({
        page_name: page.name,
        time_on_page_seconds: Math.round(page.avgTime + variance),
        prolific_id: participant.prolific_id,
      });
    });
  });
  
  return events;
})();

// Sample prompts for PromptLab
export const GUEST_PROMPTS: GuestPrompt[] = [
  {
    id: 'prompt-001',
    created_at: generateDate(30),
    updated_at: generateDate(15),
    created_by: 'researcher-001',
    name: 'Formal Assistant v2',
    prompt_text: 'You are a professional research assistant conducting a structured interview. Maintain formal language, use complete sentences, and address the participant respectfully. Avoid contractions and colloquialisms.',
    condition: 'formal',
    batch_label: 'Main Collection',
    version: 2,
    parent_version_id: 'prompt-003',
    vapi_assistant_id: 'asst_formal_001',
    vapi_assistant_name: 'Dr. Research',
    notes: 'Updated to be more consistent with academic tone',
    is_active: true,
  },
  {
    id: 'prompt-002',
    created_at: generateDate(30),
    updated_at: generateDate(20),
    created_by: 'researcher-001',
    name: 'Informal Assistant v2',
    prompt_text: "Hey! You're a friendly chat buddy having a casual conversation. Use contractions, be relaxed, and keep things light and fun. Feel free to use common expressions and be personable.",
    condition: 'informal',
    batch_label: 'Main Collection',
    version: 2,
    parent_version_id: 'prompt-004',
    vapi_assistant_id: 'asst_informal_001',
    vapi_assistant_name: 'Alex',
    notes: 'Made more casual and approachable',
    is_active: true,
  },
  {
    id: 'prompt-003',
    created_at: generateDate(60),
    updated_at: generateDate(60),
    created_by: 'researcher-001',
    name: 'Formal Assistant v1',
    prompt_text: 'You are a research assistant. Be formal and professional in your responses.',
    condition: 'formal',
    batch_label: 'Pilot Study',
    version: 1,
    parent_version_id: null,
    vapi_assistant_id: null,
    vapi_assistant_name: null,
    notes: 'Initial pilot version',
    is_active: false,
  },
  {
    id: 'prompt-004',
    created_at: generateDate(60),
    updated_at: generateDate(60),
    created_by: 'researcher-001',
    name: 'Informal Assistant v1',
    prompt_text: 'Be casual and friendly. Have a relaxed conversation.',
    condition: 'informal',
    batch_label: 'Pilot Study',
    version: 1,
    parent_version_id: null,
    vapi_assistant_id: null,
    vapi_assistant_name: null,
    notes: 'Initial pilot version',
    is_active: false,
  },
];

// Activity logs for guest mode
export interface GuestActivityLog {
  id: string;
  user_id: string;
  user_email: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export const GUEST_ACTIVITY_LOGS: GuestActivityLog[] = [
  {
    id: 'log-001',
    user_id: 'user-001',
    user_email: 'researcher@university.edu',
    action: 'login',
    details: {},
    created_at: generateDate(0),
  },
  {
    id: 'log-002',
    user_id: 'user-001',
    user_email: 'researcher@university.edu',
    action: 'download_experiment_responses',
    details: { count: 42, filters: { status: 'completed' } },
    created_at: generateDate(1),
  },
  {
    id: 'log-003',
    user_id: 'user-002',
    user_email: 'assistant@university.edu',
    action: 'login',
    details: {},
    created_at: generateDate(2),
  },
  {
    id: 'log-004',
    user_id: 'user-001',
    user_email: 'researcher@university.edu',
    action: 'download_demographics',
    details: { count: 42 },
    created_at: generateDate(3),
  },
  {
    id: 'log-005',
    user_id: 'user-002',
    user_email: 'assistant@university.edu',
    action: 'download_formality_scores',
    details: { count: 38 },
    created_at: generateDate(4),
  },
  {
    id: 'log-006',
    user_id: 'user-001',
    user_email: 'researcher@university.edu',
    action: 'login',
    details: {},
    created_at: generateDate(5),
  },
  {
    id: 'log-007',
    user_id: 'user-003',
    user_email: 'pi@university.edu',
    action: 'login',
    details: {},
    created_at: generateDate(7),
  },
  {
    id: 'log-008',
    user_id: 'user-003',
    user_email: 'pi@university.edu',
    action: 'download_participant_calls',
    details: { count: 47 },
    created_at: generateDate(8),
  },
];

// Archived responses for guest mode
export interface GuestArchivedResponse {
  id: string;
  original_table: string;
  original_id: string;
  archived_data: Record<string, unknown>;
  archived_by: string;
  archived_at: string;
  archive_reason: string | null;
}

export const GUEST_ARCHIVED_RESPONSES: GuestArchivedResponse[] = [
  {
    id: 'archived-001',
    original_table: 'experiment_responses',
    original_id: 'resp-deleted-001',
    archived_data: {
      prolific_id: generateProlificId(900),
      call_id: generateCallId(900),
      pets_total: 32,
      tias_total: 28,
      formality: 2.1,
      assistant_type: 'informal',
    },
    archived_by: 'researcher@university.edu',
    archived_at: generateDate(10),
    archive_reason: 'Participant withdrew consent after completion',
  },
  {
    id: 'archived-002',
    original_table: 'experiment_responses',
    original_id: 'resp-deleted-002',
    archived_data: {
      prolific_id: generateProlificId(901),
      call_id: generateCallId(901),
      pets_total: 15,
      tias_total: 12,
      formality: 1.5,
      assistant_type: 'formal',
    },
    archived_by: 'researcher@university.edu',
    archived_at: generateDate(15),
    archive_reason: 'Failed multiple attention checks',
  },
  {
    id: 'archived-003',
    original_table: 'demographics',
    original_id: 'demo-deleted-001',
    archived_data: {
      prolific_id: generateProlificId(902),
      age: '25-34',
      gender: 'male',
    },
    archived_by: 'pi@university.edu',
    archived_at: generateDate(20),
    archive_reason: 'Duplicate submission detected',
  },
];

// Experiment settings for guest mode
export const GUEST_EXPERIMENT_SETTINGS = {
  assistantType: 'informal' as const,
  alternatingEnabled: true,
  formalCount: 24,
  informalCount: 18,
  offsetCount: 0,
  offsetType: 'informal' as const,
  lastUpdated: generateDate(2),
  availableBatches: ['Main Collection', 'Pilot Study', 'Follow-up'],
};

// Summary stats for DataSummary
export const GUEST_SUMMARY_STATS = {
  totalResponses: 42,
  totalCalls: 47,
  totalArchived: 3,
  avgPetsTotal: 48.5,
  avgPetsER: 24.2,
  avgPetsUT: 24.3,
  avgTiasTotal: 56.8,
  avgFormality: 4.12,
  avgIntention1: 4.8,
  avgIntention2: 4.5,
  avgGodspeedAnthro: 3.2,
  avgGodspeedLike: 3.8,
  avgGodspeedIntel: 4.1,
};

export const GUEST_COMPARISON_STATS = {
  formal: {
    count: 24,
    avgPetsTotal: 52.3,
    avgPetsER: 26.1,
    avgPetsUT: 26.2,
    avgTiasTotal: 58.4,
    avgFormality: 5.2,
    avgFScore: 62.5,
    avgIntention1: 5.1,
    avgIntention2: 4.8,
    avgGodspeedAnthro: 3.4,
    avgGodspeedLike: 4.0,
    avgGodspeedIntel: 4.3,
  },
  informal: {
    count: 18,
    avgPetsTotal: 43.4,
    avgPetsER: 21.7,
    avgPetsUT: 21.7,
    avgTiasTotal: 54.6,
    avgFormality: 3.2,
    avgFScore: 45.2,
    avgIntention1: 4.4,
    avgIntention2: 4.1,
    avgGodspeedAnthro: 2.9,
    avgGodspeedLike: 3.5,
    avgGodspeedIntel: 3.8,
  },
  unknown: {
    count: 0,
    avgPetsTotal: 0,
    avgPetsER: 0,
    avgPetsUT: 0,
    avgTiasTotal: 0,
    avgFormality: 0,
    avgFScore: 0,
    avgIntention1: 0,
    avgIntention2: 0,
    avgGodspeedAnthro: 0,
    avgGodspeedLike: 0,
    avgGodspeedIntel: 0,
  },
};

// Batch stats helper
export const getGuestBatchStats = (batchName: string) => {
  const participants = GUEST_PARTICIPANTS.filter(p => p.batch_label === batchName && p.status === 'Completed');
  const formalCount = participants.filter(p => p.assistant_type === 'formal').length;
  const informalCount = participants.filter(p => p.assistant_type === 'informal').length;
  
  const avgPets = participants.length > 0 
    ? participants.reduce((sum, p) => sum + (p.pets_total || 0), 0) / participants.length 
    : null;
  const avgTias = participants.length > 0 
    ? participants.reduce((sum, p) => sum + (p.tias_total || 0), 0) / participants.length 
    : null;
  const avgFormality = participants.length > 0 
    ? participants.reduce((sum, p) => sum + (p.formality || 0), 0) / participants.length 
    : null;
  
  const dates = participants.map(p => new Date(p.created_at).getTime());
  
  const allReviewed = participants.length > 0 && participants.every(p => p.reviewed_by_researcher);

  return {
    batch_name: batchName,
    total_responses: participants.length,
    formal_count: formalCount,
    informal_count: informalCount,
    first_response_at: dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : null,
    last_response_at: dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null,
    avg_pets_total: avgPets,
    avg_tias_total: avgTias,
    avg_formality: avgFormality,
    all_reviewed: allReviewed,
  };
};

// -----------------------------------------------------------------------------
// Guest mode: response details + journey/replay scaffolding
// -----------------------------------------------------------------------------

export interface GuestJourneyEventDetailed {
  id: string;
  call_id: string | null;
  page_name: string;
  event_type: string;
  time_on_page_seconds: number | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

const hashStringToInt = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const seededFraction = (seed: number, offset: number) => {
  // Deterministic pseudo-random in [0, 1)
  const x = Math.sin(seed * 999 + offset * 97) * 10000;
  return x - Math.floor(x);
};

export const getGuestParticipantByProlificId = (prolificId: string) => {
  return GUEST_PARTICIPANTS.find((p) => p.prolific_id === prolificId) || null;
};

export const getGuestParticipantForResponseRouteId = (routeId: string) => {
  // In the dashboard, completed rows navigate by response_id, pending rows navigate by participant_calls.id.
  const byResponseId = GUEST_PARTICIPANTS.find((p) => p.response_id === routeId);
  if (byResponseId) return byResponseId;
  const byParticipantId = GUEST_PARTICIPANTS.find((p) => p.id === routeId);
  return byParticipantId || null;
};

export const buildGuestDemographics = (participant: GuestParticipant) => {
  const seed = hashStringToInt(participant.prolific_id);
  const familiarity = clamp(1 + Math.floor(seededFraction(seed, 1) * 5), 1, 5);
  const usage = clamp(1 + Math.floor(seededFraction(seed, 2) * 5), 1, 5);

  return {
    prolific_id: participant.prolific_id,
    created_at: participant.created_at,
    age: participant.age || null,
    gender: participant.gender || null,
    voice_assistant_familiarity: familiarity,
    voice_assistant_usage_frequency: usage,
    // Optional placeholders used in some exports/analysis scripts
    education: 'Some college',
    native_language: 'English',
  };
};

export const buildGuestExperimentResponse = (participant: GuestParticipant, responseId: string) => {
  const seed = hashStringToInt(`${participant.prolific_id}-${responseId}`);
  const condition = participant.assistant_type === 'formal' ? 'formal' : 'informal';

  // Helper generators
  const likert7 = (base: number, variance: number, offset: number) => {
    const v = (seededFraction(seed, offset) - 0.5) * variance;
    return clamp(Math.round(base + v), 1, 7);
  };
  const likert5 = (base: number, variance: number, offset: number) => {
    const v = (seededFraction(seed, offset) - 0.5) * variance;
    return clamp(Math.round(base + v), 1, 5);
  };

  // Condition shifts for a plausible demo pattern
  const formalityBase = condition === 'formal' ? 6 : 3;
  const trustBase = condition === 'formal' ? 6 : 5;
  const empathyBase = condition === 'informal' ? 6 : 5;

  // PETS: 10 items, 1-7 each
  const petsEmpathyItems = Array.from({ length: 6 }, (_, i) => likert7(empathyBase, 2.2, 10 + i));
  const petsUtilItems = Array.from({ length: 4 }, (_, i) => likert7(trustBase, 2.0, 20 + i));
  const petsER = petsEmpathyItems.reduce((a, b) => a + b, 0);
  const petsUT = petsUtilItems.reduce((a, b) => a + b, 0);
  const petsTotal = petsER + petsUT;

  // TIAS: 12 items, 1-7 each (reverse-scored items exist, but we just provide raw responses)
  const tiasItems = Array.from({ length: 12 }, (_, i) => likert7(trustBase, 2.4, 40 + i));
  const tiasTotal = tiasItems.reduce((a, b) => a + b, 0);

  // Godspeed: 4 + 5 + 5 items, 1-5 each
  const anthroItems = Array.from({ length: 4 }, (_, i) => likert5(3.2, 2.0, 70 + i));
  const likeItems = Array.from({ length: 5 }, (_, i) => likert5(3.6, 2.0, 80 + i));
  const intelItems = Array.from({ length: 5 }, (_, i) => likert5(3.8, 2.0, 90 + i));
  const godspeedAnthroTotal = anthroItems.reduce((a, b) => a + b, 0);
  const godspeedLikeTotal = likeItems.reduce((a, b) => a + b, 0);
  const godspeedIntelTotal = intelItems.reduce((a, b) => a + b, 0);

  // TIPI: 10 items, 1-7 each + 5 derived dimensions
  const tipiItems = Array.from({ length: 10 }, (_, i) => likert7(4, 3.2, 120 + i));
  // TIPI dimensions are typically average of two items (one reverse scored).
  // For demo purposes we just compute a bounded average that looks plausible.
  const tipiDim = (a: number, b: number) => clamp(Math.round((a + (8 - b)) / 2), 1, 7);
  const tipiExtraversion = tipiDim(tipiItems[0], tipiItems[5]);
  const tipiAgreeableness = tipiDim(tipiItems[6], tipiItems[1]);
  const tipiConscientiousness = tipiDim(tipiItems[2], tipiItems[7]);
  const tipiEmotionalStability = tipiDim(tipiItems[8], tipiItems[3]);
  const tipiOpenness = tipiDim(tipiItems[4], tipiItems[9]);

  const intention1 = likert7(condition === 'informal' ? 5 : 4, 2.2, 200);
  const intention2 = likert7(condition === 'informal' ? 5 : 4, 2.2, 201);
  const formality = likert7(formalityBase, 1.6, 210);
  const aiFormalityScore = Math.round((condition === 'formal' ? 62 : 42) + (seededFraction(seed, 220) - 0.5) * 14);

  const voiceAssistantFeedback =
    condition === 'formal'
      ? 'The assistant felt professional and trustworthy. I appreciated the clear structure, although it was a bit stiff at times.'
      : 'The assistant felt friendly and supportive. The casual tone made it easier to talk, but it sometimes felt less “serious”.';

  const communicationStyleFeedback =
    condition === 'formal'
      ? 'Formal style helped me understand what to do next, but I preferred a bit more warmth in the responses.'
      : 'Informal style made me comfortable, though I occasionally wanted more concise, structured guidance.';

  const experimentFeedback =
    'Overall the flow was easy to follow. The voice interaction was interesting; I would suggest adding a short mic check reminder and clearer instructions on what to say if the call is quiet.';

  // Build the record with the keys ResponseDetails expects.
  const record: Record<string, unknown> = {
    id: responseId,
    prolific_id: participant.prolific_id,
    call_id: participant.call_id,
    created_at: participant.created_at,
    assistant_type: condition,
    batch_label: participant.batch_label || null,
    reviewed_by_researcher: participant.reviewed_by_researcher ?? false,
    flagged: participant.flagged ?? false,
    call_attempt_number: 1,

    // Totals
    pets_er: petsER,
    pets_ut: petsUT,
    pets_total: petsTotal,
    tias_total: tiasTotal,
    godspeed_anthro_total: godspeedAnthroTotal,
    godspeed_like_total: godspeedLikeTotal,
    godspeed_intel_total: godspeedIntelTotal,
    intention_1: intention1,
    intention_2: intention2,
    formality,
    ai_formality_score: aiFormalityScore,

    // Free-text feedback
    voice_assistant_feedback: voiceAssistantFeedback,
    communication_style_feedback: communicationStyleFeedback,
    experiment_feedback: experimentFeedback,

    // TIPI derived
    tipi_extraversion: tipiExtraversion,
    tipi_agreeableness: tipiAgreeableness,
    tipi_conscientiousness: tipiConscientiousness,
    tipi_emotional_stability: tipiEmotionalStability,
    tipi_openness: tipiOpenness,
  };

  // Item-level responses + positions (stable order indices)
  const putItems = (keys: string[], values: number[], positionOffset: number) => {
    keys.forEach((key, index) => {
      record[key] = values[index] ?? null;
      record[`${key}_position`] = positionOffset + index + 1;
    });
  };

  putItems(['e1', 'e2', 'e3', 'e4', 'e5', 'e6'], petsEmpathyItems, 0);
  putItems(['u1', 'u2', 'u3', 'u4'], petsUtilItems, 20);
  putItems(
    Array.from({ length: 12 }, (_, i) => `tias_${i + 1}`),
    tiasItems,
    40
  );
  putItems(
    Array.from({ length: 4 }, (_, i) => `godspeed_anthro_${i + 1}`),
    anthroItems,
    70
  );
  putItems(
    Array.from({ length: 5 }, (_, i) => `godspeed_like_${i + 1}`),
    likeItems,
    80
  );
  putItems(
    Array.from({ length: 5 }, (_, i) => `godspeed_intel_${i + 1}`),
    intelItems,
    90
  );
  putItems(
    Array.from({ length: 10 }, (_, i) => `tipi_${i + 1}`),
    tipiItems,
    120
  );

  // Attention checks (placeholders)
  record.attention_check_1 = true;
  record.attention_check_2 = true;

  return record;
};

export const buildGuestJourneyEvents = (participant: GuestParticipant): GuestJourneyEventDetailed[] => {
  const seed = hashStringToInt(participant.prolific_id);
  const startMs = Date.parse(participant.created_at);
  const startTimestamp = Number.isFinite(startMs) ? startMs : Date.now() - 1000 * 60 * 45;

  const pages = [
    { page: 'consent', base: 45 },
    { page: 'prolific-id', base: 15 },
    { page: 'demographics', base: 60 },
    { page: 'voice-assistant-familiarity', base: 40 },
    { page: 'practice-conversation', base: 120 },
    { page: 'voice-conversation', base: 240 },
    { page: 'formality', base: 25 },
    { page: 'pets', base: 90 },
    { page: 'tias', base: 75 },
    { page: 'godspeed', base: 60 },
    { page: 'tipi', base: 55 },
    { page: 'intention', base: 30 },
    { page: 'feedback', base: 85 },
    { page: 'debriefing', base: 35 },
    { page: 'complete', base: 10 },
  ];

  const events: GuestJourneyEventDetailed[] = [];
  let cursorMs = startTimestamp;

  const push = (partial: Omit<GuestJourneyEventDetailed, 'id' | 'created_at'> & { createdAtMs?: number }) => {
    const createdAtMs = partial.createdAtMs ?? cursorMs;
    events.push({
      id: `guest-nav-${participant.prolific_id}-${events.length}`,
      call_id: partial.call_id,
      page_name: partial.page_name,
      event_type: partial.event_type,
      time_on_page_seconds: partial.time_on_page_seconds,
      created_at: new Date(createdAtMs).toISOString(),
      metadata: partial.metadata ?? null,
    });
  };

  // A couple of diagnostic scenarios for realism
  const hasMicPrompt = seededFraction(seed, 1) < 0.35;
  const hasQualityWarning = seededFraction(seed, 2) < 0.22;
  const feedbackDictationUsed = seededFraction(seed, 3) < 0.55;

  pages.forEach((p, idx) => {
    const variance = (seededFraction(seed, 10 + idx) - 0.5) * p.base * 0.35;
    const seconds = Math.max(5, Math.round(p.base + variance));

    push({
      call_id: participant.call_id,
      page_name: p.page,
      event_type: 'page_view',
      time_on_page_seconds: seconds,
      metadata: null,
      createdAtMs: cursorMs,
    });

    // Add mic/call diagnostics in practice & main pages
    if (p.page === 'practice-conversation' || p.page === 'voice-conversation') {
      const context = p.page === 'practice-conversation' ? 'practice' : 'main';
      push({
        call_id: participant.call_id,
        page_name: p.page,
        event_type: 'mic_permission',
        time_on_page_seconds: null,
        metadata: { state: hasMicPrompt && context === 'practice' ? 'prompt' : 'granted' },
        createdAtMs: cursorMs + 1000,
      });
      push({
        call_id: participant.call_id,
        page_name: p.page,
        event_type: 'mic_audio_check',
        time_on_page_seconds: null,
        metadata: { detected: 'detected' },
        createdAtMs: cursorMs + 4000,
      });
      push({
        call_id: participant.call_id,
        page_name: p.page,
        event_type: 'call_connected',
        time_on_page_seconds: null,
        metadata: { provider: 'demo' },
        createdAtMs: cursorMs + 6000,
      });
      if (hasQualityWarning && context === 'main') {
        push({
          call_id: participant.call_id,
          page_name: p.page,
          event_type: 'call_quality_warning',
          time_on_page_seconds: null,
          metadata: { reason: 'background_noise' },
          createdAtMs: cursorMs + 25000,
        });
      }
      push({
        call_id: participant.call_id,
        page_name: p.page,
        event_type: 'call_end',
        time_on_page_seconds: null,
        metadata: { endedReason: 'completed' },
        createdAtMs: cursorMs + (seconds * 1000) - 2000,
      });
    }

    // Add feedback dictation events for markers
    if (p.page === 'feedback') {
      push({
        call_id: participant.call_id,
        page_name: 'feedback',
        event_type: 'mic_permission',
        time_on_page_seconds: null,
        metadata: { context: 'dictation', state: 'granted' },
        createdAtMs: cursorMs + 1200,
      });

      if (feedbackDictationUsed) {
        const fields = ['experiment_feedback', 'voice_assistant_feedback', 'communication_style_feedback'];
        const field = fields[seed % fields.length];
        push({
          call_id: participant.call_id,
          page_name: 'feedback',
          event_type: 'feedback_input_mode',
          time_on_page_seconds: null,
          metadata: { mode: 'dictated', field },
          createdAtMs: cursorMs + 2500,
        });
        push({
          call_id: participant.call_id,
          page_name: 'feedback',
          event_type: 'dictation_started',
          time_on_page_seconds: null,
          metadata: { context: 'dictation', field },
          createdAtMs: cursorMs + 3500,
        });
        push({
          call_id: participant.call_id,
          page_name: 'feedback',
          event_type: 'dictation_transcript_appended',
          time_on_page_seconds: null,
          metadata: { context: 'dictation', field, text: '...demo transcript segment...' },
          createdAtMs: cursorMs + 8000,
        });
        push({
          call_id: participant.call_id,
          page_name: 'feedback',
          event_type: 'dictation_stopped',
          time_on_page_seconds: null,
          metadata: { context: 'dictation', field },
          createdAtMs: cursorMs + 14000,
        });
        push({
          call_id: participant.call_id,
          page_name: 'feedback',
          event_type: 'dictation_recording_uploaded',
          time_on_page_seconds: null,
          metadata: { context: 'dictation', field, storagePath: 'demo/dictation.webm', attemptCount: 1, durationMs: 12500 },
          createdAtMs: cursorMs + 16000,
        });
      } else {
        push({
          call_id: participant.call_id,
          page_name: 'feedback',
          event_type: 'feedback_input_mode',
          time_on_page_seconds: null,
          metadata: { mode: 'typed', field: 'experiment_feedback' },
          createdAtMs: cursorMs + 2600,
        });
      }
    }

    cursorMs += seconds * 1000;
  });

  return events;
};

export const buildGuestReplayEvents = (startTimestampMs: number) => {
  // Minimal rrweb replay: one FullSnapshot + a couple mouse moves to make the timeline feel alive.
  // NOTE: These events are intentionally simple; they provide a realistic UI demo without large payloads.
  const start = Number.isFinite(startTimestampMs) ? startTimestampMs : Date.now();
  const end = start + 6 * 60 * 1000;

  const fullSnapshot = {
    type: 2, // EventType.FullSnapshot
    timestamp: start,
    data: {
      node: {
        type: 0, // Document
        childNodes: [
          { type: 1, name: 'html', publicId: '', systemId: '', id: 1 },
          {
            type: 2,
            tagName: 'html',
            attributes: {},
            childNodes: [
              {
                type: 2,
                tagName: 'head',
                attributes: {},
                childNodes: [
                  { type: 2, tagName: 'title', attributes: {}, childNodes: [{ type: 3, textContent: 'Demo Replay', id: 6 }], id: 5 },
                ],
                id: 4,
              },
              {
                type: 2,
                tagName: 'body',
                attributes: { style: 'margin:0;background:#0b0f19;color:#e5e7eb;font-family:ui-sans-serif,system-ui;padding:24px;' },
                childNodes: [
                  {
                    type: 2,
                    tagName: 'div',
                    attributes: { style: 'max-width:720px;margin:0 auto;' },
                    childNodes: [
                      { type: 2, tagName: 'h1', attributes: { style: 'font-size:18px;margin:0 0 10px;' }, childNodes: [{ type: 3, textContent: 'Demo session replay', id: 12 }], id: 11 },
                      { type: 2, tagName: 'p', attributes: { style: 'margin:0 0 10px;color:#93c5fd;' }, childNodes: [{ type: 3, textContent: 'This is synthetic replay data shown in Guest Mode.', id: 14 }], id: 13 },
                      { type: 2, tagName: 'p', attributes: { style: 'margin:0;color:#9ca3af;font-size:12px;' }, childNodes: [{ type: 3, textContent: 'Use the timeline markers to jump to mic/call events.', id: 16 }], id: 15 },
                    ],
                    id: 10,
                  },
                ],
                id: 8,
              },
            ],
            id: 2,
          },
        ],
        id: 0,
      },
      initialOffset: { left: 0, top: 0 },
    },
  };

  const mouseMoveMid = {
    type: 3, // EventType.IncrementalSnapshot
    timestamp: start + 2 * 60 * 1000,
    data: {
      source: 1, // IncrementalSource.MouseMove
      positions: [{ x: 280, y: 190, id: 1, timeOffset: 0 }],
    },
  };

  const mouseMoveEnd = {
    type: 3,
    timestamp: end,
    data: {
      source: 1,
      positions: [{ x: 520, y: 260, id: 2, timeOffset: 0 }],
    },
  };

  return [fullSnapshot, mouseMoveMid, mouseMoveEnd];
};
