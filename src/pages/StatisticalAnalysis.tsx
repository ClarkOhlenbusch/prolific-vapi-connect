import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, Download, Info, CheckCircle2, AlertTriangle, XCircle, HelpCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { GlobalSourceFilter, SourceFilterValue } from '@/components/researcher/GlobalSourceFilter';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import {
  welchTTest,
  mannWhitneyU,
  leveneTest,
  shapiroWilk,
  holmCorrection,
  descriptiveStats,
  mean,
  interpretCohensD,
  interpretRankBiserial,
  chiSquare2xK,
  spearmanCorrelation,
  oneWayAnova,
  TTestResult,
  MannWhitneyResult,
  LeveneResult,
  ShapiroResult,
  DescriptiveStats,
} from '@/lib/statistics';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { GUEST_PARTICIPANTS, buildGuestExperimentResponse } from '@/lib/guest-dummy-data';
import { fetchArchivedFilters } from '@/lib/archived-responses';

interface DependentVariable {
  key: string;
  label: string;
  scale: string;
  description: string;
}

// Hypothesis structure
interface Hypothesis {
  id: string;
  label: string;
  description: string;
  direction: 'formal_higher' | 'informal_higher' | 'exploratory';
  dvKeys: string[];
  rq: 'RQ1' | 'RQ2' | 'exploratory';
}

const HYPOTHESES: Hypothesis[] = [
  {
    id: 'H1',
    label: 'H1: Empathy',
    description: 'Participants will perceive the informal assistant as more empathic.',
    direction: 'informal_higher',
    dvKeys: ['pets_er'],
    rq: 'RQ1',
  },
  {
    id: 'H2',
    label: 'H2: Trust',
    description: 'Participants will perceive the formal assistant as more trustworthy.',
    direction: 'formal_higher',
    dvKeys: ['pets_ut', 'tias_total'],
    rq: 'RQ1',
  },
  {
    id: 'H3',
    label: 'H3: Intention to Use',
    description: 'Participants will report higher intention to use the informal assistant.',
    direction: 'informal_higher',
    dvKeys: ['intention_1', 'intention_2'],
    rq: 'RQ1',
  },
];

const EXPLORATORY_DVS: DependentVariable[] = [
  { key: 'godspeed_anthro_total', label: 'Godspeed Anthropomorphism', scale: '4-20', description: 'Perceived human-likeness of the assistant' },
  { key: 'godspeed_like_total', label: 'Godspeed Likeability', scale: '5-25', description: 'Perceived likeability of the assistant' },
  { key: 'godspeed_intel_total', label: 'Godspeed Intelligence', scale: '5-25', description: 'Perceived intelligence of the assistant' },
  { key: 'pets_total', label: 'PETS Total', scale: '10-70', description: 'Overall Privacy and Emotional Trust Scale score' },
];

const MANIPULATION_CHECKS: DependentVariable[] = [
  { key: 'formality', label: 'Perceived Formality', scale: '1-7', description: 'User-rated perception of assistant formality' },
  { key: 'ai_formality_score', label: 'F-Score (AI Formality)', scale: '0-100', description: 'Calculated linguistic formality from transcript' },
];

// Baseline characteristics / covariates (used for randomization checks, not outcomes)
const BASELINE_DVS: DependentVariable[] = [
  { key: 'tipi_extraversion', label: 'TIPI Extraversion', scale: '1-7', description: 'Personality: Extraversion subscale' },
  { key: 'tipi_agreeableness', label: 'TIPI Agreeableness', scale: '1-7', description: 'Personality: Agreeableness subscale' },
  { key: 'tipi_conscientiousness', label: 'TIPI Conscientiousness', scale: '1-7', description: 'Personality: Conscientiousness subscale' },
  { key: 'tipi_emotional_stability', label: 'TIPI Emotional Stability', scale: '1-7', description: 'Personality: Emotional Stability subscale' },
  { key: 'tipi_openness', label: 'TIPI Openness', scale: '1-7', description: 'Personality: Openness subscale' },
];

const ALL_DVS: DependentVariable[] = [
  { key: 'pets_er', label: 'PETS-ER', scale: '6-42', description: 'Emotional Relationship subscale' },
  { key: 'pets_ut', label: 'PETS-UT', scale: '4-28', description: 'Utilitarian Trust subscale' },
  { key: 'pets_total', label: 'PETS Total', scale: '10-70', description: 'Privacy and Emotional Trust Scale' },
  { key: 'tias_total', label: 'TIAS Total', scale: '12-84', description: 'Trust in AI Scale' },
  { key: 'godspeed_anthro_total', label: 'Godspeed Anthropomorphism', scale: '4-20', description: 'Perceived human-likeness' },
  { key: 'godspeed_like_total', label: 'Godspeed Likeability', scale: '5-25', description: 'Perceived likeability' },
  { key: 'godspeed_intel_total', label: 'Godspeed Intelligence', scale: '5-25', description: 'Perceived intelligence' },
  { key: 'intention_1', label: 'Intention 1', scale: '1-7', description: 'Behavioral intention item 1' },
  { key: 'intention_2', label: 'Intention 2', scale: '1-7', description: 'Behavioral intention item 2' },
  { key: 'formality', label: 'Perceived Formality', scale: '1-7', description: 'User-rated formality perception' },
  { key: 'ai_formality_score', label: 'F-Score (AI Formality)', scale: '0-100', description: 'Calculated linguistic formality' },
];

interface AnalysisResult {
  dv: DependentVariable;
  formalData: number[];
  informalData: number[];
  formalStats: DescriptiveStats;
  informalStats: DescriptiveStats;
  tTest: TTestResult;
  mannWhitney: MannWhitneyResult;
  levene: LeveneResult;
  shapiroFormal: ShapiroResult;
  shapiroInformal: ShapiroResult;
  adjustedP: number;
  significant: boolean;
}

interface HypothesisResult {
  hypothesis: Hypothesis;
  dvResults: AnalysisResult[];
  supported: 'yes' | 'partial' | 'no' | 'opposite';
  summary: string;
}

interface ExperimentResponse {
  assistant_type: string | null;
  prolific_id: string;
  batch_label: string | null;
  created_at: string | null;
  [key: string]: unknown;
}

interface ProgressionPoint {
  batchLabel: string;
  batchStep: number;
  stepLabel: string;
  batchParticipants: number;
  cumulativeParticipants: number;
  formalN: number;
  informalN: number;
  pValue: number | null;
  significant: boolean | null;
  cohensD: number | null;
}

interface MeasureProgression {
  dv: DependentVariable;
  points: ProgressionPoint[];
}

// Helper to detect researcher IDs (Prolific IDs are exactly 24 characters)
const isResearcherId = (prolificId: string): boolean => {
  return prolificId.length !== 24;
};

const getBatchLabel = (value: unknown): string => {
  if (typeof value !== 'string') return 'No Batch';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'No Batch';
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

function getDemographicValue(demo: ProlificDemographicRow, pred: typeof DEMOGRAPHIC_PREDICTORS[0]): string | number | null {
  if (pred.key === 'age') return demo.age != null && Number.isFinite(demo.age) ? demo.age : null;
  if (pred.key === 'gender') return (demo.gender ?? '').trim() || null;
  if (pred.key === 'ethnicity_simplified') return (demo.ethnicity_simplified ?? '').trim() || null;
  if (pred.key === 'employment_status') return (demo.employment_status ?? '').trim() || null;
  const raw = demo.raw_columns != null && typeof demo.raw_columns === 'object'
    ? demo.raw_columns
    : typeof demo.raw_columns === 'string'
      ? (() => { try { return JSON.parse(demo.raw_columns as string) as Record<string, unknown>; } catch { return null; } })()
      : null;
  if (pred.rawKeys && raw) {
    let rawVal: string | null = null;
    for (const rk of pred.rawKeys) {
      const v = raw[rk];
      if (v != null) {
        rawVal = String(v).trim();
        break;
      }
    }
    if (pred.key === 'ai_chatbots' && rawVal !== null) {
      if (!rawVal || /none|^$/i.test(rawVal)) return 'None';
      return 'Any';
    }
    return rawVal;
  }
  return null;
}

const SOURCE_FILTER_STORAGE_KEY = 'researcher-dashboard-source-filter';

type ProlificDemographicRow = {
  prolific_id: string;
  age: number | null;
  gender: string | null;
  ethnicity_simplified: string | null;
  country_of_residence?: string | null;
  employment_status?: string | null;
  raw_columns?: Record<string, unknown> | null;
};

/** Demographic predictors for exploratory Demographics × Outcomes. rawKey = key in raw_columns (CSV header). */
const DEMOGRAPHIC_PREDICTORS: { key: string; label: string; type: 'continuous' | 'categorical'; rawKeys?: string[] }[] = [
  { key: 'age', label: 'Age', type: 'continuous' },
  { key: 'gender', label: 'Gender', type: 'categorical' },
  { key: 'ethnicity_simplified', label: 'Ethnicity', type: 'categorical' },
  { key: 'employment_status', label: 'Employment', type: 'categorical' },
  { key: 'telemedicine', label: 'Telemedicine', type: 'categorical', rawKeys: ['Telemedicine', 'Telemedicine '] },
  { key: 'hearing_difficulties', label: 'Hearing difficulties', type: 'categorical', rawKeys: ['Hearing difficulties'] },
  { key: 'speech_disorders', label: 'Speech disorders', type: 'categorical', rawKeys: ['Speech disorders'] },
  { key: 'depression', label: 'Depression', type: 'categorical', rawKeys: ['Depression'] },
  { key: 'mental_health_diagnosis', label: 'Mental health diagnosis', type: 'categorical', rawKeys: ['Mental health diagnosis'] },
  { key: 'ai_chatbots', label: 'AI chatbots (None vs Any)', type: 'categorical', rawKeys: ['Ai chatbots'] },
  { key: 'harmful_content', label: 'Harmful content', type: 'categorical', rawKeys: ['Harmful content'] },
];

const StatisticalAnalysis = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [responses, setResponses] = useState<ExperimentResponse[]>([]);
  const [prolificDemographics, setProlificDemographics] = useState<ProlificDemographicRow[]>([]);
  const [activeTab, setActiveTab] = useState('hypotheses');
  const { isGuestMode } = useResearcherAuth();
  const [sourceFilter, setSourceFilter] = useState<SourceFilterValue>(() => {
    const saved = sessionStorage.getItem(SOURCE_FILTER_STORAGE_KEY);
    if (saved === 'all' || saved === 'participant' || saved === 'researcher') {
      return saved as SourceFilterValue;
    }
    return 'participant';
  });

  useEffect(() => {
    sessionStorage.setItem(SOURCE_FILTER_STORAGE_KEY, sourceFilter);
  }, [sourceFilter]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (isGuestMode) {
          // Build synthetic experiment_responses-style data for all completed guest participants
          const base = GUEST_PARTICIPANTS.filter((p) => p.status === 'Completed');
          let guestResponses = base.map((p) =>
            buildGuestExperimentResponse(p, p.response_id || p.id)
          ) as ExperimentResponse[];

          // Apply source filter (guest Prolific IDs are 24 chars -> treated as participants)
          if (sourceFilter === 'participant') {
            guestResponses = guestResponses.filter((r) => !isResearcherId(r.prolific_id));
          } else if (sourceFilter === 'researcher') {
            guestResponses = guestResponses.filter((r) => isResearcherId(r.prolific_id));
          }

          setResponses(guestResponses);
          setProlificDemographics([]);
        } else {
          const [{ data, error }, { archivedResponseKeys }] = await Promise.all([
            supabase.from('experiment_responses').select('*'),
            fetchArchivedFilters(),
          ]);

          if (error) throw error;

          const excludeArchived = (data || []).filter(
            (r) => !archivedResponseKeys.has(`${r.prolific_id}|${r.call_id}`)
          );

          let filteredData = excludeArchived;
          if (sourceFilter === 'participant') {
            filteredData = filteredData.filter(r => !isResearcherId(r.prolific_id));
          } else if (sourceFilter === 'researcher') {
            filteredData = filteredData.filter(r => isResearcherId(r.prolific_id));
          }

          setResponses(filteredData);

          const { data: demoData } = await supabase
            .from('prolific_export_demographics')
            .select('prolific_id, age, gender, ethnicity_simplified, country_of_residence, employment_status, raw_columns');
          setProlificDemographics((demoData as ProlificDemographicRow[]) ?? []);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [sourceFilter, isGuestMode]);

  const { formalResponses, informalResponses, analysisResults, hypothesisResults, manipulationResults, exploratoryResults, baselineResults, demographicBaselineResults, progressionResults } = useMemo(() => {
    const formal = responses.filter(r => r.assistant_type === 'formal');
    const informal = responses.filter(r => r.assistant_type === 'informal');

    const computeResult = (dv: DependentVariable): Omit<AnalysisResult, 'adjustedP' | 'significant'> => {
      const formalData = formal
        .map((r) => toFiniteNumber(r[dv.key]))
        .filter((v): v is number => v !== null);
      const informalData = informal
        .map((r) => toFiniteNumber(r[dv.key]))
        .filter((v): v is number => v !== null);

      return {
        dv,
        formalData,
        informalData,
        formalStats: descriptiveStats(formalData),
        informalStats: descriptiveStats(informalData),
        tTest: formalData.length >= 2 && informalData.length >= 2 
          ? welchTTest(formalData, informalData)
          : { t: 0, df: 0, pValue: 1, meanDiff: 0, cohensD: 0, ci95: [0, 0] as [number, number] },
        mannWhitney: formalData.length >= 2 && informalData.length >= 2
          ? mannWhitneyU(formalData, informalData)
          : { U: 0, z: 0, pValue: 1, rankBiserialR: 0 },
        levene: formalData.length >= 2 && informalData.length >= 2
          ? leveneTest(formalData, informalData)
          : { W: 0, df1: 0, df2: 0, pValue: 1 },
        shapiroFormal: formalData.length >= 3 ? shapiroWilk(formalData) : { W: 1, pValue: 1, isNormal: true },
        shapiroInformal: informalData.length >= 3 ? shapiroWilk(informalData) : { W: 1, pValue: 1, isNormal: true },
      };
    };

    // Compute all results
    const allResults = ALL_DVS.map(dv => computeResult(dv));
    
    // Apply Holm correction
    const pValues = allResults.map(r => r.tTest.pValue);
    const adjustedPs = holmCorrection(pValues);
    
    const results: AnalysisResult[] = allResults.map((r, i) => ({
      ...r,
      adjustedP: adjustedPs[i],
      significant: adjustedPs[i] < 0.05,
    }));

    // Map results to hypotheses
    const hypResults: HypothesisResult[] = HYPOTHESES.map(hyp => {
      const dvResults = hyp.dvKeys
        .map(key => results.find(r => r.dv.key === key))
        .filter((r): r is AnalysisResult => r !== undefined);
      
      // Determine if hypothesis is supported
      let supported: 'yes' | 'partial' | 'no' | 'opposite' = 'no';
      let summary = '';
      
      const significantCount = dvResults.filter(r => r.significant).length;
      const correctDirectionCount = dvResults.filter(r => {
        if (!r.significant) return false;
        const formalHigher = r.tTest.meanDiff > 0;
        return hyp.direction === 'formal_higher' ? formalHigher : !formalHigher;
      }).length;
      
      const oppositeDirectionCount = dvResults.filter(r => {
        if (!r.significant) return false;
        const formalHigher = r.tTest.meanDiff > 0;
        return hyp.direction === 'formal_higher' ? !formalHigher : formalHigher;
      }).length;

      if (correctDirectionCount === dvResults.length && significantCount > 0) {
        supported = 'yes';
        summary = `Supported: All ${significantCount} measure(s) significant in predicted direction`;
      } else if (correctDirectionCount > 0) {
        supported = 'partial';
        summary = `Partially supported: ${correctDirectionCount}/${dvResults.length} significant in predicted direction`;
      } else if (oppositeDirectionCount > 0) {
        supported = 'opposite';
        summary = `Opposite effect: ${oppositeDirectionCount} measure(s) significant in opposite direction`;
      } else {
        supported = 'no';
        summary = 'Not supported: No significant differences found';
      }

      return { hypothesis: hyp, dvResults, supported, summary };
    });

    // Manipulation checks
    const manipResults = MANIPULATION_CHECKS
      .map(dv => results.find(r => r.dv.key === dv.key))
      .filter((r): r is AnalysisResult => r !== undefined);

    // Exploratory outcomes
    const expResults = EXPLORATORY_DVS
      .map(dv => results.find(r => r.dv.key === dv.key))
      .filter((r): r is AnalysisResult => r !== undefined);

    // Baseline / covariate balance (TIPI personality)
    // Compute directly from the same formal/informal splits instead of relying on ALL_DVS.
    const baseResults = BASELINE_DVS.map((dv) => computeResult(dv));

    // Demographic baseline (Prolific export: age, gender, ethnicity)
    const demoMap = new Map<string, ProlificDemographicRow>();
    prolificDemographics.forEach((d) => demoMap.set(d.prolific_id, d));
    const formalWithDemo = formal.filter((r) => demoMap.has(r.prolific_id));
    const informalWithDemo = informal.filter((r) => demoMap.has(r.prolific_id));
    const ageFormal = formalWithDemo.map((r) => demoMap.get(r.prolific_id)!.age).filter((v): v is number => v != null && Number.isFinite(v));
    const ageInformal = informalWithDemo.map((r) => demoMap.get(r.prolific_id)!.age).filter((v): v is number => v != null && Number.isFinite(v));
    const ageResult =
      ageFormal.length >= 2 && ageInformal.length >= 2
        ? {
            label: 'Age (Prolific)',
            formalStats: descriptiveStats(ageFormal),
            informalStats: descriptiveStats(ageInformal),
            tTest: welchTTest(ageFormal, ageInformal),
            formalN: ageFormal.length,
            informalN: ageInformal.length,
          }
        : null;
    const countByCategory = (
      group: typeof formalWithDemo,
      key: 'gender' | 'ethnicity_simplified'
    ): Record<string, number> => {
      const out: Record<string, number> = {};
      group.forEach((r) => {
        const val = (demoMap.get(r.prolific_id)?.[key] ?? '').trim() || 'Unknown';
        out[val] = (out[val] ?? 0) + 1;
      });
      return out;
    };
    const genderFormalCounts = countByCategory(formalWithDemo, 'gender');
    const genderInformalCounts = countByCategory(informalWithDemo, 'gender');
    const ethnicityFormalCounts = countByCategory(formalWithDemo, 'ethnicity_simplified');
    const ethnicityInformalCounts = countByCategory(informalWithDemo, 'ethnicity_simplified');
    const genderChi = chiSquare2xK(genderFormalCounts, genderInformalCounts);
    const ethnicityChi = chiSquare2xK(ethnicityFormalCounts, ethnicityInformalCounts);
    const demographicBaselineResults = {
      ageResult,
      demographicN: formalWithDemo.length + informalWithDemo.length,
      totalN: formal.length + informal.length,
      gender: { formalCounts: genderFormalCounts, informalCounts: genderInformalCounts, chi: genderChi },
      ethnicity: { formalCounts: ethnicityFormalCounts, informalCounts: ethnicityInformalCounts, chi: ethnicityChi },
    };

    const conditionResponses = responses.filter(
      (r) => r.assistant_type === 'formal' || r.assistant_type === 'informal'
    );

    const batchEarliestTimestamp = new Map<string, number>();
    const responsesByBatch = new Map<string, typeof conditionResponses>();
    for (const row of conditionResponses) {
      const batchLabel = getBatchLabel(row.batch_label);
      const existingBatchRows = responsesByBatch.get(batchLabel);
      if (existingBatchRows) {
        existingBatchRows.push(row);
      } else {
        responsesByBatch.set(batchLabel, [row]);
      }

      const parsedTimestamp = Date.parse(String(row.created_at || ''));
      const ts = Number.isFinite(parsedTimestamp) ? parsedTimestamp : Number.MAX_SAFE_INTEGER;
      const existingTs = batchEarliestTimestamp.get(batchLabel);
      if (existingTs === undefined || ts < existingTs) {
        batchEarliestTimestamp.set(batchLabel, ts);
      }
    }

    const orderedBatches = Array.from(responsesByBatch.keys()).sort((a, b) => {
      const tsA = batchEarliestTimestamp.get(a) ?? Number.MAX_SAFE_INTEGER;
      const tsB = batchEarliestTimestamp.get(b) ?? Number.MAX_SAFE_INTEGER;
      if (tsA !== tsB) return tsA - tsB;
      return a.localeCompare(b);
    });

    const progressionByMeasure: MeasureProgression[] = ALL_DVS.map((dv) => {
      const points: ProgressionPoint[] = [];
      const cumulativeFormalValues: number[] = [];
      const cumulativeInformalValues: number[] = [];

      for (let index = 0; index < orderedBatches.length; index += 1) {
        const batchLabel = orderedBatches[index];
        const batchRows = responsesByBatch.get(batchLabel) || [];

        const formalBatchValues = batchRows
          .filter((row) => row.assistant_type === 'formal')
          .map((row) => toFiniteNumber(row[dv.key]))
          .filter((value): value is number => value !== null);
        const informalBatchValues = batchRows
          .filter((row) => row.assistant_type === 'informal')
          .map((row) => toFiniteNumber(row[dv.key]))
          .filter((value): value is number => value !== null);

        cumulativeFormalValues.push(...formalBatchValues);
        cumulativeInformalValues.push(...informalBatchValues);

        let pValue: number | null = null;
        let significant: boolean | null = null;
        let cohensD: number | null = null;
        if (cumulativeFormalValues.length >= 2 && cumulativeInformalValues.length >= 2) {
          const test = welchTTest(cumulativeFormalValues, cumulativeInformalValues);
          pValue = test.pValue;
          significant = pValue < 0.05;
          cohensD = test.cohensD;
        }

        points.push({
          batchLabel,
          batchStep: index + 1,
          stepLabel: `B${index + 1}`,
          batchParticipants: formalBatchValues.length + informalBatchValues.length,
          cumulativeParticipants: cumulativeFormalValues.length + cumulativeInformalValues.length,
          formalN: cumulativeFormalValues.length,
          informalN: cumulativeInformalValues.length,
          pValue,
          significant,
          cohensD,
        });
      }

      return { dv, points };
    });

    return {
      formalResponses: formal,
      informalResponses: informal,
      analysisResults: results,
      hypothesisResults: hypResults,
      manipulationResults: manipResults,
      exploratoryResults: expResults,
      baselineResults: baseResults,
      demographicBaselineResults,
      progressionResults: progressionByMeasure,
    };
  }, [responses, prolificDemographics]);

  type DemoExploratoryCell = {
    predictorKey: string;
    predictorLabel: string;
    outcomeKey: string;
    outcomeLabel: string;
    type: 'continuous' | 'categorical';
    pValue: number;
    effectSizeLabel: string;
    n: number;
    detail?: string;
  };

  const demographicExploratoryResults = useMemo((): DemoExploratoryCell[] => {
    const demoMap = new Map<string, ProlificDemographicRow>();
    prolificDemographics.forEach((d) => demoMap.set(d.prolific_id, d));
    const responsesWithDemo = responses.filter(
      (r) => (r.assistant_type === 'formal' || r.assistant_type === 'informal') && demoMap.has(r.prolific_id)
    );
    if (responsesWithDemo.length < 5) return [];

    const cells: DemoExploratoryCell[] = [];
    for (const pred of DEMOGRAPHIC_PREDICTORS) {
      for (const dv of ALL_DVS) {
        const pairs: { demoVal: string | number; outcomeVal: number }[] = [];
        for (const r of responsesWithDemo) {
          const demo = demoMap.get(r.prolific_id)!;
          const demoVal = getDemographicValue(demo, pred);
          const outcomeVal = toFiniteNumber(r[dv.key]);
          if (demoVal != null && demoVal !== '' && outcomeVal != null) {
            pairs.push({ demoVal: demoVal as string | number, outcomeVal });
          }
        }
        if (pairs.length < 5) continue;

        if (pred.type === 'continuous') {
          const x = pairs.map((p) => p.demoVal as number);
          const y = pairs.map((p) => p.outcomeVal);
          const { r, pValue, n } = spearmanCorrelation(x, y);
          cells.push({
            predictorKey: pred.key,
            predictorLabel: pred.label,
            outcomeKey: dv.key,
            outcomeLabel: dv.label,
            type: 'continuous',
            pValue,
            effectSizeLabel: `ρ = ${r.toFixed(2)}`,
            n,
            detail: `ρ = ${r.toFixed(2)}, n = ${n}`,
          });
        } else {
          const byCat = new Map<string, number[]>();
          for (const { demoVal, outcomeVal } of pairs) {
            const cat = String(demoVal).trim() || 'Unknown';
            if (!byCat.has(cat)) byCat.set(cat, []);
            byCat.get(cat)!.push(outcomeVal);
          }
          const groups = [...byCat.values()].filter((g) => g.length >= 2);
          if (groups.length < 2) continue;
          const groupMeans = groups.map((g) => mean(g));
          const groupNs = groups.map((g) => g.length);
          let pValue = 1;
          let effectSizeLabel = '—';
          if (groups.length === 2) {
            const t = welchTTest(groups[0], groups[1]);
            pValue = t.pValue;
            effectSizeLabel = `d = ${t.cohensD.toFixed(2)}`;
          } else {
            const anova = oneWayAnova(groups);
            pValue = anova.pValue;
            effectSizeLabel = `η² = ${anova.etaSq.toFixed(2)}`;
          }
          cells.push({
            predictorKey: pred.key,
            predictorLabel: pred.label,
            outcomeKey: dv.key,
            outcomeLabel: dv.label,
            type: 'categorical',
            pValue,
            effectSizeLabel,
            n: pairs.length,
            detail: `${groups.length} groups, n = ${pairs.length}`,
          });
        }
      }
    }
    return cells;
  }, [responses, prolificDemographics]);

  const generatePythonScript = () => {
    const script = `"""
Statistical Analysis Script for Between-Subjects Experiment
Organized by Research Questions and Hypotheses

RQ1: How does formality affect perceptions and behavioral intentions?
  H1: Informal → higher empathy (PETS-ER)
  H2: Formal → higher trust (PETS-UT, TIAS)
  H3: Informal → higher intention to use

RQ2: Does prior VA experience moderate these effects?
  H4: More experienced users show attenuated effects

Exploratory: Godspeed subscales (Anthropomorphism, Likeability, Intelligence)

Requirements: pip install pandas numpy scipy pingouin statsmodels
"""

import pandas as pd
import numpy as np
from scipy import stats
import pingouin as pg
from statsmodels.formula.api import ols
import statsmodels.api as sm
from statsmodels.stats.multicomp import multipletests

# Define hypothesis mappings
HYPOTHESES = {
    'H1': {
        'name': 'Empathy',
        'dvs': ['pets_er'],
        'direction': 'informal_higher',
        'description': 'Informal assistant perceived as more empathic'
    },
    'H2': {
        'name': 'Trust', 
        'dvs': ['pets_ut', 'tias_total'],
        'direction': 'formal_higher',
        'description': 'Formal assistant perceived as more trustworthy'
    },
    'H3': {
        'name': 'Intention to Use',
        'dvs': ['intention_1', 'intention_2'],
        'direction': 'informal_higher',
        'description': 'Higher intention to use informal assistant'
    }
}

EXPLORATORY = ['godspeed_anthro_total', 'godspeed_like_total', 'godspeed_intel_total', 'pets_total']
MANIPULATION_CHECKS = ['formality', 'ai_formality_score']
MODERATOR = 'voice_assistant_familiarity'  # For RQ2/H4

def run_hypothesis_tests(df):
    """Test each hypothesis with appropriate corrections"""
    
    df_analysis = df[df['assistant_type'].isin(['formal', 'informal'])].copy()
    
    print("=" * 70)
    print("MANIPULATION CHECKS")
    print("=" * 70)
    
    for dv in MANIPULATION_CHECKS:
        if dv in df_analysis.columns:
            formal = df_analysis[df_analysis['assistant_type'] == 'formal'][dv].dropna()
            informal = df_analysis[df_analysis['assistant_type'] == 'informal'][dv].dropna()
            if len(formal) >= 2 and len(informal) >= 2:
                t_stat, p_val = stats.ttest_ind(formal, informal, equal_var=False)
                d = pg.compute_effsize(formal, informal, eftype='cohen')
                print(f"\\n{dv}:")
                print(f"  Formal: M={formal.mean():.2f}, SD={formal.std():.2f}")
                print(f"  Informal: M={informal.mean():.2f}, SD={informal.std():.2f}")
                print(f"  t={t_stat:.3f}, p={p_val:.4f}, d={d:.3f}")
                
                # Check if manipulation worked (formal should have higher formality scores)
                if 'formality' in dv or 'f_score' in dv.lower():
                    if formal.mean() > informal.mean() and p_val < 0.05:
                        print("  ✓ Manipulation successful")
                    else:
                        print("  ⚠ Manipulation may not have worked as expected")
    
    print("\\n" + "=" * 70)
    print("HYPOTHESIS TESTS (RQ1)")
    print("=" * 70)
    
    all_p_values = []
    all_results = []
    
    for hyp_id, hyp in HYPOTHESES.items():
        print(f"\\n{hyp_id}: {hyp['description']}")
        print("-" * 50)
        
        for dv in hyp['dvs']:
            if dv in df_analysis.columns:
                formal = df_analysis[df_analysis['assistant_type'] == 'formal'][dv].dropna()
                informal = df_analysis[df_analysis['assistant_type'] == 'informal'][dv].dropna()
                
                if len(formal) >= 2 and len(informal) >= 2:
                    t_stat, p_val = stats.ttest_ind(formal, informal, equal_var=False)
                    d = pg.compute_effsize(formal, informal, eftype='cohen')
                    
                    all_p_values.append(p_val)
                    all_results.append({
                        'hypothesis': hyp_id,
                        'dv': dv,
                        't': t_stat,
                        'p': p_val,
                        'd': d,
                        'formal_mean': formal.mean(),
                        'informal_mean': informal.mean(),
                        'direction': hyp['direction']
                    })
                    
                    print(f"  {dv}:")
                    print(f"    Formal: M={formal.mean():.2f}, SD={formal.std():.2f}")
                    print(f"    Informal: M={informal.mean():.2f}, SD={informal.std():.2f}")
                    print(f"    t={t_stat:.3f}, p={p_val:.4f}, d={d:.3f}")
                    
                    # Check direction
                    if hyp['direction'] == 'formal_higher':
                        correct = formal.mean() > informal.mean()
                    else:
                        correct = informal.mean() > formal.mean()
                    
                    if p_val < 0.05:
                        if correct:
                            print(f"    ✓ Significant in predicted direction")
                        else:
                            print(f"    ✗ Significant but OPPOSITE direction")
                    else:
                        print(f"    - Not significant")
    
    # Apply Holm correction
    if all_p_values:
        _, p_adjusted, _, _ = multipletests(all_p_values, method='holm')
        print("\\n" + "=" * 70)
        print("HOLM-CORRECTED P-VALUES")
        print("=" * 70)
        for i, result in enumerate(all_results):
            result['p_adjusted'] = p_adjusted[i]
            print(f"{result['hypothesis']} - {result['dv']}: p_adj = {p_adjusted[i]:.4f}")
    
    print("\\n" + "=" * 70)
    print("EXPLORATORY ANALYSES (Godspeed)")
    print("=" * 70)
    print("Note: These are exploratory and should be interpreted with caution.\\n")
    
    for dv in EXPLORATORY:
        if dv in df_analysis.columns:
            formal = df_analysis[df_analysis['assistant_type'] == 'formal'][dv].dropna()
            informal = df_analysis[df_analysis['assistant_type'] == 'informal'][dv].dropna()
            if len(formal) >= 2 and len(informal) >= 2:
                t_stat, p_val = stats.ttest_ind(formal, informal, equal_var=False)
                d = pg.compute_effsize(formal, informal, eftype='cohen')
                print(f"{dv}:")
                print(f"  Formal: M={formal.mean():.2f}, SD={formal.std():.2f}")
                print(f"  Informal: M={informal.mean():.2f}, SD={informal.std():.2f}")
                print(f"  t={t_stat:.3f}, p={p_val:.4f}, d={d:.3f}\\n")
    
    return all_results

def run_moderation_analysis(df):
    """Test RQ2/H4: Does prior VA experience moderate effects?"""
    
    print("\\n" + "=" * 70)
    print("MODERATION ANALYSIS (RQ2/H4)")
    print("=" * 70)
    print("Testing: More experienced users show attenuated sensitivity to style\\n")
    
    df_analysis = df[df['assistant_type'].isin(['formal', 'informal'])].copy()
    
    # Need to merge with demographics for VA experience
    # Assuming voice_assistant_familiarity is available
    
    if MODERATOR not in df_analysis.columns:
        print(f"Note: {MODERATOR} not found in experiment_responses.")
        print("You may need to join with demographics table.\\n")
        print("Example moderation analysis code:\\n")
        print('''
# After merging demographics:
from statsmodels.formula.api import ols

# Create interaction term
df_analysis['condition_numeric'] = (df_analysis['assistant_type'] == 'formal').astype(int)

for dv in ['pets_er', 'pets_ut', 'tias_total']:
    formula = f'{dv} ~ condition_numeric * {MODERATOR}'
    model = ols(formula, data=df_analysis).fit()
    print(f"\\n{dv}:")
    print(model.summary().tables[1])
    
    # Check interaction term
    interaction_p = model.pvalues[f'condition_numeric:{MODERATOR}']
    if interaction_p < 0.05:
        print(f"✓ Significant moderation (p = {interaction_p:.4f})")
    else:
        print(f"No significant moderation (p = {interaction_p:.4f})")
''')
        return
    
    # If moderator is available, run the analysis
    df_analysis['condition_numeric'] = (df_analysis['assistant_type'] == 'formal').astype(int)
    
    for dv in ['pets_er', 'pets_ut', 'tias_total', 'intention_1']:
        if dv in df_analysis.columns:
            formula = f'{dv} ~ condition_numeric * {MODERATOR}'
            try:
                model = ols(formula, data=df_analysis.dropna(subset=[dv, MODERATOR])).fit()
                print(f"\\n{dv}:")
                print(model.summary().tables[1])
            except Exception as e:
                print(f"Error fitting {dv}: {e}")

# Run: 
# df = pd.read_csv("your_data.csv")
# results = run_hypothesis_tests(df)
# run_moderation_analysis(df)
`;

    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'statistical_analysis_by_hypothesis.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateRScript = () => {
    const script = `# Statistical Analysis Script - Organized by Hypotheses
# 
# RQ1: How does formality affect perceptions and behavioral intentions?
#   H1: Informal → higher empathy (PETS-ER)
#   H2: Formal → higher trust (PETS-UT, TIAS)
#   H3: Informal → higher intention to use
#
# RQ2: Does prior VA experience moderate these effects?
#   H4: More experienced users show attenuated effects
#
# Exploratory: Godspeed subscales

library(dplyr)
library(effsize)
library(car)

# Define hypothesis structure
hypotheses <- list(
  H1 = list(
    name = "Empathy",
    dvs = c("pets_er"),
    direction = "informal_higher",
    desc = "Informal assistant perceived as more empathic"
  ),
  H2 = list(
    name = "Trust",
    dvs = c("pets_ut", "tias_total"),
    direction = "formal_higher", 
    desc = "Formal assistant perceived as more trustworthy"
  ),
  H3 = list(
    name = "Intention",
    dvs = c("intention_1", "intention_2"),
    direction = "informal_higher",
    desc = "Higher intention to use informal assistant"
  )
)

exploratory_dvs <- c("godspeed_anthro_total", "godspeed_like_total", "godspeed_intel_total", "pets_total")
manipulation_checks <- c("formality", "ai_formality_score")

run_hypothesis_tests <- function(df) {
  df_analysis <- df %>% filter(assistant_type %in% c("formal", "informal"))
  
  cat("\\n", strrep("=", 70), "\\n")
  cat("MANIPULATION CHECKS\\n")
  cat(strrep("=", 70), "\\n")
  
  for (dv in manipulation_checks) {
    if (dv %in% names(df_analysis)) {
      formal <- df_analysis %>% filter(assistant_type == "formal") %>% pull(!!sym(dv)) %>% na.omit()
      informal <- df_analysis %>% filter(assistant_type == "informal") %>% pull(!!sym(dv)) %>% na.omit()
      
      if (length(formal) >= 2 && length(informal) >= 2) {
        test <- t.test(formal, informal, var.equal = FALSE)
        d <- cohen.d(formal, informal)
        
        cat(sprintf("\\n%s:\\n", dv))
        cat(sprintf("  Formal: M=%.2f, SD=%.2f\\n", mean(formal), sd(formal)))
        cat(sprintf("  Informal: M=%.2f, SD=%.2f\\n", mean(informal), sd(informal)))
        cat(sprintf("  t=%.3f, p=%.4f, d=%.3f\\n", test$statistic, test$p.value, d$estimate))
      }
    }
  }
  
  cat("\\n", strrep("=", 70), "\\n")
  cat("HYPOTHESIS TESTS (RQ1)\\n")
  cat(strrep("=", 70), "\\n")
  
  all_p <- c()
  results <- list()
  
  for (hyp_id in names(hypotheses)) {
    hyp <- hypotheses[[hyp_id]]
    cat(sprintf("\\n%s: %s\\n", hyp_id, hyp$desc))
    cat(strrep("-", 50), "\\n")
    
    for (dv in hyp$dvs) {
      if (dv %in% names(df_analysis)) {
        formal <- df_analysis %>% filter(assistant_type == "formal") %>% pull(!!sym(dv)) %>% na.omit()
        informal <- df_analysis %>% filter(assistant_type == "informal") %>% pull(!!sym(dv)) %>% na.omit()
        
        if (length(formal) >= 2 && length(informal) >= 2) {
          test <- t.test(formal, informal, var.equal = FALSE)
          d <- cohen.d(formal, informal)
          
          all_p <- c(all_p, test$p.value)
          
          cat(sprintf("  %s:\\n", dv))
          cat(sprintf("    Formal: M=%.2f, SD=%.2f\\n", mean(formal), sd(formal)))
          cat(sprintf("    Informal: M=%.2f, SD=%.2f\\n", mean(informal), sd(informal)))
          cat(sprintf("    t=%.3f, p=%.4f, d=%.3f\\n", test$statistic, test$p.value, d$estimate))
          
          correct <- if (hyp$direction == "formal_higher") mean(formal) > mean(informal) else mean(informal) > mean(formal)
          
          if (test$p.value < 0.05) {
            if (correct) {
              cat("    ✓ Significant in predicted direction\\n")
            } else {
              cat("    ✗ Significant but OPPOSITE direction\\n")
            }
          } else {
            cat("    - Not significant\\n")
          }
        }
      }
    }
  }
  
  # Holm correction
  if (length(all_p) > 0) {
    p_adj <- p.adjust(all_p, method = "holm")
    cat("\\n", strrep("=", 70), "\\n")
    cat("HOLM-CORRECTED P-VALUES\\n")
    cat(strrep("=", 70), "\\n")
    print(data.frame(p_original = all_p, p_adjusted = p_adj))
  }
  
  cat("\\n", strrep("=", 70), "\\n")
  cat("EXPLORATORY ANALYSES (Godspeed)\\n")
  cat(strrep("=", 70), "\\n")
  cat("Note: These are exploratory and should be interpreted with caution.\\n\\n")
  
  for (dv in exploratory_dvs) {
    if (dv %in% names(df_analysis)) {
      formal <- df_analysis %>% filter(assistant_type == "formal") %>% pull(!!sym(dv)) %>% na.omit()
      informal <- df_analysis %>% filter(assistant_type == "informal") %>% pull(!!sym(dv)) %>% na.omit()
      
      if (length(formal) >= 2 && length(informal) >= 2) {
        test <- t.test(formal, informal, var.equal = FALSE)
        d <- cohen.d(formal, informal)
        
        cat(sprintf("%s:\\n", dv))
        cat(sprintf("  Formal: M=%.2f, SD=%.2f\\n", mean(formal), sd(formal)))
        cat(sprintf("  Informal: M=%.2f, SD=%.2f\\n", mean(informal), sd(informal)))
        cat(sprintf("  t=%.3f, p=%.4f, d=%.3f\\n\\n", test$statistic, test$p.value, d$estimate))
      }
    }
  }
}

run_moderation_analysis <- function(df) {
  cat("\\n", strrep("=", 70), "\\n")
  cat("MODERATION ANALYSIS (RQ2/H4)\\n")
  cat(strrep("=", 70), "\\n")
  
  df_analysis <- df %>% 
    filter(assistant_type %in% c("formal", "informal")) %>%
    mutate(condition_numeric = as.numeric(assistant_type == "formal"))
  
  moderator <- "voice_assistant_familiarity"
  
  for (dv in c("pets_er", "pets_ut", "tias_total", "intention_1")) {
    if (dv %in% names(df_analysis) && moderator %in% names(df_analysis)) {
      formula <- as.formula(paste(dv, "~ condition_numeric *", moderator))
      model <- lm(formula, data = df_analysis)
      
      cat(sprintf("\\n%s:\\n", dv))
      print(summary(model)$coefficients)
      
      interaction_term <- paste0("condition_numeric:", moderator)
      if (interaction_term %in% rownames(summary(model)$coefficients)) {
        p_int <- summary(model)$coefficients[interaction_term, "Pr(>|t|)"]
        if (p_int < 0.05) {
          cat(sprintf("✓ Significant moderation (p = %.4f)\\n", p_int))
        } else {
          cat(sprintf("No significant moderation (p = %.4f)\\n", p_int))
        }
      }
    }
  }
}

# Usage:
# df <- read.csv("your_data.csv")
# run_hypothesis_tests(df)
# run_moderation_analysis(df)
`;

    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'statistical_analysis_by_hypothesis.R';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getSupportBadge = (supported: 'yes' | 'partial' | 'no' | 'opposite') => {
    switch (supported) {
      case 'yes':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">✓ Supported</Badge>;
      case 'partial':
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">◐ Partial</Badge>;
      case 'opposite':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">✗ Opposite</Badge>;
      default:
        return <Badge variant="secondary">○ Not Supported</Badge>;
    }
  };

  const getDirectionIcon = (result: AnalysisResult, expectedDirection: 'formal_higher' | 'informal_higher' | 'exploratory') => {
    const formalHigher = result.tTest.meanDiff > 0;
    
    if (expectedDirection === 'exploratory') {
      return formalHigher ? 
        <TrendingUp className="h-4 w-4 text-blue-500" /> : 
        <TrendingDown className="h-4 w-4 text-amber-500" />;
    }
    
    const correctDirection = expectedDirection === 'formal_higher' ? formalHigher : !formalHigher;
    
    if (result.significant) {
      return correctDirection ? 
        <CheckCircle2 className="h-4 w-4 text-green-600" /> : 
        <XCircle className="h-4 w-4 text-red-500" />;
    }
    
    return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
  };

  const formatP = (p: number) => {
    if (p < 0.001) return '< .001';
    if (p < 0.01) return p.toFixed(3);
    return p.toFixed(3);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/researcher/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Statistical Analysis</h1>
              <p className="text-muted-foreground">
                Formal (n={formalResponses.length}) vs Informal (n={informalResponses.length})
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <GlobalSourceFilter value={sourceFilter} onChange={setSourceFilter} />
            <div className="flex gap-2 self-start md:self-auto">
              <Button
                variant="outline"
                onClick={generatePythonScript}
                title="Scripts are not finalized yet; they will be generated once the statistical tests are finished and determined."
              >
                <Download className="h-4 w-4 mr-2" />
                Python
              </Button>
              <Button
                variant="outline"
                onClick={generateRScript}
                title="Scripts are not finalized yet; they will be generated once the statistical tests are finished and determined."
              >
                <Download className="h-4 w-4 mr-2" />
                R Script
              </Button>
            </div>
          </div>
        </div>

        {/* Research Questions Overview */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">RQ1: Main Effects</CardTitle>
              <CardDescription>
                How does conversational formality affect older adults' perceptions of empathy, trust, and intention to use?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {hypothesisResults.map(hr => (
                  <div key={hr.hypothesis.id} className="flex items-center justify-between py-1">
                    <span className="text-sm font-medium">{hr.hypothesis.id}: {hr.hypothesis.label.split(': ')[1]}</span>
                    {getSupportBadge(hr.supported)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">RQ2: Moderation</CardTitle>
              <CardDescription>
                Does prior VA experience moderate the relationship between formality and outcomes?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm font-medium">H4: Experience moderates effects</span>
                  <Badge variant="outline">
                    <HelpCircle className="h-3 w-3 mr-1" />
                    Requires moderation analysis
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2" title="Scripts are not finalized yet; they will be generated once the statistical tests are finished and determined.">
                  Download Python/R scripts for full moderation analysis with interaction terms.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="hypotheses">Hypotheses</TabsTrigger>
            <TabsTrigger value="baseline">Baseline Balance</TabsTrigger>
            <TabsTrigger value="demographics">Demographics × Outcomes</TabsTrigger>
            <TabsTrigger value="manipulation">Manipulation Check</TabsTrigger>
            <TabsTrigger value="exploratory">Exploratory</TabsTrigger>
            <TabsTrigger value="progression">Progression</TabsTrigger>
            <TabsTrigger value="descriptive">Descriptive</TabsTrigger>
            <TabsTrigger value="assumptions">Assumptions</TabsTrigger>
          </TabsList>

          {/* Hypotheses Tab */}
          <TabsContent value="hypotheses" className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Analysis Approach</AlertTitle>
              <AlertDescription>
                Primary analysis uses <strong>Welch's t-tests</strong> with <strong>Holm-Bonferroni correction</strong>. 
                Effect sizes reported as Cohen's d. Hypotheses marked as supported if p_adj &lt; .05 in the predicted direction.
              </AlertDescription>
            </Alert>

            {hypothesisResults.map((hr) => (
              <Card key={hr.hypothesis.id} className={
                hr.supported === 'yes' ? 'border-green-200 bg-green-50/30 dark:border-green-900 dark:bg-green-950/20' :
                hr.supported === 'partial' ? 'border-amber-200 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/20' :
                hr.supported === 'opposite' ? 'border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/20' :
                ''
              }>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {hr.hypothesis.label}
                        {getSupportBadge(hr.supported)}
                      </CardTitle>
                      <CardDescription className="mt-1">{hr.hypothesis.description}</CardDescription>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {hr.hypothesis.direction === 'formal_higher' ? 'Formal > Informal' : 'Informal > Formal'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">{hr.summary}</p>
                  
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Measure</TableHead>
                        <TableHead className="text-center bg-blue-50/50 dark:bg-blue-950/30">Formal (M ± SD)</TableHead>
                        <TableHead className="text-center bg-amber-50/50 dark:bg-amber-950/30">Informal (M ± SD)</TableHead>
                        <TableHead className="text-center">t</TableHead>
                        <TableHead className="text-center">p</TableHead>
                        <TableHead className="text-center">p (adj)</TableHead>
                        <TableHead className="text-center">Cohen's d</TableHead>
                        <TableHead className="text-center">Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hr.dvResults.map((result) => (
                        <TableRow key={result.dv.key}>
                          <TableCell className="font-medium">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">{result.dv.label}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{result.dv.description}</p>
                                <p className="text-xs">Scale: {result.dv.scale}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-center bg-blue-50/30 dark:bg-blue-950/10">
                            {result.formalStats.mean.toFixed(2)} ± {result.formalStats.std.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center bg-amber-50/30 dark:bg-amber-950/10">
                            {result.informalStats.mean.toFixed(2)} ± {result.informalStats.std.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {result.tTest.t.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {formatP(result.tTest.pValue)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm font-medium">
                            <span className={result.significant ? 'text-green-600' : ''}>
                              {formatP(result.adjustedP)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-mono text-sm">{result.tTest.cohensD.toFixed(2)}</span>
                            <span className="text-xs text-muted-foreground ml-1">
                              ({interpretCohensD(result.tTest.cohensD)})
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {getDirectionIcon(result, hr.hypothesis.direction)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Baseline / Covariate Balance Tab */}
          <TabsContent value="baseline" className="space-y-6">
            <Alert>
              <HelpCircle className="h-4 w-4" />
              <AlertTitle>Baseline Balance / Randomization Check</AlertTitle>
              <AlertDescription>
                Personality (TIPI) scores are treated as <strong>baseline covariates</strong>, not outcomes. This table checks whether the
                formal and informal groups look comparable at baseline, and highlights any imbalances that might help explain differences
                in outcomes beyond the assigned condition.
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle>TIPI Personality Profiles by Condition</CardTitle>
                <CardDescription>
                  Comparing baseline personality between formal and informal conditions. Large differences here suggest selection or randomization
                  imbalances rather than effects of the assistant&apos;s formality.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {baselineResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No TIPI data available for the selected data source.
                  </p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Scale</TableHead>
                          <TableHead className="text-center bg-blue-50/50 dark:bg-blue-950/30">Formal (M ± SD)</TableHead>
                          <TableHead className="text-center bg-amber-50/50 dark:bg-amber-950/30">Informal (M ± SD)</TableHead>
                          <TableHead className="text-center">t</TableHead>
                          <TableHead className="text-center">p</TableHead>
                          <TableHead className="text-center">Cohen&apos;s d</TableHead>
                          <TableHead className="text-center">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {baselineResults.map((result) => {
                          const p = result.tTest.pValue;
                          const absD = Math.abs(result.tTest.cohensD);

                          // Balance rule:
                          // - Balanced: clearly small and non-significant (p >= .10 AND |d| < .2)
                          // - Imbalance: clearly different and non-trivial (p < .05 AND |d| >= .5)
                          // - Borderline: everything in between (some signal but not strong enough either way)
                          let balanceStatus: 'balanced' | 'borderline' | 'imbalanced';
                          if (p >= 0.10 && absD < 0.2) {
                            balanceStatus = 'balanced';
                          } else if (p < 0.05 && absD >= 0.5) {
                            balanceStatus = 'imbalanced';
                          } else {
                            balanceStatus = 'borderline';
                          }

                          return (
                            <TableRow key={result.dv.key}>
                              <TableCell>
                                <div>
                                  <span className="font-medium">{result.dv.label}</span>
                                  <p className="text-xs text-muted-foreground">{result.dv.description}</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-center bg-blue-50/30 dark:bg-blue-950/10">
                                {result.formalStats.mean.toFixed(2)} ± {result.formalStats.std.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-center bg-amber-50/30 dark:bg-amber-950/10">
                                {result.informalStats.mean.toFixed(2)} ± {result.informalStats.std.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-center font-mono">
                                {result.tTest.t.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-center font-mono">
                                {formatP(result.tTest.pValue)}
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="font-mono">{result.tTest.cohensD.toFixed(2)}</span>
                                <Badge variant="outline" className="ml-2 text-xs">
                                  {interpretCohensD(result.tTest.cohensD)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                {balanceStatus === 'balanced' ? (
                                  <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Balanced
                                  </Badge>
                                ) : balanceStatus === 'imbalanced' ? (
                                  <Badge variant="outline" className="flex items-center gap-1 text-red-700 border-red-300 bg-red-50/80 dark:border-red-900 dark:bg-red-950/30">
                                    <AlertTriangle className="h-3 w-3" />
                                    Imbalance
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="flex items-center gap-1 text-amber-700 border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30">
                                    <AlertTriangle className="h-3 w-3" />
                                    Borderline
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <p className="mt-3 text-xs text-muted-foreground">
                      "Balanced" means clearly small and non-significant differences (p ≥ .10 and |d| &lt; 0.2). "Imbalance" flags rows with
                      strong evidence of a non-trivial baseline difference (p &lt; .05 and |d| ≥ 0.5). "Borderline" covers intermediate cases
                      where there is some signal but not strong enough to classify as clearly balanced or clearly imbalanced.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Demographic baseline (Prolific export) */}
            <Card>
              <CardHeader>
                <CardTitle>Demographics by Condition (Prolific export)</CardTitle>
                <CardDescription>
                  Age, gender, and ethnicity from researcher-uploaded Prolific demographic export. Use the Responses tab to upload a CSV.
                  {demographicBaselineResults.demographicN < demographicBaselineResults.totalN && (
                    <span className="block mt-1 text-amber-600 dark:text-amber-500">
                      {demographicBaselineResults.totalN - demographicBaselineResults.demographicN} of {demographicBaselineResults.totalN} participants have no Prolific demographics.
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {demographicBaselineResults.ageResult ? (
                  <div>
                    <p className="text-sm font-medium mb-2">Age</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Formal (M ± SD)</TableHead>
                          <TableHead>Informal (M ± SD)</TableHead>
                          <TableHead>t</TableHead>
                          <TableHead>p</TableHead>
                          <TableHead>Cohen&apos;s d</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="bg-blue-50/30 dark:bg-blue-950/10">
                            {demographicBaselineResults.ageResult.formalStats.mean.toFixed(2)} ± {demographicBaselineResults.ageResult.formalStats.std.toFixed(2)} (n={demographicBaselineResults.ageResult.formalN})
                          </TableCell>
                          <TableCell className="bg-amber-50/30 dark:bg-amber-950/10">
                            {demographicBaselineResults.ageResult.informalStats.mean.toFixed(2)} ± {demographicBaselineResults.ageResult.informalStats.std.toFixed(2)} (n={demographicBaselineResults.ageResult.informalN})
                          </TableCell>
                          <TableCell className="font-mono">{demographicBaselineResults.ageResult.tTest.t.toFixed(2)}</TableCell>
                          <TableCell className="font-mono">{formatP(demographicBaselineResults.ageResult.tTest.pValue)}</TableCell>
                          <TableCell>
                            <span className="font-mono">{demographicBaselineResults.ageResult.tTest.cohensD.toFixed(2)}</span>
                            <Badge variant="outline" className="ml-2 text-xs">{interpretCohensD(demographicBaselineResults.ageResult.tTest.cohensD)}</Badge>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No age data available. Upload a Prolific demographic CSV with an &quot;Age&quot; column.</p>
                )}
                <div>
                  <p className="text-sm font-medium mb-2">Gender (χ²)</p>
                  {Object.keys(demographicBaselineResults.gender.formalCounts).length > 0 || Object.keys(demographicBaselineResults.gender.informalCounts).length > 0 ? (
                    <>
                      <p className="text-xs text-muted-foreground mb-1">
                        Formal: {Object.entries(demographicBaselineResults.gender.formalCounts).map(([k, v]) => `${k}: ${v}`).join(', ')} — 
                        Informal: {Object.entries(demographicBaselineResults.gender.informalCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}
                      </p>
                      <p className="text-sm font-mono">χ² = {demographicBaselineResults.gender.chi.chi2.toFixed(2)}, df = {demographicBaselineResults.gender.chi.df}, p = {formatP(demographicBaselineResults.gender.chi.pValue)}</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No gender data. Upload a Prolific CSV with &quot;Gender&quot; or &quot;Sex&quot;.</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Ethnicity (χ²)</p>
                  {Object.keys(demographicBaselineResults.ethnicity.formalCounts).length > 0 || Object.keys(demographicBaselineResults.ethnicity.informalCounts).length > 0 ? (
                    <>
                      <p className="text-xs text-muted-foreground mb-1">
                        Formal: {Object.entries(demographicBaselineResults.ethnicity.formalCounts).map(([k, v]) => `${k}: ${v}`).join(', ')} — 
                        Informal: {Object.entries(demographicBaselineResults.ethnicity.informalCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}
                      </p>
                      <p className="text-sm font-mono">χ² = {demographicBaselineResults.ethnicity.chi.chi2.toFixed(2)}, df = {demographicBaselineResults.ethnicity.chi.df}, p = {formatP(demographicBaselineResults.ethnicity.chi.pValue)}</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No ethnicity data. Upload a Prolific CSV with &quot;Ethnicity simplified&quot;.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Demographics × Outcomes (exploratory) */}
          <TabsContent value="demographics" className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Exploratory: Demographics × Outcomes</AlertTitle>
              <AlertDescription>
                Effect of demographic predictors (from Prolific export) on each outcome. Age: Spearman ρ. Categorical: group comparison (t-test or one-way ANOVA). Interpret as exploratory; with small n (~25–150) many tests are underpowered. Use &quot;Responses&quot; to upload a CSV with columns like Telemedicine, Hearing difficulties, Ai chatbots, etc.
              </AlertDescription>
            </Alert>
            <Card>
              <CardHeader>
                <CardTitle>Predictor × Outcome grid</CardTitle>
                <CardDescription>
                  p &lt; 0.05 highlighted. Effect: ρ (Age), Cohen&apos;s d (2 groups), or η² (3+ groups).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {demographicExploratoryResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Need at least 5 participants with both Prolific demographics and outcome data. Upload a Prolific demographic CSV in the Responses tab.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Predictor</TableHead>
                          <TableHead>Outcome</TableHead>
                          <TableHead className="text-right">n</TableHead>
                          <TableHead className="text-right">p</TableHead>
                          <TableHead className="text-right">Effect</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {demographicExploratoryResults
                          .sort((a, b) => a.pValue - b.pValue)
                          .map((cell, idx) => (
                            <TableRow
                              key={`${cell.predictorKey}-${cell.outcomeKey}-${idx}`}
                              className={cell.pValue < 0.05 ? 'bg-amber-50/50 dark:bg-amber-950/20' : undefined}
                            >
                              <TableCell className="font-medium">{cell.predictorLabel}</TableCell>
                              <TableCell>{cell.outcomeLabel}</TableCell>
                              <TableCell className="text-right font-mono">{cell.n}</TableCell>
                              <TableCell className="text-right font-mono">{formatP(cell.pValue)}</TableCell>
                              <TableCell className="text-right font-mono">{cell.effectSizeLabel}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Manipulation Check Tab */}
          <TabsContent value="manipulation" className="space-y-6">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Manipulation Check</AlertTitle>
              <AlertDescription>
                Verifying that participants in the formal condition perceived higher formality than those in the informal condition.
                A successful manipulation shows significantly higher scores for the formal condition.
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle>Formality Perception Verification</CardTitle>
                <CardDescription>
                  Both user-rated (Perceived Formality) and AI-calculated (F-Score) measures should show formal &gt; informal
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Measure</TableHead>
                      <TableHead className="text-center bg-blue-50/50 dark:bg-blue-950/30">Formal (M ± SD)</TableHead>
                      <TableHead className="text-center bg-amber-50/50 dark:bg-amber-950/30">Informal (M ± SD)</TableHead>
                      <TableHead className="text-center">Difference</TableHead>
                      <TableHead className="text-center">t</TableHead>
                      <TableHead className="text-center">p</TableHead>
                      <TableHead className="text-center">Cohen's d</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manipulationResults.map((result) => {
                      const manipulationWorked = result.significant && result.tTest.meanDiff > 0;
                      return (
                        <TableRow key={result.dv.key} className={manipulationWorked ? 'bg-green-50/50 dark:bg-green-950/20' : 'bg-red-50/50 dark:bg-red-950/20'}>
                          <TableCell className="font-medium">{result.dv.label}</TableCell>
                          <TableCell className="text-center bg-blue-50/30 dark:bg-blue-950/10">
                            {result.formalStats.mean.toFixed(2)} ± {result.formalStats.std.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center bg-amber-50/30 dark:bg-amber-950/10">
                            {result.informalStats.mean.toFixed(2)} ± {result.informalStats.std.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center font-mono">
                            {result.tTest.meanDiff > 0 ? '+' : ''}{result.tTest.meanDiff.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center font-mono">{result.tTest.t.toFixed(2)}</TableCell>
                          <TableCell className="text-center font-mono">{formatP(result.tTest.pValue)}</TableCell>
                          <TableCell className="text-center font-mono">{result.tTest.cohensD.toFixed(2)}</TableCell>
                          <TableCell className="text-center">
                            {manipulationWorked ? (
                              <Badge className="bg-green-100 text-green-800">✓ Successful</Badge>
                            ) : (
                              <Badge variant="destructive">⚠ Check Required</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Exploratory Tab */}
          <TabsContent value="exploratory" className="space-y-6">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Exploratory Analyses</AlertTitle>
              <AlertDescription>
                <strong>Godspeed subscales</strong> are examined as exploratory outcomes to characterize how formality affects 
                broader perceptions of the voice assistant. These findings should be interpreted with caution and 
                framed as hypothesis-generating rather than confirmatory.
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle>Godspeed Questionnaire Subscales</CardTitle>
                <CardDescription>
                  Exploring effects on anthropomorphism, likeability, and perceived intelligence
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subscale</TableHead>
                      <TableHead className="text-center bg-blue-50/50 dark:bg-blue-950/30">Formal (M ± SD)</TableHead>
                      <TableHead className="text-center bg-amber-50/50 dark:bg-amber-950/30">Informal (M ± SD)</TableHead>
                      <TableHead className="text-center">t</TableHead>
                      <TableHead className="text-center">p</TableHead>
                      <TableHead className="text-center">Cohen's d</TableHead>
                      <TableHead className="text-center">Direction</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exploratoryResults.map((result) => (
                      <TableRow key={result.dv.key}>
                        <TableCell>
                          <div>
                            <span className="font-medium">{result.dv.label}</span>
                            <p className="text-xs text-muted-foreground">{result.dv.description}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center bg-blue-50/30 dark:bg-blue-950/10">
                          {result.formalStats.mean.toFixed(2)} ± {result.formalStats.std.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center bg-amber-50/30 dark:bg-amber-950/10">
                          {result.informalStats.mean.toFixed(2)} ± {result.informalStats.std.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center font-mono">{result.tTest.t.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-mono">
                          <span className={result.tTest.pValue < 0.05 ? 'font-bold' : ''}>
                            {formatP(result.tTest.pValue)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-mono">{result.tTest.cohensD.toFixed(2)}</span>
                          <Badge variant="outline" className="ml-2 text-xs">
                            {interpretCohensD(result.tTest.cohensD)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {result.tTest.meanDiff > 0 ? (
                            <span className="text-blue-600 text-sm">Formal ↑</span>
                          ) : (
                            <span className="text-amber-600 text-sm">Informal ↑</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium text-sm mb-2">Interpretation Notes</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• These analyses are <strong>not corrected</strong> for multiple comparisons (exploratory)</li>
                    <li>• Significant findings should be replicated in future confirmatory studies</li>
                    <li>• Consider these as potential mediators or additional outcomes for future research</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Progression Tab */}
          <TabsContent value="progression" className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Significance Progression by Batch</AlertTitle>
              <AlertDescription>
                Each chart shows p-value (y-axis) as cumulative sample size N (x-axis) increases. Vertical lines mark the end of each batch. The dashed line marks α = .05 (below line indicates significance).
              </AlertDescription>
            </Alert>

            <div className="grid gap-6">
              {progressionResults.map((measureProgression) => {
                const lastPoint = measureProgression.points[measureProgression.points.length - 1];
                const firstSignificant = measureProgression.points.find((point) => point.significant === true);
                return (
                  <Card key={measureProgression.dv.key}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        {measureProgression.dv.label}
                        <Badge variant="outline" className="text-xs">{measureProgression.dv.scale}</Badge>
                      </CardTitle>
                      <CardDescription>
                        {measureProgression.dv.description}
                        {firstSignificant
                          ? ` First reached significance at ${firstSignificant.batchLabel} (N=${firstSignificant.cumulativeParticipants}).`
                          : ' No significant cumulative batch point yet.'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {measureProgression.points.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No batch data available.</p>
                      ) : (
                        <div className="h-72 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={measureProgression.points}
                              margin={{ top: 24, right: 24, left: 8, bottom: 24 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis
                                dataKey="cumulativeParticipants"
                                type="number"
                                allowDecimals={false}
                                tickLine={false}
                                axisLine={false}
                                label={{ value: 'N (cumulative sample size)', position: 'insideBottom', offset: -8 }}
                              />
                              <YAxis
                                domain={[0, 1]}
                                tickFormatter={(value) => Number(value).toFixed(2)}
                                tickLine={false}
                                axisLine={false}
                                label={{ value: 'p-value', angle: -90, position: 'insideLeft' }}
                              />
                              <RechartsTooltip
                                labelFormatter={(n, payload) => {
                                  const point = payload?.[0]?.payload as ProgressionPoint | undefined;
                                  return point ? `${point.batchLabel} (N=${n})` : `N = ${n}`;
                                }}
                                formatter={(value, name) => {
                                  if (name === 'p-value' && typeof value === 'number') {
                                    return [formatP(value), 'p-value'];
                                  }
                                  return [String(value), String(name)];
                                }}
                                contentStyle={{ borderRadius: 8 }}
                              />
                              <Legend />
                              <ReferenceLine
                                y={0.05}
                                stroke="#ef4444"
                                strokeDasharray="4 4"
                                label={{ value: 'α=.05', position: 'insideTopRight' }}
                              />
                              {measureProgression.points.map((point) => (
                                <ReferenceLine
                                  key={point.batchStep}
                                  x={point.cumulativeParticipants}
                                  stroke="hsl(var(--muted-foreground))"
                                  strokeDasharray="2 2"
                                  label={{ value: point.batchLabel, position: 'top', fontSize: 10 }}
                                />
                              ))}
                              <Line
                                type="monotone"
                                dataKey="pValue"
                                name="p-value"
                                stroke="#2563eb"
                                strokeWidth={2}
                                connectNulls={false}
                                dot={{ r: 3 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {lastPoint && (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant="secondary">Latest batch: {lastPoint.batchLabel}</Badge>
                          <Badge variant="secondary">N={lastPoint.cumulativeParticipants}</Badge>
                          <Badge variant={lastPoint.significant ? 'default' : 'outline'}>
                            {lastPoint.significant ? 'Significant' : 'Not significant'}
                          </Badge>
                          {lastPoint.pValue !== null && <Badge variant="outline">p={formatP(lastPoint.pValue)}</Badge>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Descriptive Tab */}
          <TabsContent value="descriptive" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Complete Descriptive Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead rowSpan={2}>Variable</TableHead>
                        <TableHead rowSpan={2}>Category</TableHead>
                        <TableHead colSpan={4} className="text-center border-l bg-blue-50 dark:bg-blue-950/30">Formal (n={formalResponses.length})</TableHead>
                        <TableHead colSpan={4} className="text-center border-l bg-amber-50 dark:bg-amber-950/30">Informal (n={informalResponses.length})</TableHead>
                      </TableRow>
                      <TableRow>
                        <TableHead className="text-center border-l bg-blue-50 dark:bg-blue-950/30">M</TableHead>
                        <TableHead className="text-center bg-blue-50 dark:bg-blue-950/30">SD</TableHead>
                        <TableHead className="text-center bg-blue-50 dark:bg-blue-950/30">Mdn</TableHead>
                        <TableHead className="text-center bg-blue-50 dark:bg-blue-950/30">Range</TableHead>
                        <TableHead className="text-center border-l bg-amber-50 dark:bg-amber-950/30">M</TableHead>
                        <TableHead className="text-center bg-amber-50 dark:bg-amber-950/30">SD</TableHead>
                        <TableHead className="text-center bg-amber-50 dark:bg-amber-950/30">Mdn</TableHead>
                        <TableHead className="text-center bg-amber-50 dark:bg-amber-950/30">Range</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* H1 - Empathy */}
                      {analysisResults.filter(r => r.dv.key === 'pets_er').map((result) => (
                        <TableRow key={result.dv.key} className="bg-green-50/20 dark:bg-green-950/10">
                          <TableCell className="font-medium">{result.dv.label}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">H1</Badge></TableCell>
                          <TableCell className="text-center border-l">{result.formalStats.mean.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.formalStats.std.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.formalStats.median.toFixed(2)}</TableCell>
                          <TableCell className="text-center text-xs">{result.formalStats.min.toFixed(0)}-{result.formalStats.max.toFixed(0)}</TableCell>
                          <TableCell className="text-center border-l">{result.informalStats.mean.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.informalStats.std.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.informalStats.median.toFixed(2)}</TableCell>
                          <TableCell className="text-center text-xs">{result.informalStats.min.toFixed(0)}-{result.informalStats.max.toFixed(0)}</TableCell>
                        </TableRow>
                      ))}
                      {/* H2 - Trust */}
                      {analysisResults.filter(r => ['pets_ut', 'tias_total'].includes(r.dv.key)).map((result) => (
                        <TableRow key={result.dv.key} className="bg-blue-50/20 dark:bg-blue-950/10">
                          <TableCell className="font-medium">{result.dv.label}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">H2</Badge></TableCell>
                          <TableCell className="text-center border-l">{result.formalStats.mean.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.formalStats.std.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.formalStats.median.toFixed(2)}</TableCell>
                          <TableCell className="text-center text-xs">{result.formalStats.min.toFixed(0)}-{result.formalStats.max.toFixed(0)}</TableCell>
                          <TableCell className="text-center border-l">{result.informalStats.mean.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.informalStats.std.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.informalStats.median.toFixed(2)}</TableCell>
                          <TableCell className="text-center text-xs">{result.informalStats.min.toFixed(0)}-{result.informalStats.max.toFixed(0)}</TableCell>
                        </TableRow>
                      ))}
                      {/* H3 - Intention */}
                      {analysisResults.filter(r => ['intention_1', 'intention_2'].includes(r.dv.key)).map((result) => (
                        <TableRow key={result.dv.key} className="bg-purple-50/20 dark:bg-purple-950/10">
                          <TableCell className="font-medium">{result.dv.label}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">H3</Badge></TableCell>
                          <TableCell className="text-center border-l">{result.formalStats.mean.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.formalStats.std.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.formalStats.median.toFixed(2)}</TableCell>
                          <TableCell className="text-center text-xs">{result.formalStats.min.toFixed(0)}-{result.formalStats.max.toFixed(0)}</TableCell>
                          <TableCell className="text-center border-l">{result.informalStats.mean.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.informalStats.std.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.informalStats.median.toFixed(2)}</TableCell>
                          <TableCell className="text-center text-xs">{result.informalStats.min.toFixed(0)}-{result.informalStats.max.toFixed(0)}</TableCell>
                        </TableRow>
                      ))}
                      {/* Exploratory */}
                      {analysisResults.filter(r => ['godspeed_anthro_total', 'godspeed_like_total', 'godspeed_intel_total', 'pets_total'].includes(r.dv.key)).map((result) => (
                        <TableRow key={result.dv.key}>
                          <TableCell className="font-medium">{result.dv.label}</TableCell>
                          <TableCell><Badge variant="secondary" className="text-xs">Exp</Badge></TableCell>
                          <TableCell className="text-center border-l">{result.formalStats.mean.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.formalStats.std.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.formalStats.median.toFixed(2)}</TableCell>
                          <TableCell className="text-center text-xs">{result.formalStats.min.toFixed(0)}-{result.formalStats.max.toFixed(0)}</TableCell>
                          <TableCell className="text-center border-l">{result.informalStats.mean.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.informalStats.std.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.informalStats.median.toFixed(2)}</TableCell>
                          <TableCell className="text-center text-xs">{result.informalStats.min.toFixed(0)}-{result.informalStats.max.toFixed(0)}</TableCell>
                        </TableRow>
                      ))}
                      {/* Manipulation checks */}
                      {analysisResults.filter(r => ['formality', 'ai_formality_score'].includes(r.dv.key)).map((result) => (
                        <TableRow key={result.dv.key} className="bg-slate-50/50 dark:bg-slate-950/20">
                          <TableCell className="font-medium">{result.dv.label}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">Check</Badge></TableCell>
                          <TableCell className="text-center border-l">{result.formalStats.mean.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.formalStats.std.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.formalStats.median.toFixed(2)}</TableCell>
                          <TableCell className="text-center text-xs">{result.formalStats.min.toFixed(0)}-{result.formalStats.max.toFixed(0)}</TableCell>
                          <TableCell className="text-center border-l">{result.informalStats.mean.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.informalStats.std.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{result.informalStats.median.toFixed(2)}</TableCell>
                          <TableCell className="text-center text-xs">{result.informalStats.min.toFixed(0)}-{result.informalStats.max.toFixed(0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Assumptions Tab */}
          <TabsContent value="assumptions" className="space-y-6">
            <Alert variant="default">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Assumption Check Interpretation</AlertTitle>
              <AlertDescription>
                Welch's t-test is robust to variance inequality. With n &gt; 30 per group, the Central Limit Theorem 
                provides robustness to non-normality. Mann-Whitney U tests in the downloadable scripts serve as 
                non-parametric alternatives if needed.
              </AlertDescription>
            </Alert>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Levene's Test (Variance Equality)</CardTitle>
                  <CardDescription>p &gt; .05 suggests equal variances</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variable</TableHead>
                        <TableHead className="text-center">W</TableHead>
                        <TableHead className="text-center">p</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysisResults.map((result) => (
                        <TableRow key={result.dv.key}>
                          <TableCell className="text-sm">{result.dv.label}</TableCell>
                          <TableCell className="text-center font-mono text-sm">{result.levene.W.toFixed(2)}</TableCell>
                          <TableCell className="text-center font-mono text-sm">{formatP(result.levene.pValue)}</TableCell>
                          <TableCell className="text-center">
                            {result.levene.pValue > 0.05 ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Shapiro-Wilk Test (Normality)</CardTitle>
                  <CardDescription>p &gt; .05 suggests normal distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variable</TableHead>
                        <TableHead className="text-center">Formal (p)</TableHead>
                        <TableHead className="text-center">Informal (p)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysisResults.map((result) => (
                        <TableRow key={result.dv.key}>
                          <TableCell className="text-sm">{result.dv.label}</TableCell>
                          <TableCell className="text-center">
                            <span className={`font-mono text-sm ${result.shapiroFormal.isNormal ? 'text-green-600' : 'text-amber-600'}`}>
                              {formatP(result.shapiroFormal.pValue)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-mono text-sm ${result.shapiroInformal.isNormal ? 'text-green-600' : 'text-amber-600'}`}>
                              {formatP(result.shapiroInformal.pValue)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle>Summary for Thesis Write-up</CardTitle>
          </CardHeader>
          <CardContent className="prose dark:prose-invert max-w-none text-sm">
            <h4>RQ1: Main Effects of Formality</h4>
            <ul>
              <li><strong>H1 (Empathy):</strong> {hypothesisResults.find(h => h.hypothesis.id === 'H1')?.summary}</li>
              <li><strong>H2 (Trust):</strong> {hypothesisResults.find(h => h.hypothesis.id === 'H2')?.summary}</li>
              <li><strong>H3 (Intention):</strong> {hypothesisResults.find(h => h.hypothesis.id === 'H3')?.summary}</li>
            </ul>

            <h4>RQ2: Moderation by Prior Experience</h4>
            <p>
              H4 requires moderation analysis with interaction terms. Download the Python or R scripts 
              for complete moderation analysis including voice_assistant_familiarity × condition interactions.
            </p>

            <h4>Exploratory: Godspeed Subscales</h4>
            <p>
              Godspeed subscales (Anthropomorphism, Likeability, Intelligence) were examined as exploratory 
              outcomes. These findings are presented without correction for multiple comparisons and should 
              be interpreted as hypothesis-generating for future research.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StatisticalAnalysis;
