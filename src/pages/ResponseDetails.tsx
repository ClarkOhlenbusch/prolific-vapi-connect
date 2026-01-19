import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  ChevronDown
} from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

type Demographics = Tables<'demographics'>;

interface ExperimentResponseWithDemographics extends Tables<'experiment_responses'> {
  demographics?: Demographics | null;
}

// Question definitions
const PETS_ITEMS = [
  { id: "E1", text: "Cali considered my mental state.", key: "e1", subscale: "Empathy" },
  { id: "E2", text: "Cali seemed emotionally intelligent.", key: "e2", subscale: "Empathy" },
  { id: "E3", text: "Cali expressed emotions.", key: "e3", subscale: "Empathy" },
  { id: "E4", text: "Cali sympathized with me.", key: "e4", subscale: "Empathy" },
  { id: "E5", text: "Cali showed interest in me.", key: "e5", subscale: "Empathy" },
  { id: "E6", text: "Cali supported me in coping with an emotional situation.", key: "e6", subscale: "Empathy" },
  { id: "U1", text: "Cali understood my goals.", key: "u1", subscale: "Utilitarian" },
  { id: "U2", text: "Cali understood my needs.", key: "u2", subscale: "Utilitarian" },
  { id: "U3", text: "I trusted Cali.", key: "u3", subscale: "Utilitarian" },
  { id: "U4", text: "Cali understood my intentions.", key: "u4", subscale: "Utilitarian" },
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

// Section navigation items - in experiment flow order
const SECTIONS = [
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
  const [data, setData] = useState<ExperimentResponseWithDemographics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formalityCalcId, setFormalityCalcId] = useState<string | null>(null);
  const sectionRefs = useRef<{ [key: string]: HTMLElement | null }>({});

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      
      setIsLoading(true);
      try {
        // Fetch experiment response
        const { data: response, error: responseError } = await supabase
          .from('experiment_responses')
          .select('*')
          .eq('id', id)
          .single();

        if (responseError) throw responseError;
        if (!response) throw new Error('Response not found');

        // Fetch demographics
        const { data: demographics } = await supabase
          .from('demographics')
          .select('*')
          .eq('prolific_id', response.prolific_id)
          .maybeSingle();

        // Fetch formality calculation if exists
        const { data: formalityCalc } = await supabase
          .from('formality_calculations')
          .select('id')
          .eq('linked_call_id', response.call_id)
          .maybeSingle();

        setData({ ...response, demographics });
        setFormalityCalcId(formalityCalc?.id || null);
      } catch (err) {
        console.error('Error fetching response details:', err);
        setError('Failed to load response details');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id]);

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
      <div className="border-b bg-card/50 sticky top-0 z-10">
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
              {data.assistant_type && (
                <Badge variant={data.assistant_type === 'formal' ? 'default' : 'secondary'}>
                  {data.assistant_type}
                </Badge>
              )}
              {data.batch_label && (
                <Badge variant="outline">{data.batch_label}</Badge>
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
                <p className="text-sm">{data.call_attempt_number}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">PETS Total</label>
                <p className="text-sm font-semibold">{formatNumber(data.pets_total)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

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
              {data.demographics ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Age</label>
                    <p className="font-medium">{data.demographics.age}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Gender</label>
                    <p className="font-medium">{data.demographics.gender}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Native English Speaker</label>
                    <p className="font-medium">{data.demographics.native_english}</p>
                  </div>
                  <div className="col-span-2 md:col-span-3">
                    <label className="text-sm text-muted-foreground">Ethnicity</label>
                    <p className="font-medium">
                      {Array.isArray(data.demographics.ethnicity) 
                        ? (data.demographics.ethnicity as string[]).join(', ')
                        : String(data.demographics.ethnicity)}
                    </p>
                  </div>
                  {data.demographics.voice_assistant_familiarity !== null && (
                    <div>
                      <label className="text-sm text-muted-foreground">Voice Assistant Familiarity</label>
                      <p className="font-medium">
                        {formatWholeNumber(data.demographics.voice_assistant_familiarity)} - {FAMILIARITY_LABELS[data.demographics.voice_assistant_familiarity] || "Unknown"}
                      </p>
                    </div>
                  )}
                  {data.demographics.voice_assistant_usage_frequency !== null && (
                    <div>
                      <label className="text-sm text-muted-foreground">Voice Assistant Usage Frequency</label>
                      <p className="font-medium">
                        {formatWholeNumber(data.demographics.voice_assistant_usage_frequency)} - {USAGE_FREQUENCY_LABELS[data.demographics.voice_assistant_usage_frequency] || "Unknown"}
                      </p>
                    </div>
                  )}
                </div>
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
                {data.attention_check_1 !== null && (
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
                {data.tias_attention_check_1 !== null && (
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
                {data.godspeed_attention_check_1 !== null && (
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
                {data.tipi_attention_check_1 !== null && (
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

                {data.attention_check_1 === null && data.tias_attention_check_1 === null && data.godspeed_attention_check_1 === null && data.tipi_attention_check_1 === null && (
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
                {data.ai_formality_score !== null ? (
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
                  <span className="text-muted-foreground">ER (Empathy):</span>
                  <span className="ml-1 font-semibold">{formatNumber(data.pets_er)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">UT (Utilitarian):</span>
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
                      {position !== null && (
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
                      {position !== null && (
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
                        {position !== null && (
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
                        {position !== null && (
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
                        {position !== null && (
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
                      {position !== null && (
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
              <div>
                <label className="text-sm font-medium text-muted-foreground">Voice Assistant Feedback</label>
                <p className="mt-1 p-3 bg-muted/50 rounded-lg text-sm">
                  {data.voice_assistant_feedback || <span className="italic text-muted-foreground">No feedback provided</span>}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Communication Style Feedback</label>
                <p className="mt-1 p-3 bg-muted/50 rounded-lg text-sm">
                  {data.communication_style_feedback || <span className="italic text-muted-foreground">No feedback provided</span>}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Experiment Feedback</label>
                <p className="mt-1 p-3 bg-muted/50 rounded-lg text-sm">
                  {data.experiment_feedback || <span className="italic text-muted-foreground">No feedback provided</span>}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
};

export default ResponseDetails;
