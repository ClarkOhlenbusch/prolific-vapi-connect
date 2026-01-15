import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Plus,
  X,
  GitCompare
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  const [mode, setMode] = useState<'csv' | 'manual' | 'compare'>('manual');
  const [manualText, setManualText] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<CSVParseResult | null>(null);
  
  // Compare mode state
  const [compareTexts, setCompareTexts] = useState<string[]>(() => {
    const saved = localStorage.getItem('formality-compare-texts');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          return parsed;
        }
      } catch {}
    }
    return ['', ''];
  });
  const [compareResults, setCompareResults] = useState<FScoreResult[]>([]);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(() => {
    return localStorage.getItem('formality-compare-version-id');
  });
  
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
  
  // Sorting state for history table
  type SortColumn = 'created_at' | 'f_score' | 'perceived_formality' | 'assistant_type' | 'tokens';
  type SortDirection = 'asc' | 'desc' | null;
  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Filtering state
  const [filterAssistantType, setFilterAssistantType] = useState<'all' | 'formal' | 'informal'>('all');
  const [filterFormalityType, setFilterFormalityType] = useState<'all' | 'formal' | 'informal'>('all');
  
  // UI state
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [showReproducibility, setShowReproducibility] = useState(false);
  const [savingStates, setSavingStates] = useState<Record<number, boolean>>({});
  
  // Compare mode helpers
  const addCompareText = () => {
    if (compareTexts.length < 6) {
      setCompareTexts([...compareTexts, '']);
    }
  };
  
  const removeCompareText = (index: number) => {
    if (compareTexts.length > 2) {
      setCompareTexts(compareTexts.filter((_, i) => i !== index));
      setCompareResults(compareResults.filter((_, i) => i !== index));
    }
  };
  
  const updateCompareText = (index: number, text: string) => {
    const newTexts = [...compareTexts];
    newTexts[index] = text;
    setCompareTexts(newTexts);
  };
  
  const saveCompareAsNewVersion = () => {
    const newVersionId = crypto.randomUUID();
    setCompareVersionId(newVersionId);
    localStorage.setItem('formality-compare-version-id', newVersionId);
    localStorage.setItem('formality-compare-texts', JSON.stringify(compareTexts));
    toast.success('Comparison saved as new version');
  };
  
  const clearComparison = () => {
    setCompareTexts(['', '']);
    setCompareResults([]);
    setCompareVersionId(null);
    localStorage.removeItem('formality-compare-texts');
    localStorage.removeItem('formality-compare-version-id');
    toast.success('Comparison cleared');
  };
  
  // Live F-score calculation for manual input
  const liveManualResult = useMemo(() => {
    if (mode !== 'manual' || !manualText.trim() || manualText.trim().length < 3) {
      return null;
    }
    try {
      return processTranscript(manualText, aiOnly, 0);
    } catch {
      return null;
    }
  }, [manualText, aiOnly, mode]);
  
  // Live F-score calculation for compare mode
  const liveCompareResults = useMemo(() => {
    if (mode !== 'compare') {
      return [];
    }
    return compareTexts.map((text, idx) => {
      if (!text.trim() || text.trim().length < 3) {
        return null;
      }
      try {
        return processTranscript(text, aiOnly, idx);
      } catch {
        return null;
      }
    });
  }, [compareTexts, aiOnly, mode]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useResearcherAuth();
  
  // Auto-save compare texts to localStorage
  useEffect(() => {
    if (mode === 'compare') {
      localStorage.setItem('formality-compare-texts', JSON.stringify(compareTexts));
    }
  }, [compareTexts, mode]);
  
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
    setCompareResults([]);
    setIsProcessing(true);
    setProgress(0);
    
    try {
      if (mode === 'compare') {
        // Compare mode: process multiple texts
        const validTexts = compareTexts.filter(t => t.trim());
        if (validTexts.length < 2) {
          setError('Please enter at least 2 texts to compare');
          setIsProcessing(false);
          return;
        }
        
        const compResults: FScoreResult[] = [];
        for (let i = 0; i < compareTexts.length; i++) {
          const text = compareTexts[i];
          if (text.trim()) {
            const result = processTranscript(text, aiOnly, i);
            result.originalTranscript = text;
            compResults.push(result);
          } else {
            // Push a placeholder for empty texts
            compResults.push(null as unknown as FScoreResult);
          }
          setProgress(Math.round(((i + 1) / compareTexts.length) * 100));
        }
        setCompareResults(compResults);
      } else if (mode === 'manual') {
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
  
  // Unified color scheme: Blue for formal, Amber for informal, Gray for neutral
  const getFormalityColor = (type: 'formal' | 'informal' | 'neutral') => {
    switch (type) {
      case 'formal': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-300';
      case 'informal': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300';
      case 'neutral': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300';
    }
  };

  // Get token category type for coloring
  const getTokenFormalityType = (category: string | null): 'formal' | 'informal' | 'neutral' => {
    if (!category) return 'neutral';
    // Formal categories (positive F-score contribution): nouns, adjectives, prepositions, articles
    if (['noun', 'adjective', 'preposition', 'article'].includes(category)) return 'formal';
    // Informal categories (negative F-score contribution): verbs, adverbs, pronouns, interjections
    if (['verb', 'adverb', 'pronoun', 'interjection'].includes(category)) return 'informal';
    return 'neutral';
  };

  // Get token color classes
  const getTokenColorClass = (category: string | null): string => {
    const type = getTokenFormalityType(category);
    switch (type) {
      case 'formal': return 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50';
      case 'informal': return 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50';
      case 'neutral': return 'text-gray-500 dark:text-gray-400';
    }
  };

  const getFScoreType = (score: number): 'formal' | 'informal' | 'neutral' => {
    if (score >= 50) return 'formal';
    if (score < 50) return 'informal';
    return 'neutral';
  };

  const getPerceivedFormalityType = (score: number): 'formal' | 'informal' | 'neutral' => {
    if (score >= 5) return 'formal';
    if (score <= 3) return 'informal';
    return 'neutral';
  };

  const getAssistantTypeColor = (type: string | null | undefined) => {
    if (type === 'formal') return getFormalityColor('formal');
    if (type === 'informal') return getFormalityColor('informal');
    return getFormalityColor('neutral');
  };

  const getInterpretationColor = (interpretation: string) => {
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
  };

  // Sort handler
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortColumn('created_at');
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column || sortDirection === null) {
      return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />;
  };

  // Get sorted and filtered calculations
  const getSortedCalculations = () => {
    let filtered = savedCalculations.filter((calc) => 
      !showLinkedOnly || (calc.linked_call_id && linkedCallIds.has(calc.linked_call_id))
    );

    // Apply assistant type filter
    if (filterAssistantType !== 'all') {
      filtered = filtered.filter((calc) => {
        const expData = calc.linked_call_id ? experimentDataMap.get(calc.linked_call_id) : null;
        return expData?.assistantType === filterAssistantType;
      });
    }

    // Apply formality type filter (based on F-score)
    if (filterFormalityType !== 'all') {
      filtered = filtered.filter((calc) => {
        const type = getFScoreType(calc.f_score);
        return type === filterFormalityType;
      });
    }

    // Apply sorting
    if (sortColumn && sortDirection) {
      filtered.sort((a, b) => {
        let aVal: any, bVal: any;
        
        switch (sortColumn) {
          case 'created_at':
            aVal = new Date(a.created_at).getTime();
            bVal = new Date(b.created_at).getTime();
            break;
          case 'f_score':
            aVal = a.f_score;
            bVal = b.f_score;
            break;
          case 'perceived_formality':
            aVal = a.linked_call_id ? experimentDataMap.get(a.linked_call_id)?.formality ?? -1 : -1;
            bVal = b.linked_call_id ? experimentDataMap.get(b.linked_call_id)?.formality ?? -1 : -1;
            break;
          case 'assistant_type':
            aVal = a.linked_call_id ? experimentDataMap.get(a.linked_call_id)?.assistantType ?? '' : '';
            bVal = b.linked_call_id ? experimentDataMap.get(b.linked_call_id)?.assistantType ?? '' : '';
            break;
          case 'tokens':
            aVal = a.total_tokens;
            bVal = b.total_tokens;
            break;
          default:
            return 0;
        }
        
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
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
              <div className="flex gap-4 flex-wrap">
                <Button
                  variant={mode === 'manual' ? 'default' : 'outline'}
                  onClick={() => setMode('manual')}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Manual Input
                </Button>
                <Button
                  variant={mode === 'compare' ? 'default' : 'outline'}
                  onClick={() => setMode('compare')}
                >
                  <GitCompare className="h-4 w-4 mr-2" />
                  Compare
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
                    {/* Live F-score display */}
                    {liveManualResult && (
                      <div className={`mt-2 p-3 rounded-md border ${
                        liveManualResult.fScore >= 50 
                          ? 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800'
                          : 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800'
                      }`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className={`text-2xl font-bold ${
                              liveManualResult.fScore >= 50 ? 'text-blue-700 dark:text-blue-300' : 'text-amber-700 dark:text-amber-300'
                            }`}>
                              {liveManualResult.fScore}
                            </span>
                            <div>
                              <Badge className={`${
                                liveManualResult.fScore >= 50 
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                              }`}>
                                {liveManualResult.interpretationLabel}
                              </Badge>
                              <p className="text-xs text-muted-foreground mt-1">
                                {liveManualResult.totalTokens} tokens analyzed
                              </p>
                            </div>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <p>Live preview</p>
                            <div className="flex gap-2 mt-1 justify-end">
                              <span className="text-blue-600 dark:text-blue-400">■ Formal</span>
                              <span className="text-amber-600 dark:text-amber-400">■ Informal</span>
                              <span className="text-gray-400">■ Neutral</span>
                            </div>
                          </div>
                        </div>
                        {/* Color-coded tokens */}
                        <div className="flex flex-wrap gap-1 text-sm leading-relaxed">
                          {liveManualResult.tokens.map((token, idx) => (
                            <span
                              key={idx}
                              className={`px-1 rounded ${getTokenColorClass(token.category)}`}
                              title={token.category ? `${token.category} (${token.posTag})` : token.posTag}
                            >
                              {token.token}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
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
              ) : mode === 'compare' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Label>Compare Texts</Label>
                      {compareVersionId && (
                        <Badge variant="outline" className="text-xs">
                          Auto-saved
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={saveCompareAsNewVersion}
                        disabled={!compareTexts.some(t => t.trim())}
                      >
                        <Save className="h-4 w-4 mr-1" />
                        Save as New Version
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearComparison}
                        disabled={!compareTexts.some(t => t.trim())}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Clear
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addCompareText}
                        disabled={compareTexts.length >= 6}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Text
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enter 2-6 texts/sentences to compare their formality scores side by side. Changes auto-save to browser.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {compareTexts.map((text, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={`compare-${index}`}>Text {index + 1}</Label>
                          {compareTexts.length > 2 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeCompareText(index)}
                              className="h-6 w-6 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <Textarea
                          id={`compare-${index}`}
                          placeholder={`Enter text ${index + 1}...`}
                          className="min-h-[120px] font-mono text-sm"
                          value={text}
                          onChange={(e) => updateCompareText(index, e.target.value)}
                        />
                        {/* Live F-score for this text */}
                        {liveCompareResults[index] && (
                          <div className={`p-2 rounded border ${
                            liveCompareResults[index]!.fScore >= 50 
                              ? 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800'
                              : 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800'
                          }`}>
                            <div className="text-sm font-medium text-center mb-2">
                              F-Score: {liveCompareResults[index]!.fScore} ({liveCompareResults[index]!.interpretationLabel}) • {liveCompareResults[index]!.totalTokens} tokens
                            </div>
                            {/* Color-coded tokens */}
                            <div className="flex flex-wrap gap-1 text-xs leading-relaxed">
                              {liveCompareResults[index]!.tokens.map((token, tidx) => (
                                <span
                                  key={tidx}
                                  className={`px-0.5 rounded ${getTokenColorClass(token.category)}`}
                                  title={token.category ? `${token.category} (${token.posTag})` : token.posTag}
                                >
                                  {token.token}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
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
                      {mode === 'compare' 
                        ? 'Extract AI: lines or analyze full text'
                        : 'Keep only lines starting with "AI:"'
                      }
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
                
                {mode !== 'compare' && (
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
                )}
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
                {isProcessing ? 'Processing...' : mode === 'compare' ? 'Compare F-Scores' : 'Calculate F-Score'}
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
          
          {/* Compare Results Summary */}
          {compareResults.filter(r => r).length >= 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitCompare className="h-5 w-5" />
                  Comparison Results
                </CardTitle>
                <CardDescription>
                  Side-by-side formality comparison of {compareResults.filter(r => r).length} texts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Summary Table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Text</TableHead>
                        <TableHead className="text-center">F-Score</TableHead>
                        <TableHead className="text-center">Interpretation</TableHead>
                        <TableHead className="text-center">Tokens</TableHead>
                        <TableHead className="text-center">Difference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {compareResults.map((result, idx) => {
                        if (!result) return null;
                        const baseScore = compareResults.find(r => r)?.fScore || 0;
                        const diff = result.fScore - baseScore;
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">
                              Text {idx + 1}
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {compareTexts[idx]?.substring(0, 50)}{compareTexts[idx]?.length > 50 ? '...' : ''}
                              </p>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className={`${
                                result.fScore >= 50 
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                              }`}>
                                {result.fScore}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              {result.interpretationLabel}
                            </TableCell>
                            <TableCell className="text-center text-sm text-muted-foreground">
                              {result.totalTokens}
                            </TableCell>
                            <TableCell className="text-center">
                              {idx === 0 ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span className={diff > 0 ? 'text-blue-600' : diff < 0 ? 'text-amber-600' : 'text-muted-foreground'}>
                                  {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  
                  {/* Visual Bar Comparison */}
                  <div className="space-y-3 pt-4">
                    <Label>Visual Comparison</Label>
                    {compareResults.map((result, idx) => {
                      if (!result) return null;
                      const barWidth = Math.max(5, Math.min(100, result.fScore));
                      return (
                        <div key={idx} className="flex items-center gap-3">
                          <span className="text-sm w-16 text-muted-foreground">Text {idx + 1}</span>
                          <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 ${
                                result.fScore >= 50 
                                  ? 'bg-blue-500'
                                  : 'bg-amber-500'
                              }`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-12 text-right">{result.fScore}</span>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Category Breakdown Comparison */}
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between">
                        <span>Category Breakdown</span>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Category</TableHead>
                            {compareResults.map((r, idx) => r && (
                              <TableHead key={idx} className="text-center">Text {idx + 1}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {['nouns', 'verbs', 'adjectives', 'adverbs', 'pronouns', 'prepositions', 'articles', 'interjections'].map(cat => (
                            <TableRow key={cat}>
                              <TableCell className="font-medium capitalize">{cat}</TableCell>
                              {compareResults.map((result, idx) => {
                                if (!result) return null;
                                const catData = result.categories[cat as keyof typeof result.categories];
                                return (
                                  <TableCell key={idx} className="text-center text-sm">
                                    {catData?.percentage?.toFixed(1)}%
                                    <span className="text-muted-foreground text-xs ml-1">({catData?.count})</span>
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </CardContent>
            </Card>
          )}
          
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
                <div className="space-y-4">
                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-4 p-3 bg-muted/50 rounded-lg text-sm">
                    <span className="font-medium">Legend:</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block w-3 h-3 rounded ${getFormalityColor('formal').split(' ')[0]}`}></span>
                      <span>Formal (F-Score ≥50, Perceived 5-7)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block w-3 h-3 rounded ${getFormalityColor('informal').split(' ')[0]}`}></span>
                      <span>Informal (F-Score &lt;50, Perceived 1-3)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block w-3 h-3 rounded ${getFormalityColor('neutral').split(' ')[0]}`}></span>
                      <span>Neutral (Perceived 4)</span>
                    </div>
                  </div>
                  
                  {/* Filters */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Filters:</span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8">
                          Assistant: {filterAssistantType === 'all' ? 'All' : filterAssistantType}
                          <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => setFilterAssistantType('all')}>
                          {filterAssistantType === 'all' && <Check className="h-4 w-4 mr-2" />}
                          All
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterAssistantType('formal')}>
                          {filterAssistantType === 'formal' && <Check className="h-4 w-4 mr-2" />}
                          <Badge className={`${getFormalityColor('formal')} mr-2`}>formal</Badge>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterAssistantType('informal')}>
                          {filterAssistantType === 'informal' && <Check className="h-4 w-4 mr-2" />}
                          <Badge className={`${getFormalityColor('informal')} mr-2`}>informal</Badge>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8">
                          F-Score: {filterFormalityType === 'all' ? 'All' : filterFormalityType}
                          <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => setFilterFormalityType('all')}>
                          {filterFormalityType === 'all' && <Check className="h-4 w-4 mr-2" />}
                          All
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterFormalityType('formal')}>
                          {filterFormalityType === 'formal' && <Check className="h-4 w-4 mr-2" />}
                          <Badge className={`${getFormalityColor('formal')} mr-2`}>≥50 (formal)</Badge>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterFormalityType('informal')}>
                          {filterFormalityType === 'informal' && <Check className="h-4 w-4 mr-2" />}
                          <Badge className={`${getFormalityColor('informal')} mr-2`}>&lt;50 (informal)</Badge>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {(filterAssistantType !== 'all' || filterFormalityType !== 'all') && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8"
                        onClick={() => {
                          setFilterAssistantType('all');
                          setFilterFormalityType('all');
                        }}
                      >
                        Clear filters
                      </Button>
                    )}
                  </div>
                  
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <Button variant="ghost" size="sm" className="h-8 -ml-3 font-medium" onClick={() => handleSort('created_at')}>
                            Date
                            {getSortIcon('created_at')}
                          </Button>
                        </TableHead>
                        <TableHead>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 -ml-3 font-medium gap-1">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="flex items-center gap-1">
                                        Assistant Type
                                        <Info className="h-3 w-3 text-muted-foreground" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      <p>One of the two experimental conditions (formal or informal), determined by the voice assistant prompt used during the call.</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                {getSortIcon('assistant_type')}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => handleSort('assistant_type')}>
                                <ArrowUpDown className="h-4 w-4 mr-2" />
                                Sort
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableHead>
                        <TableHead>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 -ml-3 font-medium gap-1">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="flex items-center gap-1">
                                        F-Score
                                        <Info className="h-3 w-3 text-muted-foreground" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      <p>Calculated using Heylighen & Dewaele's F-measure. Scores ≥50 indicate formal language, &lt;50 indicate informal.</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                {getSortIcon('f_score')}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => handleSort('f_score')}>
                                <ArrowUpDown className="h-4 w-4 mr-2" />
                                Sort
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableHead>
                        <TableHead>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 -ml-3 font-medium gap-1">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="flex items-center gap-1">
                                        Perceived
                                        <Info className="h-3 w-3 text-muted-foreground" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      <p>Participant's self-reported perception on a 1-7 scale: 1-3 = informal, 4 = neutral, 5-7 = formal.</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                {getSortIcon('perceived_formality')}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => handleSort('perceived_formality')}>
                                <ArrowUpDown className="h-4 w-4 mr-2" />
                                Sort
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableHead>
                        <TableHead>
                          <Button variant="ghost" size="sm" className="h-8 -ml-3 font-medium" onClick={() => handleSort('tokens')}>
                            Tokens
                            {getSortIcon('tokens')}
                          </Button>
                        </TableHead>
                        <TableHead>Call ID</TableHead>
                        <TableHead>Prolific ID</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getSortedCalculations().map((calc) => {
                          const expData = calc.linked_call_id ? experimentDataMap.get(calc.linked_call_id) : null;
                          return (
                        <TableRow 
                          key={calc.id} 
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => window.location.href = `/researcher/formality/${calc.id}`}
                        >
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(calc.created_at), 'MMM d, yyyy HH:mm')}
                          </TableCell>
                          <TableCell>
                            {expData?.assistantType ? (
                              <Badge className={getAssistantTypeColor(expData.assistantType)}>
                                {expData.assistantType}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <Badge className={getFormalityColor(getFScoreType(calc.f_score))}>
                                {calc.f_score}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{calc.interpretation_label}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {expData?.formality != null ? (
                              <Badge className={getFormalityColor(getPerceivedFormalityType(expData.formality))}>
                                {expData.formality}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
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
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
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
