// Guest mode dummy data - realistic sample data for dashboard preview

export interface GuestParticipant {
  id: string;
  prolific_id: string;
  call_id: string;
  created_at: string;
  token_used: boolean;
  response_id?: string;
  assistant_type?: string | null;
  batch_label?: string | null;
  pets_total?: number | null;
  tias_total?: number | null;
  formality?: number | null;
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
      token_used: true,
      response_id: `response-formal-${i}`,
      assistant_type: 'formal',
      batch_label: batches[i % 3],
      pets_total: 45 + Math.floor(Math.random() * 15), // 45-60
      tias_total: 50 + Math.floor(Math.random() * 20), // 50-70
      formality: 4.5 + Math.random() * 2, // 4.5-6.5
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
      token_used: true,
      response_id: `response-informal-${i}`,
      assistant_type: 'informal',
      batch_label: batches[i % 3],
      pets_total: 40 + Math.floor(Math.random() * 15), // 40-55
      tias_total: 45 + Math.floor(Math.random() * 20), // 45-65
      formality: 2.5 + Math.random() * 2, // 2.5-4.5
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
      token_used: false,
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
  };
};
