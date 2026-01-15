import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Plus, 
  Save, 
  Trash2, 
  GitCompare, 
  ChevronLeft, 
  ChevronRight,
  Copy,
  FileText,
  Edit,
  MoreVertical,
  ArrowLeft,
  ArrowRight,
  Loader2,
  ExternalLink,
  Check,
  Undo2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface VapiPrompt {
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

interface DiffLine {
  lineNumber: number;
  content: string;
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  leftLineNumber?: number;
  rightLineNumber?: number;
}

interface DiffResult {
  left: DiffLine[];
  right: DiffLine[];
  changes: number;
}

const STORAGE_KEY = 'prompt-lab-draft';

export function PromptLab() {
  const { user, isSuperAdmin } = useResearcherAuth();
  const [activeTab, setActiveTab] = useState<'prompts' | 'diff'>('prompts');
  
  // Prompts state
  const [prompts, setPrompts] = useState<VapiPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<VapiPrompt | null>(null);
  
  // Form state
  const [formName, setFormName] = useState('');
  const [formText, setFormText] = useState('');
  const [formCondition, setFormCondition] = useState<'formal' | 'informal'>('formal');
  const [formBatch, setFormBatch] = useState('');
  const [formVapiId, setFormVapiId] = useState('');
  const [formVapiName, setFormVapiName] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Diff state
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');
  const [mergedText, setMergedText] = useState('');
  const [diffPrecision, setDiffPrecision] = useState<'word' | 'character' | 'line'>('line');
  const [showUnchanged, setShowUnchanged] = useState(true);
  const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
  const [selectedLeftPrompt, setSelectedLeftPrompt] = useState<string>('');
  const [selectedRightPrompt, setSelectedRightPrompt] = useState<string>('');
  const [mergedLines, setMergedLines] = useState<Map<number, 'left' | 'right'>>(new Map());
  
  // Undo history for merge actions
  interface MergeHistoryState {
    leftText: string;
    rightText: string;
    mergedText: string;
    mergedLines: Map<number, 'left' | 'right'>;
    selectedLeftPrompt: string;
    selectedRightPrompt: string;
  }
  const [mergeHistory, setMergeHistory] = useState<MergeHistoryState[]>([]);
  
  const saveToHistory = useCallback(() => {
    setMergeHistory(prev => [...prev, {
      leftText,
      rightText,
      mergedText,
      mergedLines: new Map(mergedLines),
      selectedLeftPrompt,
      selectedRightPrompt,
    }]);
  }, [leftText, rightText, mergedText, mergedLines, selectedLeftPrompt, selectedRightPrompt]);
  
  const undoMerge = useCallback(() => {
    if (mergeHistory.length === 0) return;
    
    const lastState = mergeHistory[mergeHistory.length - 1];
    setLeftText(lastState.leftText);
    setRightText(lastState.rightText);
    setMergedText(lastState.mergedText);
    setMergedLines(new Map(lastState.mergedLines));
    setSelectedLeftPrompt(lastState.selectedLeftPrompt);
    setSelectedRightPrompt(lastState.selectedRightPrompt);
    setMergeHistory(prev => prev.slice(0, -1));
  }, [mergeHistory]);
  
  // Filter state
  const [filterCondition, setFilterCondition] = useState<'all' | 'formal' | 'informal'>('all');
  const [filterBatch, setFilterBatch] = useState<string>('all');
  
  // Load prompts from database
  useEffect(() => {
    loadPrompts();
  }, []);
  
  // Auto-save diff state to localStorage
  useEffect(() => {
    const draft = { leftText, rightText, mergedText };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [leftText, rightText, mergedText]);
  
  // Load draft from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { leftText: l, rightText: r, mergedText: m } = JSON.parse(saved);
        if (l) setLeftText(l);
        if (r) setRightText(r);
        if (m) setMergedText(m);
      } catch {}
    }
  }, []);
  
  const loadPrompts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('vapi_prompts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setPrompts((data || []) as VapiPrompt[]);
    } catch (err) {
      console.error('Failed to load prompts:', err);
      toast.error('Failed to load prompts');
    } finally {
      setIsLoading(false);
    }
  };
  
  const resetForm = () => {
    setFormName('');
    setFormText('');
    setFormCondition('formal');
    setFormBatch('');
    setFormVapiId('');
    setFormVapiName('');
    setFormNotes('');
    setEditingPrompt(null);
  };
  
  const openEditDialog = (prompt: VapiPrompt) => {
    setEditingPrompt(prompt);
    setFormName(prompt.name);
    setFormText(prompt.prompt_text);
    setFormCondition(prompt.condition);
    setFormBatch(prompt.batch_label || '');
    setFormVapiId(prompt.vapi_assistant_id || '');
    setFormVapiName(prompt.vapi_assistant_name || '');
    setFormNotes(prompt.notes || '');
    setShowAddDialog(true);
  };
  
  const handleSavePrompt = async () => {
    if (!user || !formName.trim() || !formText.trim()) {
      toast.error('Name and prompt text are required');
      return;
    }
    
    setIsSaving(true);
    try {
      if (editingPrompt) {
        // Update existing
        const { error } = await supabase
          .from('vapi_prompts')
          .update({
            name: formName.trim(),
            prompt_text: formText,
            condition: formCondition,
            batch_label: formBatch.trim() || null,
            vapi_assistant_id: formVapiId.trim() || null,
            vapi_assistant_name: formVapiName.trim() || null,
            notes: formNotes.trim() || null,
          })
          .eq('id', editingPrompt.id);
        
        if (error) throw error;
        toast.success('Prompt updated');
      } else {
        // Create new
        const { error } = await supabase
          .from('vapi_prompts')
          .insert({
            created_by: user.id,
            name: formName.trim(),
            prompt_text: formText,
            condition: formCondition,
            batch_label: formBatch.trim() || null,
            vapi_assistant_id: formVapiId.trim() || null,
            vapi_assistant_name: formVapiName.trim() || null,
            notes: formNotes.trim() || null,
          });
        
        if (error) throw error;
        toast.success('Prompt saved');
      }
      
      setShowAddDialog(false);
      resetForm();
      loadPrompts();
    } catch (err) {
      console.error('Failed to save prompt:', err);
      toast.error('Failed to save prompt');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDeletePrompt = async (id: string) => {
    if (!confirm('Are you sure you want to delete this prompt?')) return;
    
    try {
      const { error } = await supabase
        .from('vapi_prompts')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Prompt deleted');
      loadPrompts();
    } catch (err) {
      console.error('Failed to delete prompt:', err);
      toast.error('Failed to delete prompt');
    }
  };
  
  // Get unique batch labels
  const batchLabels = useMemo(() => {
    const labels = new Set<string>();
    prompts.forEach(p => {
      if (p.batch_label) labels.add(p.batch_label);
    });
    return Array.from(labels).sort();
  }, [prompts]);
  
  // Filter prompts
  const filteredPrompts = useMemo(() => {
    return prompts.filter(p => {
      if (filterCondition !== 'all' && p.condition !== filterCondition) return false;
      if (filterBatch !== 'all' && p.batch_label !== filterBatch) return false;
      return true;
    });
  }, [prompts, filterCondition, filterBatch]);
  
  // Compute diff
  const diffResult = useMemo((): DiffResult => {
    if (!leftText && !rightText) {
      return { left: [], right: [], changes: 0 };
    }
    
    const leftLines = leftText.split('\n');
    const rightLines = rightText.split('\n');
    
    const left: DiffLine[] = [];
    const right: DiffLine[] = [];
    let changes = 0;
    
    const maxLines = Math.max(leftLines.length, rightLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const leftContent = leftLines[i] ?? '';
      const rightContent = rightLines[i] ?? '';
      
      if (leftContent === rightContent) {
        left.push({ lineNumber: i + 1, content: leftContent, type: 'unchanged', leftLineNumber: i + 1 });
        right.push({ lineNumber: i + 1, content: rightContent, type: 'unchanged', rightLineNumber: i + 1 });
      } else if (i >= leftLines.length) {
        left.push({ lineNumber: i + 1, content: '', type: 'removed', leftLineNumber: undefined });
        right.push({ lineNumber: i + 1, content: rightContent, type: 'added', rightLineNumber: i + 1 });
        changes++;
      } else if (i >= rightLines.length) {
        left.push({ lineNumber: i + 1, content: leftContent, type: 'removed', leftLineNumber: i + 1 });
        right.push({ lineNumber: i + 1, content: '', type: 'added', rightLineNumber: undefined });
        changes++;
      } else {
        left.push({ lineNumber: i + 1, content: leftContent, type: 'modified', leftLineNumber: i + 1 });
        right.push({ lineNumber: i + 1, content: rightContent, type: 'modified', rightLineNumber: i + 1 });
        changes++;
      }
    }
    
    return { left, right, changes };
  }, [leftText, rightText]);
  
  // Get change indices for navigation
  const changeIndices = useMemo(() => {
    return diffResult.left
      .map((line, idx) => (line.type !== 'unchanged' ? idx : -1))
      .filter(idx => idx !== -1);
  }, [diffResult]);
  
  const navigateChange = (direction: 'prev' | 'next') => {
    if (changeIndices.length === 0) return;
    
    if (direction === 'next') {
      setCurrentChangeIndex(prev => (prev + 1) % changeIndices.length);
    } else {
      setCurrentChangeIndex(prev => (prev - 1 + changeIndices.length) % changeIndices.length);
    }
  };
  
  const mergeFromLeft = (lineIndex: number) => {
    saveToHistory();
    const leftLines = leftText.split('\n');
    const rightLines = rightText.split('\n');
    const leftLine = diffResult.left[lineIndex]?.content || '';
    
    // Update right side to match left at this line
    if (lineIndex < rightLines.length) {
      rightLines[lineIndex] = leftLine;
    } else {
      while (rightLines.length < lineIndex) {
        rightLines.push('');
      }
      rightLines.push(leftLine);
    }
    
    const newMerged = rightLines.join('\n');
    setRightText(newMerged);
    setMergedText(newMerged);
    setSelectedRightPrompt('');
    setMergedLines(prev => new Map(prev).set(lineIndex, 'left'));
  };
  
  const mergeFromRight = (lineIndex: number) => {
    saveToHistory();
    const leftLines = leftText.split('\n');
    const rightLines = rightText.split('\n');
    const rightLine = diffResult.right[lineIndex]?.content || '';
    
    // Update left side to match right at this line
    if (lineIndex < leftLines.length) {
      leftLines[lineIndex] = rightLine;
    } else {
      while (leftLines.length < lineIndex) {
        leftLines.push('');
      }
      leftLines.push(rightLine);
    }
    
    const newMerged = leftLines.join('\n');
    setLeftText(newMerged);
    setMergedText(newMerged);
    setSelectedLeftPrompt('');
    setMergedLines(prev => new Map(prev).set(lineIndex, 'right'));
  };
  
  const mergeAllFromLeft = () => {
    saveToHistory();
    // Accept all changes from left side
    const newMergedLines = new Map(mergedLines);
    changeIndices.forEach(idx => {
      newMergedLines.set(idx, 'left');
    });
    setRightText(leftText);
    setMergedText(leftText);
    setSelectedRightPrompt('');
    setMergedLines(newMergedLines);
  };
  
  const mergeAllFromRight = () => {
    saveToHistory();
    // Accept all changes from right side
    const newMergedLines = new Map(mergedLines);
    changeIndices.forEach(idx => {
      newMergedLines.set(idx, 'right');
    });
    setLeftText(rightText);
    setMergedText(rightText);
    setSelectedLeftPrompt('');
    setMergedLines(newMergedLines);
  };
  
  // Reset merged lines when texts change from user input
  const handleLeftTextChange = (value: string) => {
    setLeftText(value);
    setSelectedLeftPrompt('');
    setMergedLines(new Map());
  };
  
  const handleRightTextChange = (value: string) => {
    setRightText(value);
    setSelectedRightPrompt('');
    setMergedLines(new Map());
  };
  
  const clearLeft = () => {
    setLeftText('');
    setSelectedLeftPrompt('');
    setMergedLines(new Map());
  };
  
  const clearRight = () => {
    setRightText('');
    setSelectedRightPrompt('');
    setMergedLines(new Map());
  };
  
  const loadPromptToLeft = (promptId: string) => {
    const prompt = prompts.find(p => p.id === promptId);
    if (prompt) {
      setLeftText(prompt.prompt_text);
      setSelectedLeftPrompt(promptId);
    }
  };
  
  const loadPromptToRight = (promptId: string) => {
    const prompt = prompts.find(p => p.id === promptId);
    if (prompt) {
      setRightText(prompt.prompt_text);
      setSelectedRightPrompt(promptId);
    }
  };
  
  const saveMergedAsNew = () => {
    if (!mergedText.trim()) {
      toast.error('Merged text is empty');
      return;
    }
    setFormText(mergedText);
    setFormName('Merged Prompt');
    setShowAddDialog(true);
  };
  
  const getLineClassName = (type: DiffLine['type']) => {
    switch (type) {
      case 'added':
        return 'bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200';
      case 'removed':
        return 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200';
      case 'modified':
        return 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200';
      default:
        return showUnchanged ? '' : 'opacity-30';
    }
  };
  
  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'prompts' | 'diff')}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="prompts" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Prompts Library
            </TabsTrigger>
            <TabsTrigger value="diff" className="flex items-center gap-2">
              <GitCompare className="h-4 w-4" />
              Diff Checker
            </TabsTrigger>
          </TabsList>
          
          {activeTab === 'prompts' && (
            <Dialog open={showAddDialog} onOpenChange={(open) => {
              setShowAddDialog(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Prompt
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingPrompt ? 'Edit Prompt' : 'Add New Prompt'}</DialogTitle>
                  <DialogDescription>
                    Store VAPI assistant prompts with condition and batch metadata
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="prompt-name">Name *</Label>
                      <Input
                        id="prompt-name"
                        placeholder="e.g., Formal V2"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prompt-condition">Condition *</Label>
                      <Select value={formCondition} onValueChange={(v) => setFormCondition(v as 'formal' | 'informal')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="formal">Formal</SelectItem>
                          <SelectItem value="informal">Informal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="prompt-batch">Batch Label</Label>
                      <Input
                        id="prompt-batch"
                        placeholder="e.g., Pilot 1, Wave 2"
                        value={formBatch}
                        onChange={(e) => setFormBatch(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prompt-vapi-id">VAPI Assistant ID</Label>
                      <Input
                        id="prompt-vapi-id"
                        placeholder="e.g., asst_abc123..."
                        value={formVapiId}
                        onChange={(e) => setFormVapiId(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="prompt-vapi-name">VAPI Assistant Name</Label>
                    <Input
                      id="prompt-vapi-name"
                      placeholder="Name as shown in VAPI dashboard"
                      value={formVapiName}
                      onChange={(e) => setFormVapiName(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="prompt-text">Prompt Text *</Label>
                    <Textarea
                      id="prompt-text"
                      placeholder="Paste the full system prompt here..."
                      className="min-h-[300px] font-mono text-sm"
                      value={formText}
                      onChange={(e) => setFormText(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="prompt-notes">Notes</Label>
                    <Textarea
                      id="prompt-notes"
                      placeholder="Any additional notes about this prompt..."
                      className="min-h-[80px]"
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                    />
                  </div>
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSavePrompt} disabled={isSaving}>
                    {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingPrompt ? 'Update' : 'Save'} Prompt
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        
        <TabsContent value="prompts" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Prompts Library</CardTitle>
                  <CardDescription>
                    Manage VAPI assistant prompts organized by condition and batch
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={filterCondition} onValueChange={(v) => setFilterCondition(v as 'all' | 'formal' | 'informal')}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Condition" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Conditions</SelectItem>
                      <SelectItem value="formal">Formal</SelectItem>
                      <SelectItem value="informal">Informal</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterBatch} onValueChange={setFilterBatch}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Batch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Batches</SelectItem>
                      {batchLabels.map(label => (
                        <SelectItem key={label} value={label}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredPrompts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No prompts found. Add your first prompt to get started.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>VAPI ID</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPrompts.map(prompt => (
                      <TableRow key={prompt.id}>
                        <TableCell className="font-medium">{prompt.name}</TableCell>
                        <TableCell>
                          <Badge variant={prompt.condition === 'formal' ? 'default' : 'secondary'}>
                            {prompt.condition}
                          </Badge>
                        </TableCell>
                        <TableCell>{prompt.batch_label || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {prompt.vapi_assistant_id ? (
                            <span className="truncate max-w-[100px] inline-block">
                              {prompt.vapi_assistant_id.substring(0, 12)}...
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell>v{prompt.version}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(prompt.updated_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-background border shadow-lg z-50">
                              <DropdownMenuItem onClick={() => openEditDialog(prompt)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                navigator.clipboard.writeText(prompt.prompt_text);
                                toast.success('Copied to clipboard');
                              }}>
                                <Copy className="h-4 w-4 mr-2" />
                                Copy Text
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                loadPromptToLeft(prompt.id);
                                setActiveTab('diff');
                              }}>
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Load to Diff (Left)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                loadPromptToRight(prompt.id);
                                setActiveTab('diff');
                              }}>
                                <ArrowRight className="h-4 w-4 mr-2" />
                                Load to Diff (Right)
                              </DropdownMenuItem>
                              {isSuperAdmin && (
                                <DropdownMenuItem 
                                  onClick={() => handleDeletePrompt(prompt.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="diff" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle>Prompt Diff Checker</CardTitle>
                  <CardDescription>
                    Compare prompts side by side and merge differences
                  </CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="show-unchanged" className="text-sm">Show unchanged</Label>
                    <Switch
                      id="show-unchanged"
                      checked={showUnchanged}
                      onCheckedChange={setShowUnchanged}
                    />
                  </div>
                  {diffResult.changes > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigateChange('prev')}
                        disabled={changeIndices.length === 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Change {currentChangeIndex + 1} of {diffResult.changes}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigateChange('next')}
                        disabled={changeIndices.length === 0}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Prompt selectors */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Left Prompt</Label>
                  <Select value={selectedLeftPrompt} onValueChange={loadPromptToLeft}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a prompt or paste below" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      {prompts.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.condition}) {p.batch_label ? `- ${p.batch_label}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Right Prompt</Label>
                  <Select value={selectedRightPrompt} onValueChange={loadPromptToRight}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a prompt or paste below" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      {prompts.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.condition}) {p.batch_label ? `- ${p.batch_label}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Side by side diff view */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Original (Left)</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearLeft}
                    >
                      Clear
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Paste or select the first prompt..."
                    className="min-h-[200px] font-mono text-sm"
                    value={leftText}
                    onChange={(e) => handleLeftTextChange(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Modified (Right)</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearRight}
                    >
                      Clear
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Paste or select the second prompt..."
                    className="min-h-[200px] font-mono text-sm"
                    value={rightText}
                    onChange={(e) => handleRightTextChange(e.target.value)}
                  />
                </div>
              </div>
              
              {/* Diff visualization */}
              {(leftText || rightText) && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted px-4 py-2 border-b flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">
                        {diffResult.changes} difference{diffResult.changes !== 1 ? 's' : ''} found
                      </span>
                      {diffResult.changes > 0 && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={mergeAllFromLeft}
                          >
                            <ArrowRight className="h-3 w-3 mr-1" />
                            Accept All Left
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={mergeAllFromRight}
                          >
                            <ArrowLeft className="h-3 w-3 mr-1" />
                            Accept All Right
                          </Button>
                        </div>
                      )}
                      {mergeHistory.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={undoMerge}
                        >
                          <Undo2 className="h-3 w-3 mr-1" />
                          Undo ({mergeHistory.length})
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded bg-red-200 dark:bg-red-900"></span>
                        Removed
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded bg-green-200 dark:bg-green-900"></span>
                        Added
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded bg-amber-200 dark:bg-amber-900"></span>
                        Modified
                      </span>
                    </div>
                  </div>
                  <ScrollArea className="h-[400px]">
                    <div className="grid grid-cols-2">
                      {/* Left side */}
                      <div className="border-r">
                        {diffResult.left.map((line, idx) => (
                          <div
                            key={`left-${idx}`}
                            className={`flex items-stretch text-xs font-mono ${getLineClassName(line.type)} ${
                              changeIndices[currentChangeIndex] === idx ? 'ring-2 ring-primary ring-inset' : ''
                            }`}
                          >
                            <span className="w-10 px-2 py-1 text-right text-muted-foreground bg-muted/50 border-r shrink-0">
                              {line.leftLineNumber || ''}
                            </span>
                            <pre className="flex-1 px-2 py-1 whitespace-pre-wrap break-all">
                              {line.content || ' '}
                              {mergedLines.get(idx) === 'left' && (
                                <Check className="inline-block h-3 w-3 ml-1 text-green-600 dark:text-green-400" />
                              )}
                            </pre>
                            {line.type !== 'unchanged' && !mergedLines.has(idx) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto px-2 py-1 shrink-0"
                                onClick={() => mergeFromLeft(idx)}
                                title="Use this version"
                              >
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                      {/* Right side */}
                      <div>
                        {diffResult.right.map((line, idx) => (
                          <div
                            key={`right-${idx}`}
                            className={`flex items-stretch text-xs font-mono ${getLineClassName(line.type)} ${
                              changeIndices[currentChangeIndex] === idx ? 'ring-2 ring-primary ring-inset' : ''
                            }`}
                          >
                            {line.type !== 'unchanged' && !mergedLines.has(idx) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto px-2 py-1 shrink-0"
                                onClick={() => mergeFromRight(idx)}
                                title="Use this version"
                              >
                                <ArrowLeft className="h-3 w-3" />
                              </Button>
                            )}
                            <span className="w-10 px-2 py-1 text-right text-muted-foreground bg-muted/50 border-r shrink-0">
                              {line.rightLineNumber || ''}
                            </span>
                            <pre className="flex-1 px-2 py-1 whitespace-pre-wrap break-all">
                              {line.content || ' '}
                              {mergedLines.get(idx) === 'right' && (
                                <Check className="inline-block h-3 w-3 ml-1 text-green-600 dark:text-green-400" />
                              )}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              )}
              
              {/* Merged output */}
              {(leftText || rightText) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Merged Output</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setMergedText(leftText)}
                      >
                        Start from Left
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setMergedText(rightText)}
                      >
                        Start from Right
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={saveMergedAsNew}
                        disabled={!mergedText.trim()}
                      >
                        <Save className="h-4 w-4 mr-1" />
                        Save as New Prompt
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    placeholder="Click merge buttons above to build your merged prompt, or edit directly..."
                    className="min-h-[200px] font-mono text-sm"
                    value={mergedText}
                    onChange={(e) => setMergedText(e.target.value)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
