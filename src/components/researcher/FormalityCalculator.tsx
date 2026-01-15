import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Upload, 
  FileText, 
  Download, 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp,
  Copy,
  Check,
  Info
} from 'lucide-react';
import {
  FScoreResult,
  PerTurnResult,
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

export function FormalityCalculator() {
  // Input state
  const [mode, setMode] = useState<'csv' | 'manual'>('manual');
  const [manualText, setManualText] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvTranscripts, setCsvTranscripts] = useState<string[]>([]);
  
  // Options
  const [aiOnly, setAiOnly] = useState(false);
  const [perTurnScoring, setPerTurnScoring] = useState(false);
  
  // Results state
  const [results, setResults] = useState<FScoreResult[]>([]);
  const [perTurnResults, setPerTurnResults] = useState<PerTurnResult[]>([]);
  const [averageScore, setAverageScore] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  // UI state
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [showReproducibility, setShowReproducibility] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileUpload = useCallback(async (file: File) => {
    setError(null);
    setCsvFile(file);
    
    const content = await file.text();
    const { transcripts, error: parseError } = parseCSV(content);
    
    if (parseError) {
      setError(parseError);
      setCsvTranscripts([]);
      return;
    }
    
    setCsvTranscripts(transcripts);
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
  
  const processInBatches = async (transcripts: string[], batchSize: number = 10) => {
    const allResults: FScoreResult[] = [];
    
    for (let i = 0; i < transcripts.length; i += batchSize) {
      const batch = transcripts.slice(i, i + batchSize);
      
      for (let j = 0; j < batch.length; j++) {
        const result = processTranscript(batch[j], aiOnly, i + j);
        allResults.push(result);
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
          setResults([result]);
        }
      } else {
        if (csvTranscripts.length === 0) {
          setError('No transcripts found in CSV');
          setIsProcessing(false);
          return;
        }
        
        const processedResults = await processInBatches(csvTranscripts);
        setResults(processedResults);
      }
    } catch (err) {
      setError(`Processing error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    
    setIsProcessing(false);
    setProgress(100);
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
          ) : (
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
                CSV must have a column named "Transcript"
              </p>
              {csvFile && (
                <div className="mt-4 p-2 bg-muted rounded">
                  <p className="text-sm font-medium">{csvFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {csvTranscripts.length} transcripts found
                  </p>
                </div>
              )}
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
                    isExpanded={expandedResults.has(idx)}
                    onToggle={() => toggleResultExpansion(idx)}
                    getInterpretationColor={getInterpretationColor}
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
}

function ResultCard({ result, title, subtitle, isExpanded, onToggle, getInterpretationColor }: ResultCardProps) {
  return (
    <div className="border rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium">{title}</h4>
          {subtitle && (
            <p className="text-sm text-muted-foreground truncate max-w-md">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
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
