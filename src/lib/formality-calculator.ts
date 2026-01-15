import nlp from 'compromise';

// F-score category types
export type FScoreCategory = 'noun' | 'adjective' | 'preposition' | 'article' | 'pronoun' | 'verb' | 'adverb' | 'interjection';

export type InterpretationLabel = 'very-informal' | 'conversational' | 'moderately-formal' | 'highly-formal';

export interface TokenAnalysis {
  token: string;
  posTag: string;
  category: FScoreCategory | null;
}

export interface CategoryStats {
  count: number;
  percentage: number;
}

export interface FScoreCategories {
  nouns: CategoryStats;
  adjectives: CategoryStats;
  prepositions: CategoryStats;
  articles: CategoryStats;
  pronouns: CategoryStats;
  verbs: CategoryStats;
  adverbs: CategoryStats;
  interjections: CategoryStats;
}

export interface FScoreResult {
  rowIndex: number;
  totalTokens: number;
  categories: FScoreCategories;
  fScore: number;
  interpretation: InterpretationLabel;
  interpretationLabel: string;
  tokens: TokenAnalysis[];
  formulaBreakdown: {
    nounPct: number;
    adjPct: number;
    prepPct: number;
    artPct: number;
    pronPct: number;
    verbPct: number;
    advPct: number;
    intjPct: number;
    intermediateSum: number;
  };
  warning?: string;
  // Linked data from CSV
  callId?: string;
  prolificId?: string;
  originalTranscript?: string;
  // Saved calculation ID (set after saving to database)
  savedId?: string;
}

export interface PerTurnResult {
  turnIndex: number;
  turnText: string;
  result: FScoreResult;
}

export interface CSVParseResult {
  transcripts: string[];
  callIds: string[];
  prolificIds: string[];
  error?: string;
}

// Articles list for F-score calculation
const ARTICLES = ['a', 'an', 'the'];

// Compromise tag to F-score category mapping
// Compromise uses its own tag system, we map to F-score categories
function mapCompromiseTagToCategory(tags: string[], token: string): FScoreCategory | null {
  const lowerToken = token.toLowerCase();
  
  // Check for articles first (specific DET tokens)
  if (ARTICLES.includes(lowerToken)) {
    return 'article';
  }
  
  // Map Compromise tags to F-score categories
  // Compromise uses tags like: Noun, Verb, Adjective, Adverb, Preposition, Pronoun, Determiner, etc.
  
  if (tags.includes('Noun') || tags.includes('ProperNoun') || tags.includes('Singular') || tags.includes('Plural')) {
    // Check if it's actually a pronoun (Compromise sometimes tags pronouns as nouns)
    if (tags.includes('Pronoun')) {
      return 'pronoun';
    }
    return 'noun';
  }
  
  if (tags.includes('Pronoun')) {
    return 'pronoun';
  }
  
  if (tags.includes('Verb') || tags.includes('Auxiliary') || tags.includes('Modal') || 
      tags.includes('PastTense') || tags.includes('PresentTense') || tags.includes('Infinitive') ||
      tags.includes('Gerund') || tags.includes('Copula')) {
    return 'verb';
  }
  
  if (tags.includes('Adjective') || tags.includes('Comparable')) {
    // Make sure it's not tagged as something else more specific
    if (!tags.includes('Verb') && !tags.includes('Noun')) {
      return 'adjective';
    }
    if (tags.includes('Adjective')) {
      return 'adjective';
    }
  }
  
  if (tags.includes('Adverb')) {
    return 'adverb';
  }
  
  if (tags.includes('Preposition')) {
    return 'preposition';
  }
  
  if (tags.includes('Interjection') || tags.includes('Expression')) {
    return 'interjection';
  }
  
  // Determiners that are not articles are ignored for F-score
  // Conjunctions, particles, etc. are also ignored
  
  return null;
}

/**
 * Preprocess text for F-score calculation
 * - Optionally extract only AI utterances
 * - Lowercase
 * - Remove punctuation (keep apostrophes inside words)
 */
export function preprocessText(text: string, aiOnly: boolean): string {
  let processedText = text;
  
  if (aiOnly) {
    // Extract only AI utterances - handles both newline-separated and inline formats
    // First normalize: split by "AI:" or "User:" markers to find AI segments
    // Pattern: capture everything after "AI:" until the next speaker marker or end
    const aiSegments: string[] = [];
    
    // Split by speaker markers (AI: or User:) keeping the delimiter
    const segments = text.split(/(?=\bAI:|(?=\bUser:))/i);
    
    for (const segment of segments) {
      const trimmed = segment.trim();
      // Check if this segment starts with AI:
      if (/^AI:/i.test(trimmed)) {
        // Extract the content after "AI:" and before any "User:" in the same segment
        let aiContent = trimmed.replace(/^AI:\s*/i, '');
        // Remove any trailing "User:..." that might be in the same segment
        aiContent = aiContent.replace(/\bUser:[\s\S]*/i, '').trim();
        if (aiContent.length > 0) {
          aiSegments.push(aiContent);
        }
      }
    }
    
    processedText = aiSegments.join(' ');
  }
  
  // Lowercase
  processedText = processedText.toLowerCase();
  
  // Remove punctuation but keep apostrophes inside words
  // First, protect apostrophes inside words by replacing with placeholder
  processedText = processedText.replace(/(\w)'(\w)/g, '$1__APOSTROPHE__$2');
  
  // Remove all other punctuation
  processedText = processedText.replace(/[^\w\s]/g, ' ');
  
  // Restore apostrophes
  processedText = processedText.replace(/__APOSTROPHE__/g, "'");
  
  // Normalize whitespace
  processedText = processedText.replace(/\s+/g, ' ').trim();
  
  return processedText;
}

/**
 * Tokenize text into alphabetic words only
 */
export function tokenize(text: string): string[] {
  // Split by whitespace and filter to only alphabetic tokens (may contain apostrophes)
  return text
    .split(/\s+/)
    .filter(token => /^[a-z]+'?[a-z]*$|^[a-z]*'?[a-z]+$/i.test(token) && token.length > 0);
}

/**
 * Extract AI turns from transcript
 */
export function extractAITurns(text: string): string[] {
  const aiTurns: string[] = [];
  
  // Split by speaker markers (AI: or User:) keeping the delimiter info
  const segments = text.split(/(?=\bAI:|(?=\bUser:))/i);
  
  for (const segment of segments) {
    const trimmed = segment.trim();
    // Check if this segment starts with AI:
    if (/^AI:/i.test(trimmed)) {
      // Extract the content after "AI:" and before any "User:" in the same segment
      let aiContent = trimmed.replace(/^AI:\s*/i, '');
      // Remove any trailing "User:..." that might be in the same segment
      aiContent = aiContent.replace(/\bUser:[\s\S]*/i, '').trim();
      if (aiContent.length > 0) {
        aiTurns.push(aiContent);
      }
    }
  }
  
  return aiTurns;
}

/**
 * Tag tokens using Compromise.js
 */
export function tagTokens(tokens: string[]): TokenAnalysis[] {
  const results: TokenAnalysis[] = [];
  
  // Process tokens through Compromise
  // We join tokens and then re-extract to get proper context-aware tagging
  const text = tokens.join(' ');
  const doc = nlp(text);
  const terms = doc.terms().json();
  
  // Build a map of token positions for matching
  let termIndex = 0;
  
  for (const token of tokens) {
    let posTag = 'Unknown';
    let category: FScoreCategory | null = null;
    
    // Find matching term in Compromise output
    if (termIndex < terms.length) {
      const term = terms[termIndex];
      if (term.text && term.text.toLowerCase() === token.toLowerCase()) {
        const tags = term.terms?.[0]?.tags || [];
        posTag = tags.join(', ') || 'Unknown';
        category = mapCompromiseTagToCategory(tags, token);
        termIndex++;
      } else {
        // Try to find the token in remaining terms
        for (let i = termIndex; i < terms.length; i++) {
          if (terms[i].text && terms[i].text.toLowerCase() === token.toLowerCase()) {
            const tags = terms[i].terms?.[0]?.tags || [];
            posTag = tags.join(', ') || 'Unknown';
            category = mapCompromiseTagToCategory(tags, token);
            termIndex = i + 1;
            break;
          }
        }
      }
    }
    
    results.push({
      token,
      posTag,
      category
    });
  }
  
  return results;
}

/**
 * Calculate F-score from tagged tokens
 */
export function calculateFScore(tokens: TokenAnalysis[], rowIndex: number = 0): FScoreResult {
  const totalTokens = tokens.length;
  
  // Count categories
  const counts = {
    nouns: 0,
    adjectives: 0,
    prepositions: 0,
    articles: 0,
    pronouns: 0,
    verbs: 0,
    adverbs: 0,
    interjections: 0
  };
  
  for (const token of tokens) {
    switch (token.category) {
      case 'noun': counts.nouns++; break;
      case 'adjective': counts.adjectives++; break;
      case 'preposition': counts.prepositions++; break;
      case 'article': counts.articles++; break;
      case 'pronoun': counts.pronouns++; break;
      case 'verb': counts.verbs++; break;
      case 'adverb': counts.adverbs++; break;
      case 'interjection': counts.interjections++; break;
    }
  }
  
  // Calculate percentages
  const pct = (count: number) => totalTokens > 0 ? (count / totalTokens) * 100 : 0;
  
  const nounPct = pct(counts.nouns);
  const adjPct = pct(counts.adjectives);
  const prepPct = pct(counts.prepositions);
  const artPct = pct(counts.articles);
  const pronPct = pct(counts.pronouns);
  const verbPct = pct(counts.verbs);
  const advPct = pct(counts.adverbs);
  const intjPct = pct(counts.interjections);
  
  // F-score formula: (noun% + adj% + prep% + art% - pron% - verb% - adv% - intj% + 100) / 2
  const intermediateSum = nounPct + adjPct + prepPct + artPct - pronPct - verbPct - advPct - intjPct + 100;
  const fScore = intermediateSum / 2;
  
  // Interpretation
  let interpretation: InterpretationLabel;
  let interpretationLabel: string;
  
  if (fScore < 40) {
    interpretation = 'very-informal';
    interpretationLabel = 'Very Informal';
  } else if (fScore < 50) {
    interpretation = 'conversational';
    interpretationLabel = 'Conversational';
  } else if (fScore < 60) {
    interpretation = 'moderately-formal';
    interpretationLabel = 'Moderately Formal';
  } else {
    interpretation = 'highly-formal';
    interpretationLabel = 'Highly Formal';
  }
  
  // Warning for short transcripts
  let warning: string | undefined;
  if (totalTokens < 50) {
    warning = `Short transcript (${totalTokens} tokens). Results may be less reliable.`;
  }
  
  return {
    rowIndex,
    totalTokens,
    categories: {
      nouns: { count: counts.nouns, percentage: nounPct },
      adjectives: { count: counts.adjectives, percentage: adjPct },
      prepositions: { count: counts.prepositions, percentage: prepPct },
      articles: { count: counts.articles, percentage: artPct },
      pronouns: { count: counts.pronouns, percentage: pronPct },
      verbs: { count: counts.verbs, percentage: verbPct },
      adverbs: { count: counts.adverbs, percentage: advPct },
      interjections: { count: counts.interjections, percentage: intjPct }
    },
    fScore: Math.round(fScore * 10) / 10,
    interpretation,
    interpretationLabel,
    tokens,
    formulaBreakdown: {
      nounPct: Math.round(nounPct * 100) / 100,
      adjPct: Math.round(adjPct * 100) / 100,
      prepPct: Math.round(prepPct * 100) / 100,
      artPct: Math.round(artPct * 100) / 100,
      pronPct: Math.round(pronPct * 100) / 100,
      verbPct: Math.round(verbPct * 100) / 100,
      advPct: Math.round(advPct * 100) / 100,
      intjPct: Math.round(intjPct * 100) / 100,
      intermediateSum: Math.round(intermediateSum * 100) / 100
    },
    warning
  };
}

/**
 * Process a single transcript and return F-score result
 */
export function processTranscript(text: string, aiOnly: boolean, rowIndex: number = 0): FScoreResult {
  const preprocessed = preprocessText(text, aiOnly);
  const tokens = tokenize(preprocessed);
  const taggedTokens = tagTokens(tokens);
  return calculateFScore(taggedTokens, rowIndex);
}

/**
 * Process transcript with per-turn scoring
 */
export function processTranscriptPerTurn(text: string): PerTurnResult[] {
  const turns = extractAITurns(text);
  const results: PerTurnResult[] = [];
  
  for (let i = 0; i < turns.length; i++) {
    const turnText = turns[i];
    const preprocessed = preprocessText(turnText, false);
    const tokens = tokenize(preprocessed);
    const taggedTokens = tagTokens(tokens);
    const result = calculateFScore(taggedTokens, i);
    
    results.push({
      turnIndex: i,
      turnText: turnText.substring(0, 100) + (turnText.length > 100 ? '...' : ''),
      result
    });
  }
  
  return results;
}

/**
 * Calculate average F-score from per-turn results
 */
export function calculateAverageFromTurns(turns: PerTurnResult[]): number {
  if (turns.length === 0) return 0;
  const sum = turns.reduce((acc, turn) => acc + turn.result.fScore, 0);
  return Math.round((sum / turns.length) * 10) / 10;
}

/**
 * Parse CSV and extract Transcript, Call ID, and Prolific ID columns
 *
 * IMPORTANT: Supports multiline fields (e.g. transcripts containing newlines)
 * by parsing the full CSV content character-by-character.
 */
export function parseCSV(csvContent: string): CSVParseResult {
  const rows = parseCSVRows(csvContent);

  if (rows.length < 2) {
    return {
      transcripts: [],
      callIds: [],
      prolificIds: [],
      error: 'CSV must have at least a header row and one data row',
    };
  }

  // Parse header to find columns
  const columns = rows[0].map((c) => c.trim());

  const transcriptIndex = columns.findIndex((col) => col.toLowerCase().trim() === 'transcript');

  // Look for call_id column (various naming conventions)
  const callIdIndex = columns.findIndex((col) =>
    ['call_id', 'callid', 'call id', 'vapi_call_id', 'vapicallid'].includes(col.toLowerCase().trim())
  );

  // Look for prolific_id column
  const prolificIdIndex = columns.findIndex((col) =>
    ['prolific_id', 'prolificid', 'prolific id', 'participant_id'].includes(col.toLowerCase().trim())
  );

  if (transcriptIndex === -1) {
    return {
      transcripts: [],
      callIds: [],
      prolificIds: [],
      error: 'Could not find "Transcript" column in CSV. Please ensure your CSV has a column named "Transcript".',
    };
  }

  // Extract data
  const transcripts: string[] = [];
  const callIds: string[] = [];
  const prolificIds: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (!values || values.length === 0) continue;

    // Skip rows that are completely empty
    if (values.every((v) => v.trim().length === 0)) continue;

    if (transcriptIndex < values.length) {
      const transcript = values[transcriptIndex].trim();
      if (transcript.length > 0) {
        transcripts.push(transcript);

        // Extract call_id if available
        if (callIdIndex !== -1 && callIdIndex < values.length) {
          callIds.push(values[callIdIndex].trim());
        } else {
          callIds.push('');
        }

        // Extract prolific_id if available
        if (prolificIdIndex !== -1 && prolificIdIndex < values.length) {
          prolificIds.push(values[prolificIdIndex].trim());
        } else {
          prolificIds.push('');
        }
      }
    }
  }

  return { transcripts, callIds, prolificIds };
}

/**
 * Parse full CSV content into rows/columns.
 * Handles newlines inside quoted fields.
 */
function parseCSVRows(csvContent: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];

    if (char === '"') {
      // Escaped quote inside quoted field
      if (inQuotes && csvContent[i + 1] === '"') {
        currentField += '"';
        i++;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    // Handle CRLF and LF newlines as row separators (only when not in quotes)
    if (!inQuotes && (char === '\n' || char === '\r')) {
      // If CRLF, skip the next '\n'
      if (char === '\r' && csvContent[i + 1] === '\n') i++;

      currentRow.push(currentField);
      currentField = '';

      // Avoid pushing completely empty trailing rows
      if (!(currentRow.length === 1 && currentRow[0].trim() === '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  // Flush last field/row
  currentRow.push(currentField);
  if (!(currentRow.length === 1 && currentRow[0].trim() === '')) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Parse a single CSV line handling quoted values
 * (kept for backwards-compat/debugging; multiline CSV parsing uses parseCSVRows).
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Generate results CSV content
 */
export function generateResultsCSV(results: FScoreResult[]): string {
  const headers = [
    'row_index',
    'f_score',
    'total_tokens',
    'noun_count',
    'noun_pct',
    'adj_count',
    'adj_pct',
    'prep_count',
    'prep_pct',
    'art_count',
    'art_pct',
    'pron_count',
    'pron_pct',
    'verb_count',
    'verb_pct',
    'adv_count',
    'adv_pct',
    'intj_count',
    'intj_pct',
    'interpretation'
  ];
  
  const rows = results.map(r => [
    r.rowIndex + 1,
    r.fScore,
    r.totalTokens,
    r.categories.nouns.count,
    r.categories.nouns.percentage.toFixed(2),
    r.categories.adjectives.count,
    r.categories.adjectives.percentage.toFixed(2),
    r.categories.prepositions.count,
    r.categories.prepositions.percentage.toFixed(2),
    r.categories.articles.count,
    r.categories.articles.percentage.toFixed(2),
    r.categories.pronouns.count,
    r.categories.pronouns.percentage.toFixed(2),
    r.categories.verbs.count,
    r.categories.verbs.percentage.toFixed(2),
    r.categories.adverbs.count,
    r.categories.adverbs.percentage.toFixed(2),
    r.categories.interjections.count,
    r.categories.interjections.percentage.toFixed(2),
    r.interpretationLabel
  ]);
  
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Generate per-turn results CSV content
 */
export function generatePerTurnCSV(results: PerTurnResult[]): string {
  const headers = [
    'turn_index',
    'f_score',
    'total_tokens',
    'interpretation',
    'turn_preview'
  ];
  
  const rows = results.map(r => [
    r.turnIndex + 1,
    r.result.fScore,
    r.result.totalTokens,
    r.result.interpretationLabel,
    `"${r.turnText.replace(/"/g, '""')}"`
  ]);
  
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Get the reproduction code snippet
 */
export function getReproductionSnippet(): string {
  return `// Reproduction snippet for F-score calculation
// Uses: compromise.js (client-side POS tagger)
// Install: npm install compromise

import nlp from 'compromise';

const ARTICLES = ['a', 'an', 'the'];

function calculateFScore(text) {
  // 1. Preprocess
  let processed = text.toLowerCase();
  processed = processed.replace(/(\\w)'(\\w)/g, '$1__APO__$2');
  processed = processed.replace(/[^\\w\\s]/g, ' ');
  processed = processed.replace(/__APO__/g, "'");
  processed = processed.replace(/\\s+/g, ' ').trim();
  
  // 2. Tokenize (alphabetic only)
  const tokens = processed.split(/\\s+/)
    .filter(t => /^[a-z]+'?[a-z]*$|^[a-z]*'?[a-z]+$/i.test(t));
  
  // 3. POS tag with Compromise
  const doc = nlp(tokens.join(' '));
  const terms = doc.terms().json();
  
  // 4. Count categories
  let counts = { noun: 0, adj: 0, prep: 0, art: 0, pron: 0, verb: 0, adv: 0, intj: 0 };
  
  terms.forEach(term => {
    const word = term.text.toLowerCase();
    const tags = term.terms?.[0]?.tags || [];
    
    if (ARTICLES.includes(word)) { counts.art++; return; }
    if (tags.includes('Pronoun')) { counts.pron++; return; }
    if (tags.some(t => ['Noun', 'ProperNoun', 'Singular', 'Plural'].includes(t))) { counts.noun++; return; }
    if (tags.some(t => ['Verb', 'Auxiliary', 'Modal', 'PastTense', 'PresentTense', 'Infinitive', 'Gerund', 'Copula'].includes(t))) { counts.verb++; return; }
    if (tags.includes('Adjective') || tags.includes('Comparable')) { counts.adj++; return; }
    if (tags.includes('Adverb')) { counts.adv++; return; }
    if (tags.includes('Preposition')) { counts.prep++; return; }
    if (tags.includes('Interjection') || tags.includes('Expression')) { counts.intj++; return; }
  });
  
  // 5. Calculate F-score
  const total = tokens.length;
  const pct = (c) => total > 0 ? (c / total) * 100 : 0;
  
  const F = (pct(counts.noun) + pct(counts.adj) + pct(counts.prep) + pct(counts.art)
           - pct(counts.pron) - pct(counts.verb) - pct(counts.adv) - pct(counts.intj) + 100) / 2;
  
  return Math.round(F * 10) / 10;
}

// Usage:
// const score = calculateFScore("Your transcript text here");
// console.log("F-score:", score);
`;
}

/**
 * Get tagger information for reproducibility panel
 */
export function getTaggerInfo() {
  return {
    name: 'Compromise.js',
    version: '14.x',
    type: 'Client-side JavaScript NLP library',
    documentation: 'https://compromise.cool/',
    tagset: 'Compromise native tags (Noun, Verb, Adjective, etc.)',
    tokenizationRules: [
      'Lowercase all text',
      'Remove punctuation except apostrophes inside words (e.g., "you\'ve")',
      'Split on whitespace',
      'Keep only alphabetic tokens (ignore numbers)',
      'Stopwords are NOT removed'
    ],
    articleList: ARTICLES,
    categoryMapping: [
      { category: 'Nouns', tags: 'Noun, ProperNoun, Singular, Plural', fScoreSign: '+' },
      { category: 'Adjectives', tags: 'Adjective, Comparable', fScoreSign: '+' },
      { category: 'Prepositions', tags: 'Preposition', fScoreSign: '+' },
      { category: 'Articles', tags: 'Tokens matching: a, an, the', fScoreSign: '+' },
      { category: 'Pronouns', tags: 'Pronoun', fScoreSign: '−' },
      { category: 'Verbs', tags: 'Verb, Auxiliary, Modal, PastTense, PresentTense, Infinitive, Gerund, Copula', fScoreSign: '−' },
      { category: 'Adverbs', tags: 'Adverb', fScoreSign: '−' },
      { category: 'Interjections', tags: 'Interjection, Expression', fScoreSign: '−' }
    ],
    formula: 'F = (noun% + adj% + prep% + art% − pron% − verb% − adv% − intj% + 100) / 2'
  };
}
