import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, 
  FileText, 
  Download, 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp,
  Copy,
  Check,
  Info,
  Save,
  History,
  Link,
  ExternalLink,
  Loader2,
  Trash2
} from 'lucide-react';
import {
  FScoreResult,
  PerTurnResult,
  CSVParseResult,
  parseCSV,
  processTranscript,
  processTranscriptPerTurn,
  calculateAverageFromTurns,
  generateResultsCSV,
  generatePerTurnCSV,
  getReproductionSnippet,
  getTaggerInfo
} from '@/lib/formality-calculator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { Json } from '@/integrations/supabase/types';

interface SavedCalculation {
  id: string;
  created_at: string;
  f_score: number;
  total_tokens: number;
  interpretation: string;
  interpretation_label: string;
  linked_call_id: string | null;
  linked_prolific_id: string | null;
  notes: string | null;
  custom_interpretation: string | null;
  ai_only_mode: boolean;
  per_turn_mode: boolean;
  batch_name: string | null;
  transcript_source: string;
  original_transcript: string;
}

export function FormalityCalculator() {
  // Input state
  const [mode, setMode] = useState<'csv' | 'manual'>('manual');
  const [manualText, setManualText] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<CSVParseResult | null>(null);
  
  // Manual linking
  const [manualCallId, setManualCallId] = useState('');
  const [manualProlificId, setManualProlificId] = useState('');
  
  // Options
  const [aiOnly, setAiOnly] = useState(true);
  const [perTurnScoring, setPerTurnScoring] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [batchName, setBatchName] = useState('');
  
  // Results state
  const [results, setResults] = useState<FScoreResult[]>([]);
  const [perTurnResults, setPerTurnResults] = useState<PerTurnResult[]>([]);
  const [averageScore, setAverageScore] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  // Saved calculations
  const [savedCalculations, setSavedCalculations] = useState<SavedCalculation[]>([]);
  const [linkedCallIds, setLinkedCallIds] = useState<Set<string>>(new Set());
  const [showLinkedOnly, setShowLinkedOnly] = useState(true);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('calculate');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState<{ matched: number; updated: number; notFound: number } | null>(null);
  
  // UI state
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [showReproducibility, setShowReproducibility] = useState(false);
  const [savingStates, setSavingStates] = useState<Record<number, boolean>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useResearcherAuth();
  
  // Load saved calculations when switching to history tab
  useEffect(() => {
    if (activeTab === 'history') {
      loadSavedCalculations();
    }
  }, [activeTab]);
  
  // Map of call_id -> experiment response data (formality + assistant_type)
  const [experimentDataMap, setExperimentDataMap] = useState<Map<string, { formality: number; assistantType: string | null }>>(new Map());
  
  const loadSavedCalculations = async () => {
    setIsLoadingSaved(true);
    try {
      // Fetch calculations and experiment response call_ids + formality + assistant_type in parallel
      const [calcResult, responsesResult] = await Promise.all([
        supabase
          .from('formality_calculations')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('experiment_responses')
          .select('call_id, formality, assistant_type')
      ]);
      
      if (calcResult.error) throw calcResult.error;
      if (responsesResult.error) throw responsesResult.error;
      
      setSavedCalculations(calcResult.data || []);
      setLinkedCallIds(new Set((responsesResult.data || []).map(r => r.call_id)));
      
      // Build map of call_id -> experiment data
      const dataMap = new Map<string, { formality: number; assistantType: string | null }>();
      (responsesResult.data || []).forEach(r => {
        if (r.call_id) {
          dataMap.set(r.call_id, { 
            formality: r.formality, 
            assistantType: r.assistant_type 
          });
        }
      });
      setExperimentDataMap(dataMap);
    } catch (err) {
      console.error('Failed to load saved calculations:', err);
      toast.error('Failed to load saved calculations');
    } finally {
      setIsLoadingSaved(false);
    }
  };
  
  const handleFileUpload = useCallback(async (file: File) => {
    setError(null);
    setCsvFile(file);
    
    const content = await file.text();
    const parsed = parseCSV(content);
    
    if (parsed.error) {
      setError(parsed.error);
      setCsvData(null);
      return;
    }
    
    setCsvData(parsed);
    
    // Show info about linked data
    const hasCallIds = parsed.callIds.some(id => id.length > 0);
    const hasProlificIds = parsed.prolificIds.some(id => id.length > 0);
    
    if (hasCallIds || hasProlificIds) {
      toast.success(
        `Found ${parsed.transcripts.length} transcripts` +
        (hasCallIds ? ` with ${parsed.callIds.filter(id => id).length} call IDs` : '') +
        (hasProlificIds ? ` and ${parsed.prolificIds.filter(id => id).length} prolific IDs` : '')
      );
    }
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      handleFileUpload(file);
    } else {
      setError('Please upload a CSV file');
    }
  }, [handleFileUpload]);
  
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);
  
  const saveResultToDatabase = async (
    result: FScoreResult, 
    originalTranscript: string,
    source: 'manual' | 'csv',
    batchId?: string
  ): Promise<string | null> => {
    if (!user) return null;
    
    const { data, error } = await supabase.from('formality_calculations').insert([{
      created_by: user.id,
      transcript_source: source,
      original_transcript: originalTranscript.substring(0, 10000), // Limit size
      linked_call_id: result.callId || null,
      linked_prolific_id: result.prolificId || null,
      f_score: result.fScore,
      total_tokens: result.totalTokens,
      interpretation: result.interpretation,
      interpretation_label: result.interpretationLabel,
      category_data: JSON.parse(JSON.stringify(result.categories)) as Json,
      formula_breakdown: JSON.parse(JSON.stringify(result.formulaBreakdown)) as Json,
      tokens_data: JSON.parse(JSON.stringify(result.tokens.slice(0, 500))) as Json,
      ai_only_mode: aiOnly,
      per_turn_mode: perTurnScoring,
      batch_id: batchId || null,
      batch_name: batchName || null,
      csv_row_index: result.rowIndex,
    }]).select('id').single();
    
    if (error) {
      console.error('Failed to save calculation:', error);
      throw error;
    }
    
    return data?.id || null;
  };
  
  const processInBatches = async (
    transcripts: string[], 
    callIds: string[], 
    prolificIds: string[],
    batchSize: number = 10
  ) => {
    const allResults: FScoreResult[] = [];
    const batchId = crypto.randomUUID();
    
    for (let i = 0; i < transcripts.length; i += batchSize) {
      const batch = transcripts.slice(i, i + batchSize);
      
      for (let j = 0; j < batch.length; j++) {
        const idx = i + j;
        const result = processTranscript(batch[j], aiOnly, idx);
        
        // Attach linked data
        result.callId = callIds[idx] || undefined;
        result.prolificId = prolificIds[idx] || undefined;
        result.originalTranscript = batch[j];
        
        allResults.push(result);
        
        // Auto-save if enabled
        if (autoSave && user) {
          try {
            const savedId = await saveResultToDatabase(result, batch[j], 'csv', batchId);
            if (savedId) {
              result.savedId = savedId;
            }
          } catch (err) {
            console.error('Failed to auto-save result:', err);
          }
        }
      }
      
      setProgress(Math.round(((i + batch.length) / transcripts.length) * 100));
      
      // Yield to UI thread
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    return allResults;
  };
  
  const handleProcess = async () => {
    setError(null);
    setResults([]);
    setPerTurnResults([]);
    setAverageScore(null);
    setIsProcessing(true);
    setProgress(0);
    
    try {
      if (mode === 'manual') {
        if (!manualText.trim()) {
          setError('Please enter a transcript');
          setIsProcessing(false);
          return;
        }
        
        if (perTurnScoring) {
          const turnResults = processTranscriptPerTurn(manualText);
          setPerTurnResults(turnResults);
          setAverageScore(calculateAverageFromTurns(turnResults));
        } else {
          const result = processTranscript(manualText, aiOnly, 0);
          
          // Attach manual linking data
          result.callId = manualCallId || undefined;
          result.prolificId = manualProlificId || undefined;
          result.originalTranscript = manualText;
          
          setResults([result]);
          
          // Auto-save if enabled
          if (autoSave && user) {
            try {
              const savedId = await saveResultToDatabase(result, manualText, 'manual');
              if (savedId) {
                result.savedId = savedId;
              }
              toast.success('Result saved to database');
            } catch (err) {
              toast.error('Failed to save result');
            }
          }
          
          setResults([result]);
        }
      } else {
        if (!csvData || csvData.transcripts.length === 0) {
          setError('No transcripts found in CSV');
          setIsProcessing(false);
          return;
        }
        
        const processedResults = await processInBatches(
          csvData.transcripts, 
          csvData.callIds, 
          csvData.prolificIds
        );
        setResults(processedResults);
        
        if (autoSave && user) {
          toast.success(`${processedResults.length} results saved to database`);
        }
      }
    } catch (err) {
      setError(`Processing error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    
    setIsProcessing(false);
    setProgress(100);
  };
  
  const handleManualSave = async (result: FScoreResult, index: number) => {
    if (!user || !result.originalTranscript) return;
    
    setSavingStates(prev => ({ ...prev, [index]: true }));
    
    try {
      const savedId = await saveResultToDatabase(result, result.originalTranscript, mode === 'csv' ? 'csv' : 'manual');
      if (savedId) {
        // Update the result with the saved ID
        setResults(prev => prev.map((r, i) => i === index ? { ...r, savedId } : r));
      }
      toast.success('Result saved to database');
    } catch (err) {
      toast.error('Failed to save result');
    } finally {
      setSavingStates(prev => ({ ...prev, [index]: false }));
    }
  };
  
  const handleDeleteCalculation = async (id: string) => {
    try {
      const { error } = await supabase
        .from('formality_calculations')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      setSavedCalculations(prev => prev.filter(c => c.id !== id));
      toast.success('Calculation deleted');
    } catch (err) {
      toast.error('Failed to delete calculation');
    }
  };
  
  // Sync AI formality scores to experiment_responses by matching call_id
  const handleSyncToExperimentResponses = async () => {
    setIsSyncing(true);
    setSyncStats(null);
    
    try {
      // Get all formality calculations with call IDs
      const { data: calculations, error: calcError } = await supabase
        .from('formality_calculations')
        .select('linked_call_id, f_score, interpretation')
        .not('linked_call_id', 'is', null);
      
      if (calcError) throw calcError;
      
      if (!calculations || calculations.length === 0) {
        toast.info('No formality calculations with call IDs found');
        setIsSyncing(false);
        return;
      }
      
      // Get all experiment responses
      const { data: responses, error: respError } = await supabase
        .from('experiment_responses')
        .select('id, call_id, ai_formality_score');
      
      if (respError) throw respError;
      
      // Create a map of call_id to formality score
      const scoreMap = new Map<string, { score: number; interpretation: string }>();
      for (const calc of calculations) {
        if (calc.linked_call_id) {
          scoreMap.set(calc.linked_call_id, {
            score: calc.f_score,
            interpretation: calc.interpretation
          });
        }
      }
      
      let matched = 0;
      let updated = 0;
      let notFound = 0;
      
      // Update experiment responses
      for (const response of responses || []) {
        const scoreData = scoreMap.get(response.call_id);
        if (scoreData) {
          matched++;
          // Only update if score is different or not set
          if (response.ai_formality_score !== scoreData.score) {
            const { error: updateError } = await supabase
              .from('experiment_responses')
              .update({
                ai_formality_score: scoreData.score,
                ai_formality_interpretation: scoreData.interpretation,
                ai_formality_calculated_at: new Date().toISOString()
              })
              .eq('id', response.id);
            
            if (!updateError) {
              updated++;
            }
          }
        } else {
          notFound++;
        }
      }
      
      setSyncStats({ matched, updated, notFound });
      toast.success(`Synced ${updated} experiment responses with AI formality scores`);
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('Failed to sync formality scores');
    } finally {
      setIsSyncing(false);
    }
  };
  
  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleDownloadResults = () => {
    const csv = generateResultsCSV(results);
    downloadCSV(csv, 'formality_scores.csv');
  };
  
  const handleDownloadPerTurn = () => {
    const csv = generatePerTurnCSV(perTurnResults);
    downloadCSV(csv, 'formality_scores_per_turn.csv');
  };
  
  const copyReproductionSnippet = async () => {
    await navigator.clipboard.writeText(getReproductionSnippet());
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };
  
  const toggleResultExpansion = (index: number) => {
    setExpandedResults(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };
  
  const getInterpretationColor = (interpretation: string) => {
    switch (interpretation) {
      case 'very-informal': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'conversational': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
      case 'moderately-formal': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'highly-formal': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default: return 'bg-muted text-muted-foreground';
    }
  };
  
  const taggerInfo = getTaggerInfo();
  
  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="calculate">
            <FileText className="h-4 w-4 mr-2" />
            Calculate
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="calculate" className="space-y-6">
          {/* Header Card */}
          <Card>
            <CardHeader>
              <CardTitle>Transcript Formality (F-score) Calculator</CardTitle>
              <CardDescription>
                Compute the Heylighen & Dewaele (1999) F-score using POS tag distributions. 
                Upload a CSV or paste a transcript to analyze formality.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Mode Selection */}
              <div className="flex gap-4">
                <Button
                  variant={mode === 'manual' ? 'default' : 'outline'}
                  onClick={() => setMode('manual')}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Manual Input
                </Button>
                <Button
                  variant={mode === 'csv' ? 'default' : 'outline'}
                  onClick={() => setMode('csv')}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload CSV
                </Button>
              </div>
              
              {/* Input Area */}
              {mode === 'manual' ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="transcript">Transcript</Label>
                    <Textarea
                      id="transcript"
                      placeholder="Paste your transcript here...&#10;&#10;For AI-only analysis, format each AI turn as:&#10;AI: Hello, how can I help you today?&#10;User: I need help with...&#10;AI: Of course, let me assist you."
                      className="min-h-[200px] font-mono text-sm"
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                    />
                  </div>
                  
                  {/* Manual Linking */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="call-id">
                        <Link className="h-3 w-3 inline mr-1" />
                        Link to Call ID (optional)
                      </Label>
                      <Input
                        id="call-id"
                        placeholder="VAPI call ID"
                        value={manualCallId}
                        onChange={(e) => setManualCallId(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prolific-id">
                        <Link className="h-3 w-3 inline mr-1" />
                        Link to Prolific ID (optional)
                      </Label>
                      <Input
                        id="prolific-id"
                        placeholder="Prolific participant ID"
                        value={manualProlificId}
                        onChange={(e) => setManualProlificId(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div
                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-2">
                      Drag and drop a CSV file, or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Required: "Transcript" column. Optional: "call_id" and "prolific_id" columns for auto-linking
                    </p>
                    {csvFile && csvData && (
                      <div className="mt-4 p-3 bg-muted rounded text-left">
                        <p className="text-sm font-medium">{csvFile.name}</p>
                        <div className="text-xs text-muted-foreground mt-1 space-y-1">
                          <p>✓ {csvData.transcripts.length} transcripts found</p>
                          {csvData.callIds.some(id => id) && (
                            <p className="text-green-600 dark:text-green-400">
                              ✓ {csvData.callIds.filter(id => id).length} call IDs found (auto-linking enabled)
                            </p>
                          )}
                          {csvData.prolificIds.some(id => id) && (
                            <p className="text-green-600 dark:text-green-400">
                              ✓ {csvData.prolificIds.filter(id => id).length} prolific IDs found (auto-linking enabled)
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Batch Name */}
                  <div className="space-y-2">
                    <Label htmlFor="batch-name">Batch Name (optional)</Label>
                    <Input
                      id="batch-name"
                      placeholder="e.g., 'Pilot Study 1', 'Wave 2 Data'"
                      value={batchName}
                      onChange={(e) => setBatchName(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Give this batch a name for easier identification in history
                    </p>
                  </div>
                </div>
              )}
              
              {/* Options */}
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="ai-only"
                    checked={aiOnly}
                    onCheckedChange={setAiOnly}
                  />
                  <Label htmlFor="ai-only" className="cursor-pointer">
                    Use AI utterances only
                    <span className="block text-xs text-muted-foreground">
                      Keep only lines starting with "AI:"
                    </span>
                  </Label>
                </div>
                
                {mode === 'manual' && (
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="per-turn"
                      checked={perTurnScoring}
                      onCheckedChange={setPerTurnScoring}
                    />
                    <Label htmlFor="per-turn" className="cursor-pointer">
                      Per-turn scoring
                      <span className="block text-xs text-muted-foreground">
                        Score each AI turn separately
                      </span>
                    </Label>
                  </div>
                )}
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="auto-save"
                    checked={autoSave}
                    onCheckedChange={setAutoSave}
                  />
                  <Label htmlFor="auto-save" className="cursor-pointer">
                    Auto-save results
                    <span className="block text-xs text-muted-foreground">
                      Save calculations to database automatically
                    </span>
                  </Label>
                </div>
              </div>
              
              {/* Error Display */}
              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              {/* Process Button */}
              <Button 
                onClick={handleProcess} 
                disabled={isProcessing}
                className="w-full sm:w-auto"
              >
                {isProcessing ? 'Processing...' : 'Calculate F-Score'}
              </Button>
              
              {/* Progress Bar */}
              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-muted-foreground text-center">
                    Processing... {progress}%
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Results Section */}
          {(results.length > 0 || perTurnResults.length > 0) && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Results</CardTitle>
                  <CardDescription>
                    {results.length > 0 && `${results.length} transcript(s) analyzed`}
                    {perTurnResults.length > 0 && `${perTurnResults.length} turns analyzed`}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {results.length > 0 && (
                    <Button variant="outline" size="sm" onClick={handleDownloadResults}>
                      <Download className="h-4 w-4 mr-2" />
                      Download CSV
                    </Button>
                  )}
                  {perTurnResults.length > 0 && (
                    <Button variant="outline" size="sm" onClick={handleDownloadPerTurn}>
                      <Download className="h-4 w-4 mr-2" />
                      Download Per-Turn CSV
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Average Score for Per-Turn */}
                {averageScore !== null && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Average F-Score across all turns:</strong> {averageScore}
                    </AlertDescription>
                  </Alert>
                )}
                
                {/* Per-Turn Results */}
                {perTurnResults.length > 0 && (
                  <div className="space-y-3">
                    {perTurnResults.map((turn, idx) => (
                      <ResultCard
                        key={idx}
                        result={turn.result}
                        title={`Turn ${turn.turnIndex + 1}`}
                        subtitle={turn.turnText}
                        isExpanded={expandedResults.has(idx)}
                        onToggle={() => toggleResultExpansion(idx)}
                        getInterpretationColor={getInterpretationColor}
                        showSaveButton={!autoSave}
                        onSave={() => handleManualSave(turn.result, idx)}
                        isSaving={savingStates[idx]}
                      />
                    ))}
                  </div>
                )}
                
                {/* Standard Results */}
                {results.length > 0 && (
                  <div className="space-y-3">
                    {results.map((result, idx) => (
                      <ResultCard
                        key={idx}
                        result={result}
                        title={`Transcript ${result.rowIndex + 1}`}
                        subtitle={result.callId ? `Call ID: ${result.callId}` : undefined}
                        isExpanded={expandedResults.has(idx)}
                        onToggle={() => toggleResultExpansion(idx)}
                        getInterpretationColor={getInterpretationColor}
                        showSaveButton={!autoSave}
                        onSave={() => handleManualSave(result, idx)}
                        isSaving={savingStates[idx]}
                        linkedCallId={result.callId}
                        linkedProlificId={result.prolificId}
                        savedId={result.savedId}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* Reproducibility Panel */}
          <Card>
            <CardHeader>
              <Collapsible open={showReproducibility} onOpenChange={setShowReproducibility}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                    <CardTitle className="text-lg">Reproducibility</CardTitle>
                    {showReproducibility ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-4 space-y-6">
                    {/* Tagger Info */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h4 className="font-medium mb-2">POS Tagger</h4>
                        <p className="text-sm text-muted-foreground">
                          <strong>{taggerInfo.name}</strong> v{taggerInfo.version}
                        </p>
                        <p className="text-sm text-muted-foreground">{taggerInfo.type}</p>
                        <a 
                          href={taggerInfo.documentation} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          Documentation →
                        </a>
                      </div>
                      
                      <div>
                        <h4 className="font-medium mb-2">Article List</h4>
                        <div className="flex gap-2">
                          {taggerInfo.articleList.map(art => (
                            <Badge key={art} variant="secondary">{art}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    {/* Tokenization Rules */}
                    <div>
                      <h4 className="font-medium mb-2">Tokenization Rules</h4>
                      <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                        {taggerInfo.tokenizationRules.map((rule, idx) => (
                          <li key={idx}>{rule}</li>
                        ))}
                      </ul>
                    </div>
                    
                    {/* Category Mapping */}
                    <div>
                      <h4 className="font-medium mb-2">Category Mapping</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead>Compromise Tags</TableHead>
                            <TableHead>F-Score</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {taggerInfo.categoryMapping.map((cat, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{cat.category}</TableCell>
                              <TableCell className="text-sm">{cat.tags}</TableCell>
                              <TableCell>
                                <Badge variant={cat.fScoreSign === '+' ? 'default' : 'destructive'}>
                                  {cat.fScoreSign}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    
                    {/* Formula */}
                    <div>
                      <h4 className="font-medium mb-2">Formula</h4>
                      <code className="block bg-muted p-3 rounded text-sm">
                        {taggerInfo.formula}
                      </code>
                    </div>
                    
                    {/* Code Snippet */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">Reproduction Code Snippet</h4>
                        <Button variant="outline" size="sm" onClick={copyReproductionSnippet}>
                          {copiedSnippet ? (
                            <>
                              <Check className="h-4 w-4 mr-2" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4 mr-2" />
                              Copy
                            </>
                          )}
                        </Button>
                      </div>
                      <pre className="bg-muted p-4 rounded text-xs overflow-x-auto max-h-64">
                        {getReproductionSnippet()}
                      </pre>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </CardHeader>
          </Card>
        </TabsContent>
        
        <TabsContent value="history" className="space-y-6">
          {/* Sync to Experiment Responses Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link className="h-5 w-5" />
                Sync to Experiment Responses
              </CardTitle>
              <CardDescription>
                Match formality calculations with experiment responses using Call ID and update the ai_formality_score field
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={handleSyncToExperimentResponses}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Link className="h-4 w-4 mr-2" />
                    Sync AI Formality Scores to Experiment Responses
                  </>
                )}
              </Button>
              
              {syncStats && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Sync Complete:</strong>
                    <ul className="mt-2 space-y-1 text-sm">
                      <li>✓ {syncStats.matched} experiment responses matched with formality calculations</li>
                      <li>✓ {syncStats.updated} experiment responses updated with new scores</li>
                      <li>○ {syncStats.notFound} experiment responses had no matching formality calculation</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Saved Calculations</CardTitle>
                  <CardDescription>
                    View previously saved F-score calculations and their linked experiment data
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-linked-only"
                    checked={showLinkedOnly}
                    onCheckedChange={setShowLinkedOnly}
                  />
                  <Label htmlFor="show-linked-only" className="text-sm whitespace-nowrap">
                    Linked to responses only
                  </Label>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingSaved ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : savedCalculations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-10 w-10 mx-auto mb-4 opacity-50" />
                  <p>No saved calculations yet</p>
                  <p className="text-sm">Calculations will appear here when you process transcripts with auto-save enabled</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Assistant Type</TableHead>
                        <TableHead>AI Formality</TableHead>
                        <TableHead>User Perception</TableHead>
                        <TableHead>Interpretation</TableHead>
                        <TableHead>Tokens</TableHead>
                        <TableHead>Call ID</TableHead>
                        <TableHead>Prolific ID</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {savedCalculations
                        .filter((calc) => !showLinkedOnly || (calc.linked_call_id && linkedCallIds.has(calc.linked_call_id)))
                        .map((calc) => (
                        <TableRow 
                          key={calc.id} 
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => window.location.href = `/researcher/formality/${calc.id}`}
                        >
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(calc.created_at), 'MMM d, yyyy HH:mm')}
                          </TableCell>
                          <TableCell>
                            {calc.linked_call_id && experimentDataMap.get(calc.linked_call_id)?.assistantType ? (
                              <Badge variant={experimentDataMap.get(calc.linked_call_id)?.assistantType === 'formal' ? 'default' : 'secondary'}>
                                {experimentDataMap.get(calc.linked_call_id)?.assistantType}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="font-bold">{calc.f_score}</TableCell>
                          <TableCell>
                            {calc.linked_call_id && experimentDataMap.has(calc.linked_call_id) ? (
                              <span className="font-medium">{experimentDataMap.get(calc.linked_call_id)?.formality}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={getInterpretationColor(calc.interpretation)}>
                              {calc.interpretation_label}
                            </Badge>
                          </TableCell>
                          <TableCell>{calc.total_tokens}</TableCell>
                          <TableCell>
                            {calc.linked_call_id ? (
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                {calc.linked_call_id.substring(0, 12)}...
                              </code>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {calc.linked_prolific_id || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {calc.transcript_source}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {calc.batch_name || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCalculation(calc.id);
                              }}
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Result Card Component
interface ResultCardProps {
  result: FScoreResult;
  title: string;
  subtitle?: string;
  isExpanded: boolean;
  onToggle: () => void;
  getInterpretationColor: (interpretation: string) => string;
  showSaveButton?: boolean;
  onSave?: () => void;
  isSaving?: boolean;
  linkedCallId?: string;
  linkedProlificId?: string;
  savedId?: string;
}

function ResultCard({ 
  result, 
  title, 
  subtitle, 
  isExpanded, 
  onToggle, 
  getInterpretationColor,
  showSaveButton,
  onSave,
  isSaving,
  linkedCallId,
  linkedProlificId,
  savedId
}: ResultCardProps) {
  const handleCardClick = () => {
    if (savedId) {
      window.location.href = `/researcher/formality/${savedId}`;
    }
  };

  return (
    <div 
      className={`border rounded-lg p-4 space-y-4 ${savedId ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
      onClick={savedId ? handleCardClick : undefined}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-medium">{title}</h4>
            {savedId && (
              <Badge variant="secondary" className="text-xs">
                <ExternalLink className="h-3 w-3 mr-1" />
                View Details
              </Badge>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-muted-foreground truncate max-w-md">{subtitle}</p>
          )}
          {/* Linked Data Badges */}
          {(linkedCallId || linkedProlificId) && (
            <div className="flex gap-2 mt-1">
              {linkedCallId && (
                <Badge variant="outline" className="text-xs">
                  <Link className="h-3 w-3 mr-1" />
                  Call: {linkedCallId.substring(0, 8)}...
                </Badge>
              )}
              {linkedProlificId && (
                <Badge variant="outline" className="text-xs">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Prolific: {linkedProlificId}
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {showSaveButton && onSave && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                onSave();
              }}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          )}
          <div className="text-right">
            <p className="text-2xl font-bold">{result.fScore}</p>
            <Badge className={getInterpretationColor(result.interpretation)}>
              {result.interpretationLabel}
            </Badge>
          </div>
        </div>
      </div>
      
      {/* Warning */}
      {result.warning && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{result.warning}</AlertDescription>
        </Alert>
      )}
      
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Total Tokens</p>
          <p className="font-medium">{result.totalTokens}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Nouns</p>
          <p className="font-medium">{result.categories.nouns.count} ({result.categories.nouns.percentage.toFixed(1)}%)</p>
        </div>
        <div>
          <p className="text-muted-foreground">Verbs</p>
          <p className="font-medium">{result.categories.verbs.count} ({result.categories.verbs.percentage.toFixed(1)}%)</p>
        </div>
        <div>
          <p className="text-muted-foreground">Pronouns</p>
          <p className="font-medium">{result.categories.pronouns.count} ({result.categories.pronouns.percentage.toFixed(1)}%)</p>
        </div>
      </div>
      
      {/* POS Distribution Table */}
      <div>
        <h5 className="text-sm font-medium mb-2">POS Distribution</h5>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Percentage</TableHead>
                <TableHead className="text-center">F-Score Sign</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Nouns</TableCell>
                <TableCell className="text-right">{result.categories.nouns.count}</TableCell>
                <TableCell className="text-right">{result.categories.nouns.percentage.toFixed(2)}%</TableCell>
                <TableCell className="text-center text-green-600">+</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Adjectives</TableCell>
                <TableCell className="text-right">{result.categories.adjectives.count}</TableCell>
                <TableCell className="text-right">{result.categories.adjectives.percentage.toFixed(2)}%</TableCell>
                <TableCell className="text-center text-green-600">+</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Prepositions</TableCell>
                <TableCell className="text-right">{result.categories.prepositions.count}</TableCell>
                <TableCell className="text-right">{result.categories.prepositions.percentage.toFixed(2)}%</TableCell>
                <TableCell className="text-center text-green-600">+</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Articles</TableCell>
                <TableCell className="text-right">{result.categories.articles.count}</TableCell>
                <TableCell className="text-right">{result.categories.articles.percentage.toFixed(2)}%</TableCell>
                <TableCell className="text-center text-green-600">+</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Pronouns</TableCell>
                <TableCell className="text-right">{result.categories.pronouns.count}</TableCell>
                <TableCell className="text-right">{result.categories.pronouns.percentage.toFixed(2)}%</TableCell>
                <TableCell className="text-center text-red-600">−</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Verbs</TableCell>
                <TableCell className="text-right">{result.categories.verbs.count}</TableCell>
                <TableCell className="text-right">{result.categories.verbs.percentage.toFixed(2)}%</TableCell>
                <TableCell className="text-center text-red-600">−</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Adverbs</TableCell>
                <TableCell className="text-right">{result.categories.adverbs.count}</TableCell>
                <TableCell className="text-right">{result.categories.adverbs.percentage.toFixed(2)}%</TableCell>
                <TableCell className="text-center text-red-600">−</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Interjections</TableCell>
                <TableCell className="text-right">{result.categories.interjections.count}</TableCell>
                <TableCell className="text-right">{result.categories.interjections.percentage.toFixed(2)}%</TableCell>
                <TableCell className="text-center text-red-600">−</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
      
      {/* Formula Breakdown */}
      <div>
        <h5 className="text-sm font-medium mb-2">Formula Breakdown</h5>
        <code className="block bg-muted p-3 rounded text-xs overflow-x-auto">
          F = ({result.formulaBreakdown.nounPct} + {result.formulaBreakdown.adjPct} + {result.formulaBreakdown.prepPct} + {result.formulaBreakdown.artPct} − {result.formulaBreakdown.pronPct} − {result.formulaBreakdown.verbPct} − {result.formulaBreakdown.advPct} − {result.formulaBreakdown.intjPct} + 100) / 2
          <br />
          F = {result.formulaBreakdown.intermediateSum} / 2
          <br />
          F = <strong>{result.fScore}</strong>
        </code>
      </div>
      
      {/* Token Details Expandable */}
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="w-full">
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-2" />
                Hide Tokens & Tags
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-2" />
                Show Tokens & Tags ({result.tokens.length} tokens)
              </>
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <div className="max-h-64 overflow-y-auto border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>POS Tags</TableHead>
                  <TableHead>Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.tokens.map((token, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-mono">{token.token}</TableCell>
                    <TableCell className="text-xs">{token.posTag}</TableCell>
                    <TableCell>
                      {token.category ? (
                        <Badge variant="outline" className="text-xs">
                          {token.category}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
