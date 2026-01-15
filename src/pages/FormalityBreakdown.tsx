import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Calendar, Hash, Link as LinkIcon, User, Info, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import type { FScoreCategory } from '@/lib/formality-calculator';

interface TokenData {
  token: string;
  posTag: string;
  category: FScoreCategory | null;
}

interface CategoryData {
  nouns: { count: number; percentage: number };
  adjectives: { count: number; percentage: number };
  prepositions: { count: number; percentage: number };
  articles: { count: number; percentage: number };
  pronouns: { count: number; percentage: number };
  verbs: { count: number; percentage: number };
  adverbs: { count: number; percentage: number };
  interjections: { count: number; percentage: number };
}

interface FormulaBreakdown {
  nounPct: number;
  adjPct: number;
  prepPct: number;
  artPct: number;
  pronPct: number;
  verbPct: number;
  advPct: number;
  intjPct: number;
  intermediateSum: number;
}

interface CalculationData {
  id: string;
  created_at: string;
  f_score: number;
  total_tokens: number;
  interpretation: string;
  interpretation_label: string;
  linked_call_id: string | null;
  linked_prolific_id: string | null;
  original_transcript: string;
  tokens_data: TokenData[] | null;
  category_data: CategoryData;
  formula_breakdown: FormulaBreakdown;
  ai_only_mode: boolean;
  per_turn_mode: boolean;
  batch_name: string | null;
  notes: string | null;
}

// Color mappings for categories
const CATEGORY_COLORS: Record<FScoreCategory, { bg: string; text: string; label: string; effect: '+' | '-' }> = {
  noun: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-300', label: 'Noun', effect: '+' },
  adjective: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-800 dark:text-emerald-300', label: 'Adjective', effect: '+' },
  preposition: { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-800 dark:text-teal-300', label: 'Preposition', effect: '+' },
  article: { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-800 dark:text-cyan-300', label: 'Article', effect: '+' },
  pronoun: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-300', label: 'Pronoun', effect: '-' },
  verb: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-800 dark:text-orange-300', label: 'Verb', effect: '-' },
  adverb: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-800 dark:text-amber-300', label: 'Adverb', effect: '-' },
  interjection: { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-800 dark:text-rose-300', label: 'Interjection', effect: '-' },
};

const NEUTRAL_COLOR = { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' };

// Unified color scheme: Blue for formal, Amber for informal
const getFormalityColor = (type: 'formal' | 'informal' | 'neutral') => {
  switch (type) {
    case 'formal': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-300';
    case 'informal': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300';
    case 'neutral': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300';
  }
};

const getFScoreType = (score: number): 'formal' | 'informal' | 'neutral' => {
  if (score >= 50) return 'formal';
  return 'informal';
};

function getInterpretationColor(interpretation: string): string {
  switch (interpretation) {
    case 'very-informal':
    case 'conversational':
      return getFormalityColor('informal');
    case 'moderately-formal':
    case 'highly-formal':
      return getFormalityColor('formal');
    default:
      return getFormalityColor('neutral');
  }
}

export default function FormalityBreakdown() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<CalculationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCategories, setVisibleCategories] = useState<Set<FScoreCategory | 'neutral'>>(
    new Set(['noun', 'adjective', 'preposition', 'article', 'pronoun', 'verb', 'adverb', 'interjection', 'neutral'])
  );
  const [showTokenTable, setShowTokenTable] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) {
        setError('No calculation ID provided');
        setLoading(false);
        return;
      }

      try {
        const { data: calcData, error: fetchError } = await supabase
          .from('formality_calculations')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchError) throw fetchError;
        if (!calcData) throw new Error('Calculation not found');

        setData({
          ...calcData,
          tokens_data: calcData.tokens_data as unknown as TokenData[] | null,
          category_data: calcData.category_data as unknown as CategoryData,
          formula_breakdown: calcData.formula_breakdown as unknown as FormulaBreakdown,
        });
      } catch (err) {
        console.error('Error fetching calculation:', err);
        setError(err instanceof Error ? err.message : 'Failed to load calculation');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const toggleCategory = (category: FScoreCategory | 'neutral') => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const renderColoredTranscript = () => {
    if (!data?.tokens_data || data.tokens_data.length === 0) {
      return (
        <div className="p-4 bg-muted rounded-lg">
          <p className="text-muted-foreground italic">
            Token-level data not available for this calculation. This may be an older calculation 
            or one processed without token storage enabled.
          </p>
          <Separator className="my-4" />
          <p className="text-sm">Original transcript:</p>
          <p className="mt-2 whitespace-pre-wrap">{data?.original_transcript}</p>
        </div>
      );
    }

    return (
      <div className="p-4 bg-muted/50 rounded-lg leading-relaxed">
        {data.tokens_data.map((token, idx) => {
          const category = token.category;
          const colorInfo = category ? CATEGORY_COLORS[category] : null;
          const isVisible = category 
            ? visibleCategories.has(category) 
            : visibleCategories.has('neutral');

          if (!isVisible) {
            return (
              <span key={idx} className="opacity-20">
                {token.token}{' '}
              </span>
            );
          }

          return (
            <Tooltip key={idx}>
              <TooltipTrigger asChild>
                <span
                  className={`inline-block px-1 py-0.5 rounded cursor-help mx-0.5 ${
                    colorInfo ? `${colorInfo.bg} ${colorInfo.text}` : `${NEUTRAL_COLOR.bg} ${NEUTRAL_COLOR.text}`
                  }`}
                >
                  {token.token}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="space-y-1 text-sm">
                  <p><strong>Token:</strong> {token.token}</p>
                  <p><strong>POS Tag:</strong> {token.posTag}</p>
                  <p><strong>Category:</strong> {colorInfo ? colorInfo.label : 'Not counted'}</p>
                  {colorInfo && (
                    <p>
                      <strong>Effect:</strong>{' '}
                      <span className={colorInfo.effect === '+' ? 'text-green-600' : 'text-red-600'}>
                        {colorInfo.effect === '+' ? 'Increases' : 'Decreases'} formality
                      </span>
                    </p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    );
  };

  const renderInsights = () => {
    if (!data) return null;

    const { category_data } = data;
    const insights: { message: string; type: 'positive' | 'negative' | 'neutral' }[] = [];

    // Analyze the biggest contributors
    if (category_data.verbs.percentage > 25) {
      insights.push({
        message: `High verb usage (${category_data.verbs.percentage.toFixed(1)}%) is lowering the score significantly`,
        type: 'negative',
      });
    }
    if (category_data.pronouns.percentage > 12) {
      insights.push({
        message: `Pronoun-heavy text (${category_data.pronouns.percentage.toFixed(1)}%) indicates conversational style`,
        type: 'negative',
      });
    }
    if (category_data.nouns.percentage < 15) {
      insights.push({
        message: `Low noun percentage (${category_data.nouns.percentage.toFixed(1)}%) compared to formal writing`,
        type: 'neutral',
      });
    }
    if (category_data.nouns.percentage > 25) {
      insights.push({
        message: `High noun density (${category_data.nouns.percentage.toFixed(1)}%) contributes to formal tone`,
        type: 'positive',
      });
    }
    if (category_data.adjectives.percentage > 10) {
      insights.push({
        message: `Good adjective usage (${category_data.adjectives.percentage.toFixed(1)}%) adds formality`,
        type: 'positive',
      });
    }
    if (category_data.interjections.percentage > 2) {
      insights.push({
        message: `Interjections present (${category_data.interjections.percentage.toFixed(1)}%) - typical of informal speech`,
        type: 'negative',
      });
    }

    if (insights.length === 0) {
      insights.push({
        message: 'The text shows a balanced distribution of word categories',
        type: 'neutral',
      });
    }

    return (
      <div className="space-y-2">
        {insights.map((insight, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
              insight.type === 'positive'
                ? 'bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300'
                : insight.type === 'negative'
                ? 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300'
                : 'bg-gray-50 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300'
            }`}
          >
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{insight.message}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error || 'Calculation not found'}</p>
        <Button variant="outline" onClick={() => navigate('/researcher/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const { formula_breakdown: fb, category_data: cd } = data;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/researcher/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">F-Score Breakdown</h1>
            <p className="text-muted-foreground">Detailed analysis of formality calculation</p>
          </div>
        </div>

        {/* Score Summary Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-6">
              <div className="text-center">
                <div className={`text-5xl font-bold px-4 py-2 rounded-lg ${getFormalityColor(getFScoreType(data.f_score))}`}>
                  {data.f_score}
                </div>
                <div className="text-sm text-muted-foreground mt-1">F-Score</div>
              </div>
              <div className="text-center">
                <Badge className={`text-sm px-3 py-1 ${getInterpretationColor(data.interpretation)}`}>
                  {data.interpretation_label}
                </Badge>
              </div>
              <Separator orientation="vertical" className="h-16 hidden md:block" />
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{format(new Date(data.created_at), 'MMM d, yyyy HH:mm')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <span>{data.total_tokens} tokens</span>
                </div>
                {data.linked_call_id && (
                  <div className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4 text-muted-foreground" />
                    <code className="text-xs bg-muted px-2 py-1 rounded">{data.linked_call_id}</code>
                  </div>
                )}
                {data.linked_prolific_id && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{data.linked_prolific_id}</span>
                  </div>
                )}
              </div>
            </div>
            {/* Processing options */}
            <div className="flex gap-2 mt-4">
              {data.ai_only_mode && <Badge variant="secondary">AI-only mode</Badge>}
              {data.per_turn_mode && <Badge variant="secondary">Per-turn scoring</Badge>}
              {data.batch_name && <Badge variant="outline">{data.batch_name}</Badge>}
            </div>
          </CardContent>
        </Card>

        {/* Color Legend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Legend</CardTitle>
            <CardDescription>Click to toggle visibility of each category in the transcript</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {/* Positive effect categories */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-muted-foreground font-medium mr-2">+ Formality:</span>
                {(['noun', 'adjective', 'preposition', 'article'] as FScoreCategory[]).map((cat) => {
                  const info = CATEGORY_COLORS[cat];
                  const isVisible = visibleCategories.has(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-opacity ${info.bg} ${info.text} ${
                        !isVisible ? 'opacity-30' : ''
                      }`}
                    >
                      {isVisible ? <Eye className="h-3 w-3 inline mr-1" /> : <EyeOff className="h-3 w-3 inline mr-1" />}
                      {info.label}
                    </button>
                  );
                })}
              </div>
              <Separator orientation="vertical" className="h-8 hidden md:block" />
              {/* Negative effect categories */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-muted-foreground font-medium mr-2">− Formality:</span>
                {(['pronoun', 'verb', 'adverb', 'interjection'] as FScoreCategory[]).map((cat) => {
                  const info = CATEGORY_COLORS[cat];
                  const isVisible = visibleCategories.has(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-opacity ${info.bg} ${info.text} ${
                        !isVisible ? 'opacity-30' : ''
                      }`}
                    >
                      {isVisible ? <Eye className="h-3 w-3 inline mr-1" /> : <EyeOff className="h-3 w-3 inline mr-1" />}
                      {info.label}
                    </button>
                  );
                })}
              </div>
              <Separator orientation="vertical" className="h-8 hidden md:block" />
              {/* Neutral */}
              <button
                onClick={() => toggleCategory('neutral')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-opacity ${NEUTRAL_COLOR.bg} ${NEUTRAL_COLOR.text} ${
                  !visibleCategories.has('neutral') ? 'opacity-30' : ''
                }`}
              >
                {visibleCategories.has('neutral') ? <Eye className="h-3 w-3 inline mr-1" /> : <EyeOff className="h-3 w-3 inline mr-1" />}
                Not counted
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Color-coded Transcript */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Analyzed Transcript</CardTitle>
            <CardDescription>Hover over words to see their part-of-speech tags and effect on formality</CardDescription>
          </CardHeader>
          <CardContent>{renderColoredTranscript()}</CardContent>
        </Card>

        {/* Formula Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Formula Breakdown</CardTitle>
            <CardDescription>Heylighen & Dewaele F-Score calculation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Category percentages */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground">Category Percentages</h4>
                <div className="space-y-2">
                  {/* Positive */}
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className={`${CATEGORY_COLORS.noun.text}`}>Nouns</span>
                    <span className="text-right">{cd.nouns.count} ({fb.nounPct.toFixed(1)}%)</span>
                    <span className="text-green-600 font-medium">+</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className={`${CATEGORY_COLORS.adjective.text}`}>Adjectives</span>
                    <span className="text-right">{cd.adjectives.count} ({fb.adjPct.toFixed(1)}%)</span>
                    <span className="text-green-600 font-medium">+</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className={`${CATEGORY_COLORS.preposition.text}`}>Prepositions</span>
                    <span className="text-right">{cd.prepositions.count} ({fb.prepPct.toFixed(1)}%)</span>
                    <span className="text-green-600 font-medium">+</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className={`${CATEGORY_COLORS.article.text}`}>Articles</span>
                    <span className="text-right">{cd.articles.count} ({fb.artPct.toFixed(1)}%)</span>
                    <span className="text-green-600 font-medium">+</span>
                  </div>
                  <Separator className="my-2" />
                  {/* Negative */}
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className={`${CATEGORY_COLORS.pronoun.text}`}>Pronouns</span>
                    <span className="text-right">{cd.pronouns.count} ({fb.pronPct.toFixed(1)}%)</span>
                    <span className="text-red-600 font-medium">−</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className={`${CATEGORY_COLORS.verb.text}`}>Verbs</span>
                    <span className="text-right">{cd.verbs.count} ({fb.verbPct.toFixed(1)}%)</span>
                    <span className="text-red-600 font-medium">−</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className={`${CATEGORY_COLORS.adverb.text}`}>Adverbs</span>
                    <span className="text-right">{cd.adverbs.count} ({fb.advPct.toFixed(1)}%)</span>
                    <span className="text-red-600 font-medium">−</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className={`${CATEGORY_COLORS.interjection.text}`}>Interjections</span>
                    <span className="text-right">{cd.interjections.count} ({fb.intjPct.toFixed(1)}%)</span>
                    <span className="text-red-600 font-medium">−</span>
                  </div>
                </div>
              </div>

              {/* Calculation */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground">Step-by-Step Calculation</h4>
                <div className="bg-muted p-4 rounded-lg font-mono text-sm space-y-2">
                  <div className="text-green-600">
                    + {fb.nounPct.toFixed(2)} + {fb.adjPct.toFixed(2)} + {fb.prepPct.toFixed(2)} + {fb.artPct.toFixed(2)}
                  </div>
                  <div className="text-red-600">
                    − {fb.pronPct.toFixed(2)} − {fb.verbPct.toFixed(2)} − {fb.advPct.toFixed(2)} − {fb.intjPct.toFixed(2)}
                  </div>
                  <div className="text-muted-foreground">+ 100</div>
                  <Separator />
                  <div>
                    = {fb.intermediateSum.toFixed(2)}
                  </div>
                  <div className="text-muted-foreground">÷ 2</div>
                  <Separator />
                  <div className="text-xl font-bold">
                    = {data.f_score}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Formula: F = (Noun% + Adj% + Prep% + Art% − Pron% − Verb% − Adv% − Intj% + 100) / 2
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Insights */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Why This Score?</CardTitle>
            <CardDescription>Key insights about the formality level</CardDescription>
          </CardHeader>
          <CardContent>{renderInsights()}</CardContent>
        </Card>

        {/* Token Table (collapsible) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Token Analysis</CardTitle>
                <CardDescription>Full list of all {data.total_tokens} tokens and their classifications</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="show-tokens" className="text-sm">Show table</Label>
                <Switch id="show-tokens" checked={showTokenTable} onCheckedChange={setShowTokenTable} />
              </div>
            </div>
          </CardHeader>
          {showTokenTable && (
            <CardContent>
              {data.tokens_data && data.tokens_data.length > 0 ? (
                <div className="max-h-96 overflow-y-auto border rounded-lg">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Token</TableHead>
                        <TableHead>POS Tag</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-center">Effect</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.tokens_data.map((token, idx) => {
                        const colorInfo = token.category ? CATEGORY_COLORS[token.category] : null;
                        return (
                          <TableRow key={idx}>
                            <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="font-medium">{token.token}</TableCell>
                            <TableCell><code className="text-xs bg-muted px-1 py-0.5 rounded">{token.posTag}</code></TableCell>
                            <TableCell>
                              {colorInfo ? (
                                <span className={`px-2 py-1 rounded text-xs ${colorInfo.bg} ${colorInfo.text}`}>
                                  {colorInfo.label}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">Not counted</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {colorInfo ? (
                                <span className={colorInfo.effect === '+' ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                                  {colorInfo.effect}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">Token-level data not available for this calculation.</p>
              )}
            </CardContent>
          )}
        </Card>

        {/* Notes */}
        {data.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{data.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
