import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ChevronDown, Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ThematicCode {
  call_id: string;
  comfort_score: number | null;
  rapport_level: string | null;
  self_disclosure: boolean | null;
  user_initiated_topics: string[] | null;
  notable_moments: string[] | null;
  overall_conversation_quality: number | null;
  model_used: string | null;
  created_at: string;
}

interface ExperimentResponse {
  call_id: string | null;
  ai_formality_score: number | null;
  assistant_type: string | null;
  feedback_sentiment: string | null;
  feedback_themes: string[] | null;
  feedback_satisfaction_inferred: number | null;
  feedback_condition_perception: string | null;
  voice_assistant_feedback: string | null;
}

interface CallQualitativeMetric {
  call_id: string;
  assistant_type: string | null;
  user_sentiment_mean: number | null;
  sentiment_arc_early: number | null;
  sentiment_arc_mid: number | null;
  sentiment_arc_late: number | null;
  sentiment_positive_pct: number | null;
  sentiment_negative_pct: number | null;
  sentiment_neutral_pct: number | null;
  user_word_count: number | null;
  user_turn_count: number | null;
  user_words_per_turn: number | null;
  speaking_time_ratio: number | null;
  ai_word_count: number | null;
  ai_turn_count: number | null;
  total_duration_ms: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FORMAL_COLOR = "#3b82f6";
const INFORMAL_COLOR = "#f59e0b";

function getCondition(resp: ExperimentResponse): "formal" | "informal" | null {
  if (resp.assistant_type === "formal") return "formal";
  if (resp.assistant_type === "informal") return "informal";
  if (resp.ai_formality_score != null) {
    return resp.ai_formality_score >= 0.5 ? "formal" : "informal";
  }
  return null;
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

function mean(arr: number[]): number | null {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function nullFiltered(arr: (number | null)[]): number[] {
  return arr.filter((v): v is number => v != null);
}

function countBy<T>(arr: T[], key: (item: T) => string): Record<string, number> {
  return arr.reduce<Record<string, number>>((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm font-medium text-foreground mt-1">{label}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function PlaceholderCard({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-32 flex items-center justify-center text-sm text-muted-foreground bg-muted/30 rounded-md">
          No data yet — run the prerequisite script first
        </div>
      </CardContent>
    </Card>
  );
}

function MethodologyPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-dashed">
      <CardHeader
        className="cursor-pointer py-3"
        onClick={() => setOpen((v) => !v)}
      >
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          {title}
          <ChevronDown
            className={`h-4 w-4 ml-auto shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </CardTitle>
      </CardHeader>
      {open && <CardContent className="pt-0 space-y-4">{children}</CardContent>}
    </Card>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="text-xs bg-muted/50 border rounded-md p-3 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
      {children}
    </pre>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function QualitativeAnalysis() {
  const navigate = useNavigate();

  const [codes, setCodes] = useState<ThematicCode[]>([]);
  const [responses, setResponses] = useState<ExperimentResponse[]>([]);
  const [qualMetrics, setQualMetrics] = useState<CallQualitativeMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspectThematicId, setInspectThematicId] = useState<string>("");
  const [inspectFeedbackId, setInspectFeedbackId] = useState<string>("");

  // Fetch data
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [codesRes, respRes, qualRes] = await Promise.all([
          supabase.from("call_thematic_codes").select("*"),
          supabase
            .from("experiment_responses")
            .select(
              "call_id, ai_formality_score, assistant_type, feedback_sentiment, feedback_themes, feedback_satisfaction_inferred, feedback_condition_perception, voice_assistant_feedback",
            )
            .not("call_id", "is", null),
          supabase.from("call_qualitative_metrics").select("*"),
        ]);

        if (codesRes.error) throw new Error(`call_thematic_codes: ${codesRes.error.message}`);
        if (respRes.error) throw new Error(`experiment_responses: ${respRes.error.message}`);

        setCodes((codesRes.data ?? []) as ThematicCode[]);
        setResponses((respRes.data ?? []) as ExperimentResponse[]);
        setQualMetrics((qualRes.data ?? []) as CallQualitativeMetric[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Derived data ─────────────────────────────────────────────────────────

  const responseMap = useMemo(
    () => new Map(responses.map((r) => [r.call_id!, r])),
    [responses],
  );

  // Join codes with condition
  const enriched = useMemo(() => {
    return codes.map((c) => {
      const resp = responseMap.get(c.call_id) ?? null;
      return { ...c, condition: resp ? getCondition(resp) : null, resp };
    });
  }, [codes, responseMap]);

  const formal = enriched.filter((e) => e.condition === "formal");
  const informal = enriched.filter((e) => e.condition === "informal");
  const totalCoded = codes.length;

  // Responses with feedback
  const responsesWithFeedback = responses.filter((r) => r.feedback_sentiment != null);
  const formalFeedback = responsesWithFeedback.filter(
    (r) => getCondition(r) === "formal",
  );
  const informalFeedback = responsesWithFeedback.filter(
    (r) => getCondition(r) === "informal",
  );

  // ── Rapport distribution ────────────────────────────────────────────────
  const rapportData = useMemo(() => {
    const levels = ["cold", "neutral", "warm", "personal"];
    return levels.map((level) => ({
      level: level.charAt(0).toUpperCase() + level.slice(1),
      formal: formal.filter((e) => e.rapport_level === level).length,
      informal: informal.filter((e) => e.rapport_level === level).length,
    }));
  }, [formal, informal]);

  // ── Comfort score distribution ──────────────────────────────────────────
  const comfortData = useMemo(() => {
    return [1, 2, 3, 4, 5].map((score) => ({
      score: String(score),
      formal: formal.filter((e) => e.comfort_score === score).length,
      informal: informal.filter((e) => e.comfort_score === score).length,
    }));
  }, [formal, informal]);

  // ── Avg scores by condition ─────────────────────────────────────────────
  const avgComfortFormal = mean(formal.map((e) => e.comfort_score).filter((v): v is number => v != null));
  const avgComfortInformal = mean(informal.map((e) => e.comfort_score).filter((v): v is number => v != null));
  const avgQualFormal = mean(formal.map((e) => e.overall_conversation_quality).filter((v): v is number => v != null));
  const avgQualInformal = mean(informal.map((e) => e.overall_conversation_quality).filter((v): v is number => v != null));

  const selfDisclosureFormal = formal.length
    ? (formal.filter((e) => e.self_disclosure).length / formal.length) * 100
    : null;
  const selfDisclosureInformal = informal.length
    ? (informal.filter((e) => e.self_disclosure).length / informal.length) * 100
    : null;

  // ── Feedback sentiment distribution ────────────────────────────────────
  const sentimentData = useMemo(() => {
    const sentiments = ["positive", "neutral", "negative"];
    return sentiments.map((s) => ({
      sentiment: s.charAt(0).toUpperCase() + s.slice(1),
      formal: formalFeedback.filter((r) => r.feedback_sentiment === s).length,
      informal: informalFeedback.filter((r) => r.feedback_sentiment === s).length,
    }));
  }, [formalFeedback, informalFeedback]);

  // ── Top feedback themes ─────────────────────────────────────────────────
  const themeData = useMemo(() => {
    const formalThemes = formalFeedback.flatMap((r) => r.feedback_themes ?? []);
    const informalThemes = informalFeedback.flatMap((r) => r.feedback_themes ?? []);

    const formalCounts = countBy(formalThemes, (t) => t);
    const informalCounts = countBy(informalThemes, (t) => t);

    // Union all themes, sort by total frequency
    const allThemes = [...new Set([...formalThemes, ...informalThemes])];
    return allThemes
      .map((theme) => ({
        theme,
        formal: formalCounts[theme] ?? 0,
        informal: informalCounts[theme] ?? 0,
        total: (formalCounts[theme] ?? 0) + (informalCounts[theme] ?? 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [formalFeedback, informalFeedback]);

  // ── Avg scores bar chart data ──────────────────────────────────────────
  const avgScoresData = [
    {
      metric: "Avg Comfort",
      formal: avgComfortFormal != null ? parseFloat(avgComfortFormal.toFixed(2)) : 0,
      informal: avgComfortInformal != null ? parseFloat(avgComfortInformal.toFixed(2)) : 0,
    },
    {
      metric: "Avg Quality",
      formal: avgQualFormal != null ? parseFloat(avgQualFormal.toFixed(2)) : 0,
      informal: avgQualInformal != null ? parseFloat(avgQualInformal.toFixed(2)) : 0,
    },
    {
      metric: "Avg Satisfaction",
      formal: mean(formalFeedback.map((r) => r.feedback_satisfaction_inferred).filter((v): v is number => v != null)) != null
        ? parseFloat((mean(formalFeedback.map((r) => r.feedback_satisfaction_inferred).filter((v): v is number => v != null))!).toFixed(2))
        : 0,
      informal: mean(informalFeedback.map((r) => r.feedback_satisfaction_inferred).filter((v): v is number => v != null)) != null
        ? parseFloat((mean(informalFeedback.map((r) => r.feedback_satisfaction_inferred).filter((v): v is number => v != null))!).toFixed(2))
        : 0,
    },
  ];

  // ── Qualitative metrics — condition split ──────────────────────────────
  const qualEnriched = useMemo(() => {
    return qualMetrics.map((m) => {
      let condition: "formal" | "informal" | null = null;
      if (m.assistant_type === "formal" || m.assistant_type === "informal") {
        condition = m.assistant_type;
      } else {
        const resp = responseMap.get(m.call_id);
        if (resp) condition = getCondition(resp);
      }
      return { ...m, condition };
    });
  }, [qualMetrics, responseMap]);

  const qualFormal = qualEnriched.filter((m) => m.condition === "formal");
  const qualInformal = qualEnriched.filter((m) => m.condition === "informal");

  const sentimentArcData = useMemo(() => [
    {
      period: "Early",
      formal: mean(nullFiltered(qualFormal.map((m) => m.sentiment_arc_early))),
      informal: mean(nullFiltered(qualInformal.map((m) => m.sentiment_arc_early))),
    },
    {
      period: "Mid",
      formal: mean(nullFiltered(qualFormal.map((m) => m.sentiment_arc_mid))),
      informal: mean(nullFiltered(qualInformal.map((m) => m.sentiment_arc_mid))),
    },
    {
      period: "Late",
      formal: mean(nullFiltered(qualFormal.map((m) => m.sentiment_arc_late))),
      informal: mean(nullFiltered(qualInformal.map((m) => m.sentiment_arc_late))),
    },
  ], [qualFormal, qualInformal]);

  const engagementData = useMemo(() => [
    {
      metric: "Words / Turn",
      formal: mean(nullFiltered(qualFormal.map((m) => m.user_words_per_turn))),
      informal: mean(nullFiltered(qualInformal.map((m) => m.user_words_per_turn))),
    },
    {
      metric: "User Turns",
      formal: mean(nullFiltered(qualFormal.map((m) => m.user_turn_count))),
      informal: mean(nullFiltered(qualInformal.map((m) => m.user_turn_count))),
    },
    {
      metric: "AI Turns",
      formal: mean(nullFiltered(qualFormal.map((m) => m.ai_turn_count))),
      informal: mean(nullFiltered(qualInformal.map((m) => m.ai_turn_count))),
    },
  ], [qualFormal, qualInformal]);

  const speakingRatioData = useMemo(() => [
    { condition: "Formal", ratio: mean(nullFiltered(qualFormal.map((m) => m.speaking_time_ratio))) },
    { condition: "Informal", ratio: mean(nullFiltered(qualInformal.map((m) => m.speaking_time_ratio))) },
  ], [qualFormal, qualInformal]);

  const hasQualMetrics = qualFormal.length > 0 || qualInformal.length > 0;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/researcher/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Dashboard
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Qualitative Analysis</h1>
            <p className="text-sm text-muted-foreground">
              Thematic coding · Sentiment · Engagement · Feedback themes
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Error */}
        {error && (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="pt-6 text-destructive text-sm">
              <strong>Error loading data:</strong> {error}
              {error.includes("does not exist") && (
                <p className="mt-1 text-muted-foreground">
                  Run the SQL setup in Lovable first — see docs/qualitative-research-plan.md
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Overview cards */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Overview</h2>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Calls coded" value={totalCoded} sub="via OpenAI thematic coding" />
              <StatCard label="Formal coded" value={formal.length} sub={`${informalFeedback.length} feedback coded`} />
              <StatCard label="Informal coded" value={informal.length} sub={`${formalFeedback.length} feedback coded`} />
              <StatCard
                label="Self-disclosure rate"
                value={
                  selfDisclosureInformal != null
                    ? `${selfDisclosureInformal.toFixed(0)}% informal`
                    : "–"
                }
                sub={
                  selfDisclosureFormal != null
                    ? `${selfDisclosureFormal.toFixed(0)}% formal`
                    : undefined
                }
              />
            </div>
          )}
        </section>

        {/* Tabs */}
        <Tabs defaultValue="thematic">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="thematic">Thematic Codes</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
            <TabsTrigger value="sentiment-arc">Sentiment Arc</TabsTrigger>
            <TabsTrigger value="engagement">Engagement</TabsTrigger>
          </TabsList>

          {/* ── Tab: Thematic Codes ───────────────────────────────────────── */}
          <TabsContent value="thematic" className="space-y-6 mt-6">
            {loading ? (
              <Skeleton className="h-64" />
            ) : totalCoded === 0 ? (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  No thematic codes yet. Click "Code missing themes" in the Researcher Dashboard.
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Avg scores summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Average Scores by Condition</CardTitle>
                    <CardDescription>Comfort (1–5), conversation quality (1–5), inferred satisfaction (1–5)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={avgScoresData} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="metric" />
                        <YAxis domain={[0, 5]} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="formal" name="Formal" fill={FORMAL_COLOR} />
                        <Bar dataKey="informal" name="Informal" fill={INFORMAL_COLOR} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Rapport distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Rapport Level Distribution</CardTitle>
                    <CardDescription>LLM-coded quality of connection between user and assistant</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={rapportData} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="level" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="formal" name="Formal" fill={FORMAL_COLOR} />
                        <Bar dataKey="informal" name="Informal" fill={INFORMAL_COLOR} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Comfort score distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Comfort Score Distribution</CardTitle>
                    <CardDescription>1 = very uncomfortable · 5 = very comfortable</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={comfortData} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="score" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="formal" name="Formal" fill={FORMAL_COLOR} />
                        <Bar dataKey="informal" name="Informal" fill={INFORMAL_COLOR} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Notable moments */}
                {enriched.some((e) => (e.notable_moments?.length ?? 0) > 0) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Notable Moments</CardTitle>
                      <CardDescription>LLM-identified memorable exchanges (humor, vulnerability, confusion, etc.)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {enriched
                          .filter((e) => (e.notable_moments?.length ?? 0) > 0)
                          .flatMap((e) =>
                            (e.notable_moments ?? []).map((moment, i) => (
                              <div key={`${e.call_id}-${i}`} className="flex items-start gap-2 text-sm">
                                <Badge variant={e.condition === "formal" ? "default" : "secondary"} className="mt-0.5 shrink-0 text-xs">
                                  {e.condition ?? "?"}
                                </Badge>
                                <span>{moment}</span>
                              </div>
                            )),
                          )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Methodology panel */}
                <MethodologyPanel title="How this was coded — Pass A: Transcript analysis (gpt-4o-mini)">
                  <p className="text-sm text-muted-foreground">
                    Each completed call transcript was formatted as a speaker-labelled dialogue
                    (<code className="text-xs">AI: …</code> / <code className="text-xs">User: …</code>)
                    and sent to <strong>gpt-4o-mini</strong> with the system prompt below.
                    The model was required to return a strict JSON object; the result was validated
                    and upserted into <code className="text-xs">call_thematic_codes</code>.
                  </p>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">System prompt (Pass A)</p>
                    <CodeBlock>{`You are a qualitative researcher coding voice conversation transcripts.
Analyze the conversation and return ONLY valid JSON matching this schema exactly:

{
  "comfort_score": <integer 1-5>,
  "rapport_level": "<cold|neutral|warm|personal>",
  "self_disclosure": <true|false>,
  "user_initiated_topics": ["<topic>", ...],
  "notable_moments": ["<brief description>", ...],
  "overall_conversation_quality": <integer 1-5>
}

Definitions:
- comfort_score: How comfortable the user seemed overall (1=very uncomfortable, 5=very comfortable)
- rapport_level: Quality of connection between user and AI
  - cold: Purely transactional, minimal engagement
  - neutral: Polite but no warmth
  - warm: Friendly exchanges, some personal engagement
  - personal: User shared personal info or emotional content
- self_disclosure: true if user voluntarily shared personal information, feelings, or experiences
- user_initiated_topics: Topics the user brought up (not AI-prompted); include 0-5 items
- notable_moments: Any memorable exchanges — humor, vulnerability, disagreement, confusion; include 0-3 items
- overall_conversation_quality: Overall quality of the conversation (1=poor, 5=excellent)

Return ONLY the JSON object. No explanation.`}</CodeBlock>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Illustrative example</p>
                    <p className="text-xs text-muted-foreground mb-1">Input transcript sent as user message:</p>
                    <CodeBlock>{`Conversation transcript:

AI: Hi! How are you doing today?
User: Good thanks, a bit tired actually.
AI: Sorry to hear that — what's been keeping you busy?
User: Just work mostly. I've been stressed about a deadline.
AI: That sounds tough. Do you find it easy to switch off after work?
User: Not really. I tend to overthink things.`}</CodeBlock>
                    <p className="text-xs text-muted-foreground mt-2 mb-1">LLM output (parsed and stored):</p>
                    <CodeBlock>{`{
  "comfort_score": 4,
  "rapport_level": "warm",
  "self_disclosure": true,
  "user_initiated_topics": [],
  "notable_moments": ["User volunteered stress about work deadline", "Admitted difficulty switching off"],
  "overall_conversation_quality": 4
}`}</CodeBlock>
                  </div>

                  {codes.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Inspect a real coded call</p>
                      <Select value={inspectThematicId} onValueChange={setInspectThematicId}>
                        <SelectTrigger className="w-full text-xs">
                          <SelectValue placeholder="Select a call ID to inspect…" />
                        </SelectTrigger>
                        <SelectContent>
                          {codes.map((c) => (
                            <SelectItem key={c.call_id} value={c.call_id} className="text-xs font-mono">
                              {c.call_id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {inspectThematicId && (() => {
                        const row = codes.find((c) => c.call_id === inspectThematicId);
                        return row ? (
                          <CodeBlock>{JSON.stringify(row, null, 2)}</CodeBlock>
                        ) : null;
                      })()}
                    </div>
                  )}
                </MethodologyPanel>
              </>
            )}
          </TabsContent>

          {/* ── Tab: Feedback ─────────────────────────────────────────────── */}
          <TabsContent value="feedback" className="space-y-6 mt-6">
            {loading ? (
              <Skeleton className="h-64" />
            ) : responsesWithFeedback.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  No feedback coded yet. The "Code missing themes" button will populate this.
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Sentiment distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Feedback Sentiment by Condition</CardTitle>
                    <CardDescription>Overall emotional tone inferred from participant open-ended feedback</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={sentimentData} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="sentiment" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="formal" name="Formal" fill={FORMAL_COLOR} />
                        <Bar dataKey="informal" name="Informal" fill={INFORMAL_COLOR} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Theme bar chart */}
                {themeData.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Top Feedback Themes by Condition</CardTitle>
                      <CardDescription>Frequency of each theme across participant feedback — formal vs. informal</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={Math.max(300, themeData.length * 28)}>
                        <BarChart data={themeData} layout="vertical" barGap={2}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" allowDecimals={false} />
                          <YAxis type="category" dataKey="theme" width={120} tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="formal" name="Formal" fill={FORMAL_COLOR} />
                          <Bar dataKey="informal" name="Informal" fill={INFORMAL_COLOR} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Condition perception excerpts */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">How Participants Described the Assistant</CardTitle>
                    <CardDescription>LLM-summarised condition perception from feedback</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                      {responses
                        .filter((r) => r.feedback_condition_perception && r.feedback_condition_perception !== "insufficient feedback")
                        .map((r, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm border-b pb-2 last:border-0">
                            <Badge
                              variant={getCondition(r) === "formal" ? "default" : "secondary"}
                              className="mt-0.5 shrink-0 text-xs"
                            >
                              {getCondition(r) ?? "?"}
                            </Badge>
                            <span className="text-muted-foreground">{r.feedback_condition_perception}</span>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Methodology panel */}
                <MethodologyPanel title="How this was coded — Pass B: Feedback analysis (gpt-4o-mini)">
                  <p className="text-sm text-muted-foreground">
                    Three open-ended feedback fields per participant (<code className="text-xs">voice_assistant_feedback</code>,{" "}
                    <code className="text-xs">communication_style_feedback</code>,{" "}
                    <code className="text-xs">experiment_feedback</code>) were concatenated
                    (separated by <code className="text-xs">---</code>) and sent to <strong>gpt-4o-mini</strong>.
                    The model returned 4 structured fields which were written back to <code className="text-xs">experiment_responses</code>.
                  </p>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">System prompt (Pass B)</p>
                    <CodeBlock>{`You are a qualitative researcher coding participant feedback about a voice AI assistant.
Analyze the feedback and return ONLY valid JSON matching this schema exactly:

{
  "feedback_sentiment": "<positive|neutral|negative>",
  "feedback_themes": ["<theme>", ...],
  "feedback_satisfaction_inferred": <integer 1-5>,
  "feedback_condition_perception": "<brief description of how they describe the assistant's style>"
}

Definitions:
- feedback_sentiment: Overall emotional tone of the feedback
- feedback_themes: Key themes mentioned (max 8). Use short labels like:
  "natural", "robotic", "helpful", "unhelpful", "friendly", "formal", "informal",
  "clear", "confusing", "repetitive", "engaging", "boring", "privacy concern",
  "trustworthy", "untrustworthy", "empathetic", "cold"
  (add new labels if needed, keep them short and consistent)
- feedback_satisfaction_inferred: Inferred satisfaction (1=very dissatisfied, 5=very satisfied)
- feedback_condition_perception: 1-2 sentences describing how they perceived the assistant's style/personality

If feedback is empty or too short to code, return:
{ "feedback_sentiment": "neutral", "feedback_themes": [], "feedback_satisfaction_inferred": 3, "feedback_condition_perception": "insufficient feedback" }

Return ONLY the JSON object. No explanation.`}</CodeBlock>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Illustrative example</p>
                    <p className="text-xs text-muted-foreground mb-1">Input (combined feedback fields):</p>
                    <CodeBlock>{`Participant feedback:

The assistant felt very natural and warm. It remembered context well.

---

I liked that it wasn't overly formal. It felt like talking to a real person.

---

Good experience overall. Would use it again.`}</CodeBlock>
                    <p className="text-xs text-muted-foreground mt-2 mb-1">LLM output (parsed and stored):</p>
                    <CodeBlock>{`{
  "feedback_sentiment": "positive",
  "feedback_themes": ["natural", "warm", "friendly", "informal", "engaging"],
  "feedback_satisfaction_inferred": 4,
  "feedback_condition_perception": "Participant perceived the assistant as warm and conversational, noting its informal and natural communication style."
}`}</CodeBlock>
                  </div>

                  {responsesWithFeedback.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Inspect a real coded call</p>
                      <Select value={inspectFeedbackId} onValueChange={setInspectFeedbackId}>
                        <SelectTrigger className="w-full text-xs">
                          <SelectValue placeholder="Select a call ID to inspect…" />
                        </SelectTrigger>
                        <SelectContent>
                          {responsesWithFeedback.map((r) => (
                            <SelectItem key={r.call_id!} value={r.call_id!} className="text-xs font-mono">
                              {r.call_id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {inspectFeedbackId && (() => {
                        const row = responsesWithFeedback.find((r) => r.call_id === inspectFeedbackId);
                        if (!row) return null;
                        const display = {
                          call_id: row.call_id,
                          condition: getCondition(row),
                          voice_assistant_feedback: row.voice_assistant_feedback,
                          "— coded output —": null,
                          feedback_sentiment: row.feedback_sentiment,
                          feedback_themes: row.feedback_themes,
                          feedback_satisfaction_inferred: row.feedback_satisfaction_inferred,
                          feedback_condition_perception: row.feedback_condition_perception,
                        };
                        return <CodeBlock>{JSON.stringify(display, null, 2)}</CodeBlock>;
                      })()}
                    </div>
                  )}
                </MethodologyPanel>
              </>
            )}
          </TabsContent>

          {/* ── Tab: Sentiment Arc ────────────────────────────────────────── */}
          <TabsContent value="sentiment-arc" className="space-y-6 mt-6">
            {!hasQualMetrics ? (
              <PlaceholderCard
                title="Sentiment Arc (early / mid / late)"
                description="No data yet. Use the 'Compute metrics' button in Researcher Dashboard → Responses → Advanced."
              />
            ) : (
              <>
                {/* Stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard
                    label="Formal — mean sentiment"
                    value={mean(nullFiltered(qualFormal.map((m) => m.user_sentiment_mean)))?.toFixed(3) ?? "—"}
                    sub={`n=${qualFormal.length}`}
                  />
                  <StatCard
                    label="Informal — mean sentiment"
                    value={mean(nullFiltered(qualInformal.map((m) => m.user_sentiment_mean)))?.toFixed(3) ?? "—"}
                    sub={`n=${qualInformal.length}`}
                  />
                  <StatCard
                    label="Formal — positive %"
                    value={(() => { const v = mean(nullFiltered(qualFormal.map((m) => m.sentiment_positive_pct))); return v != null ? `${(v * 100).toFixed(0)}%` : "—"; })()}
                  />
                  <StatCard
                    label="Informal — positive %"
                    value={(() => { const v = mean(nullFiltered(qualInformal.map((m) => m.sentiment_positive_pct))); return v != null ? `${(v * 100).toFixed(0)}%` : "—"; })()}
                  />
                </div>

                {/* Arc bar chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Sentiment Arc (early / mid / late)</CardTitle>
                    <CardDescription>
                      Mean sentiment score per arc period by condition (−1 = negative · 0 = neutral · +1 = positive).
                      Based on {qualFormal.length + qualInformal.length} calls.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={sentimentArcData} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="period" />
                        <YAxis domain={[-1, 1]} tickCount={5} tickFormatter={(v) => v.toFixed(1)} />
                        <Tooltip formatter={(v: number) => v?.toFixed(3) ?? "—"} />
                        <Legend />
                        <Bar dataKey="formal" name="Formal" fill={FORMAL_COLOR} />
                        <Bar dataKey="informal" name="Informal" fill={INFORMAL_COLOR} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </>
            )}
            <MethodologyPanel title="How sentiment is computed — AssemblyAI + compute-qualitative-metrics edge function">
              <p className="text-sm text-muted-foreground">
                AssemblyAI labels each utterance as <code className="text-xs">POSITIVE</code>,{" "}
                <code className="text-xs">NEUTRAL</code>, or <code className="text-xs">NEGATIVE</code> when{" "}
                <code className="text-xs">sentiment_analysis: true</code> is enabled.
                These labels are stored in <code className="text-xs">call_transcriptions_assemblyai.utterances[]</code>.
                The <strong>compute-qualitative-metrics</strong> edge function reads those utterances and derives
                numeric scores and arc features — no external API call is made.
              </p>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Speaker mapping</p>
                <p className="text-sm text-muted-foreground">
                  AssemblyAI labels speakers in order of first appearance.
                  In Vapi calls the AI greets first, so <strong>Speaker A = AI</strong> and{" "}
                  <strong>Speaker B = User</strong>. Only user utterances are used for sentiment scoring.
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Score mapping</p>
                <CodeBlock>{`function sentimentToScore(sentiment) {
  if (sentiment === "POSITIVE") return  1;
  if (sentiment === "NEGATIVE") return -1;
  return 0; // NEUTRAL or unknown
}`}</CodeBlock>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Sentiment arc computation</p>
                <p className="text-xs text-muted-foreground mb-1">
                  User utterances are split into thirds; the mean score of each third gives
                  the early / mid / late arc values stored in <code className="text-xs">call_qualitative_metrics</code>.
                </p>
                <CodeBlock>{`// Collect per-utterance sentiment scores for user turns only
const userSentimentScores = userUtterances
  .filter((u) => u.sentiment)
  .map((u) => sentimentToScore(u.sentiment));

// Split into thirds
const third = Math.ceil(userSentimentScores.length / 3) || 1;
const early = userSentimentScores.slice(0, third);
const mid   = userSentimentScores.slice(third, third * 2);
const late  = userSentimentScores.slice(third * 2);

// Mean of each third  (-1 to +1)
const sentimentArcEarly = mean(early);   // stored as sentiment_arc_early
const sentimentArcMid   = mean(mid);     // stored as sentiment_arc_mid
const sentimentArcLate  = mean(late);    // stored as sentiment_arc_late`}</CodeBlock>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Additional sentiment fields stored</p>
                <CodeBlock>{`user_sentiment_mean      // mean score across all user turns
user_sentiment_std       // standard deviation of per-turn scores
sentiment_positive_pct   // fraction of turns labelled POSITIVE
sentiment_negative_pct   // fraction of turns labelled NEGATIVE
sentiment_neutral_pct    // fraction of turns labelled NEUTRAL`}</CodeBlock>
              </div>
            </MethodologyPanel>
          </TabsContent>

          {/* ── Tab: Engagement ──────────────────────────────────────────── */}
          <TabsContent value="engagement" className="space-y-6 mt-6">
            {!hasQualMetrics ? (
              <PlaceholderCard
                title="Word Count & Turn Count by Condition"
                description="No data yet. Use the 'Compute metrics' button in Researcher Dashboard → Responses → Advanced."
              />
            ) : (
              <>
                {/* Engagement bar chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Word Count & Turn Count by Condition</CardTitle>
                    <CardDescription>
                      Mean per-call values across {qualFormal.length + qualInformal.length} calls.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={engagementData} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="metric" />
                        <YAxis tickFormatter={(v) => v.toFixed(1)} />
                        <Tooltip formatter={(v: number) => v?.toFixed(2) ?? "—"} />
                        <Legend />
                        <Bar dataKey="formal" name="Formal" fill={FORMAL_COLOR} />
                        <Bar dataKey="informal" name="Informal" fill={INFORMAL_COLOR} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Speaking time ratio */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Speaking Time Ratio</CardTitle>
                    <CardDescription>
                      Mean proportion of total words spoken by the user (user words / total words), by condition.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={speakingRatioData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="condition" />
                        <YAxis domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                        <Tooltip formatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
                        <Bar dataKey="ratio" name="User word ratio">
                          {speakingRatioData.map((entry, i) => (
                            <Cell key={i} fill={entry.condition === "Formal" ? FORMAL_COLOR : INFORMAL_COLOR} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <PlaceholderCard
                  title="Correlation Matrix"
                  description="Transcript features ↔ survey scores (PETS-ER, TIAS, opt-in). Requires full dataset merge."
                />
              </>
            )}
            <MethodologyPanel title="How engagement metrics are computed — compute-qualitative-metrics edge function">
              <p className="text-sm text-muted-foreground">
                Engagement metrics are derived <strong>purely from AssemblyAI utterance data</strong> —
                no external API is called. The edge function reads <code className="text-xs">call_transcriptions_assemblyai.utterances[]</code>
                (each entry has <code className="text-xs">speaker</code>, <code className="text-xs">text</code>,{" "}
                <code className="text-xs">start</code>, and <code className="text-xs">end</code> in milliseconds)
                and computes the metrics below, writing them to <code className="text-xs">call_qualitative_metrics</code>.
              </p>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Metrics computed</p>
                <CodeBlock>{`user_word_count        // total words spoken by user (split on whitespace)
user_turn_count        // number of user utterance segments
user_words_per_turn    // user_word_count / user_turn_count
user_speaking_time_ms  // sum of (end - start) for all user utterances
speaking_time_ratio    // user words / (user + AI words)
ai_word_count          // total words spoken by AI
ai_turn_count          // number of AI utterance segments
total_duration_ms      // full audio duration from AssemblyAI`}</CodeBlock>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Word count &amp; speaking time code</p>
                <CodeBlock>{`function wordCount(text) {
  return (text ?? "").trim().split(/\\s+/).filter(Boolean).length;
}

// Sum words across all user utterances
const userWordCount = userUtterances.reduce(
  (acc, u) => acc + wordCount(u.text), 0
);

// Sum speaking time (milliseconds) from utterance timestamps
const userSpeakingTimeMs = userUtterances.reduce((acc, u) => {
  const duration = (u.end ?? 0) - (u.start ?? 0);
  return acc + (duration > 0 ? duration : 0);
}, 0);

// Proportion of total words the user spoke
const totalWords = userWordCount + aiWordCount;
const speakingTimeRatio = totalWords > 0 ? userWordCount / totalWords : null;`}</CodeBlock>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Speaker mapping (same as sentiment)</p>
                <p className="text-sm text-muted-foreground">
                  AssemblyAI assigns <strong>Speaker A = AI</strong> (greets first in Vapi) and{" "}
                  <strong>Speaker B = User</strong>. The script separates utterances by speaker before
                  computing user vs. AI metrics.
                </p>
              </div>
            </MethodologyPanel>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
