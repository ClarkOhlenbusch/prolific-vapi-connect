import type { CSSProperties, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, Bug, ChevronRight, GripVertical, Lightbulb, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import type { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type BacklogItem = Tables<'researcher_backlog_items'>;
type BacklogItemType = 'error' | 'feature';
type ErrorStatus = 'open' | 'in_progress' | 'resolved';
type FeatureStatus = 'idea' | 'planned' | 'in_progress' | 'shipped';
type BacklogStatus = ErrorStatus | FeatureStatus;
type BacklogPriority = 'low' | 'medium' | 'high' | 'critical';

type FormState = {
  itemType: BacklogItemType;
  title: string;
  details: string;
  status: BacklogStatus;
  priority: BacklogPriority;
  linkedResponseId: string;
};

const DEFAULT_FORM: FormState = {
  itemType: 'error',
  title: '',
  details: '',
  status: 'open',
  priority: 'medium',
  linkedResponseId: '',
};

const STATUS_OPTIONS: Record<BacklogItemType, Array<{ value: BacklogStatus; label: string }>> = {
  error: [
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'resolved', label: 'Resolved' },
  ],
  feature: [
    { value: 'idea', label: 'Idea' },
    { value: 'planned', label: 'Planned' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'shipped', label: 'Shipped' },
  ],
};

const STATUS_LABEL: Record<BacklogStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  idea: 'Idea',
  planned: 'Planned',
  shipped: 'Shipped',
};

const PRIORITY_LABEL: Record<BacklogPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const ITEM_TYPE_LABEL: Record<BacklogItemType, string> = {
  error: 'Error',
  feature: 'Future Feature',
};

const PRIORITY_BADGE_CLASS: Record<BacklogPriority, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_EXTRACT_REGEX = /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const parseLinkedResponseId = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const match = trimmed.match(UUID_EXTRACT_REGEX);
  return match?.[1]?.toLowerCase() ?? '';
};

const hasInvalidLinkedResponseInput = (value: string): boolean => {
  const trimmed = value.trim();
  return Boolean(trimmed) && !parseLinkedResponseId(trimmed);
};

const isStatusAllowed = (itemType: BacklogItemType, status: BacklogStatus): boolean => {
  return STATUS_OPTIONS[itemType].some((option) => option.value === status);
};

const toFormState = (item: BacklogItem): FormState => ({
  itemType: item.item_type as BacklogItemType,
  title: item.title,
  details: item.details,
  status: item.status as BacklogStatus,
  priority: item.priority as BacklogPriority,
  linkedResponseId: item.linked_response_id ?? '',
});

const sortByDisplayOrder = (a: BacklogItem, b: BacklogItem): number => {
  if (a.display_order !== b.display_order) return a.display_order - b.display_order;
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
};

const getNextDisplayOrder = (items: BacklogItem[], itemType: BacklogItemType): number => {
  const filtered = items.filter((item) => item.item_type === itemType);
  if (filtered.length === 0) return 0;
  return Math.max(...filtered.map((item) => item.display_order)) + 1;
};

const SortableBacklogCard = ({
  id,
  enabled,
  children,
}: {
  id: string;
  enabled: boolean;
  children: ReactNode;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !enabled,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex justify-end">
        <button
          type="button"
          className={`inline-flex items-center rounded-sm p-1 mb-1 ${
            enabled ? 'cursor-grab active:cursor-grabbing hover:bg-muted' : 'cursor-default opacity-40'
          }`}
          aria-label="Drag backlog item"
          disabled={!enabled}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  );
};

const ResearcherErrorLog = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isSuperAdmin, isGuestMode } = useResearcherAuth();

  const [typeFilter, setTypeFilter] = useState<'all' | BacklogItemType>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(DEFAULT_FORM);
  const [editForm, setEditForm] = useState<FormState>(DEFAULT_FORM);
  const [editingItem, setEditingItem] = useState<BacklogItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['researcher-backlog-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('researcher_backlog_items')
        .select('*')
        .order('display_order', { ascending: true })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as BacklogItem[];
    },
  });

  const linkedResponseIds = useMemo(
    () => Array.from(new Set(items.map((item) => item.linked_response_id).filter((id): id is string => Boolean(id)))),
    [items],
  );

  const { data: linkedResponses = [] } = useQuery({
    queryKey: ['researcher-backlog-linked-responses', linkedResponseIds],
    enabled: linkedResponseIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('experiment_responses')
        .select('id, prolific_id')
        .in('id', linkedResponseIds);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; prolific_id: string | null }>;
    },
  });

  const linkedProlificByResponseId = useMemo(
    () => new Map(linkedResponses.map((row) => [row.id, row.prolific_id])),
    [linkedResponses],
  );

  const errors = useMemo(
    () => items.filter((item) => item.item_type === 'error').sort(sortByDisplayOrder),
    [items],
  );

  const features = useMemo(
    () => items.filter((item) => item.item_type === 'feature').sort(sortByDisplayOrder),
    [items],
  );

  const createMutation = useMutation({
    mutationFn: async (payload: FormState) => {
      if (!user?.id) throw new Error('No authenticated user found');
      const displayOrder = getNextDisplayOrder(items, payload.itemType);
      const linkedResponseId = parseLinkedResponseId(payload.linkedResponseId);

      const { error } = await supabase.from('researcher_backlog_items').insert({
        item_type: payload.itemType,
        title: payload.title.trim(),
        details: payload.details.trim(),
        status: payload.status,
        priority: payload.priority,
        linked_response_id: linkedResponseId || null,
        display_order: displayOrder,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setCreateForm(DEFAULT_FORM);
      setIsCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['researcher-backlog-items'] });
      toast.success('Backlog item created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create backlog item');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<FormState> & { displayOrder?: number };
    }) => {
      const updatePayload: Record<string, string | number | null> = {};
      if (payload.itemType !== undefined) updatePayload.item_type = payload.itemType;
      if (payload.title !== undefined) updatePayload.title = payload.title.trim();
      if (payload.details !== undefined) updatePayload.details = payload.details.trim();
      if (payload.status !== undefined) updatePayload.status = payload.status;
      if (payload.priority !== undefined) updatePayload.priority = payload.priority;
      if (payload.linkedResponseId !== undefined) {
        updatePayload.linked_response_id = parseLinkedResponseId(payload.linkedResponseId) || null;
      }
      if (payload.displayOrder !== undefined) {
        updatePayload.display_order = payload.displayOrder;
      }

      const { error } = await supabase.from('researcher_backlog_items').update(updatePayload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['researcher-backlog-items'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update backlog item');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('researcher_backlog_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['researcher-backlog-items'] });
      toast.success('Backlog item deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete backlog item');
    },
  });

  const validateForm = (form: FormState): boolean => {
    if (!form.title.trim()) {
      toast.error('Title is required');
      return false;
    }
    if (hasInvalidLinkedResponseInput(form.linkedResponseId)) {
      toast.error('Paste a valid response URL or UUID');
      return false;
    }
    if (!isStatusAllowed(form.itemType, form.status)) {
      toast.error(`${ITEM_TYPE_LABEL[form.itemType]} status is invalid`);
      return false;
    }
    return true;
  };

  const handleCreate = () => {
    if (!validateForm(createForm)) return;
    createMutation.mutate(createForm);
  };

  const openEditDialog = (item: BacklogItem) => {
    setEditingItem(item);
    setEditForm(toFormState(item));
    setIsEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    if (!validateForm(editForm)) return;

    const nextDisplayOrder =
      editingItem.item_type === editForm.itemType
        ? undefined
        : getNextDisplayOrder(items.filter((item) => item.id !== editingItem.id), editForm.itemType);

    updateMutation.mutate(
      { id: editingItem.id, payload: { ...editForm, displayOrder: nextDisplayOrder } },
      {
        onSuccess: () => {
          setIsEditOpen(false);
          setEditingItem(null);
          toast.success('Backlog item updated');
        },
      },
    );
  };

  const handleStatusChange = (item: BacklogItem, status: BacklogStatus) => {
    if (!isStatusAllowed(item.item_type as BacklogItemType, status)) {
      toast.error('Invalid status for this item type');
      return;
    }
    updateMutation.mutate(
      { id: item.id, payload: { status } },
      {
        onSuccess: () => {
          toast.success(`Marked as ${STATUS_LABEL[status]}`);
        },
      },
    );
  };

  const handleDelete = (item: BacklogItem) => {
    if (!isSuperAdmin) return;
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    deleteMutation.mutate(item.id);
  };

  const persistReorder = async (orderedIds: string[]) => {
    for (let index = 0; index < orderedIds.length; index += 1) {
      const id = orderedIds[index];
      const { error } = await supabase.from('researcher_backlog_items').update({ display_order: index }).eq('id', id);
      if (error) throw error;
    }
  };

  const handleDragEnd = async (event: DragEndEvent, itemType: BacklogItemType) => {
    if (isReadOnly || updateMutation.isPending) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const groupItems = itemType === 'error' ? errors : features;
    const oldIndex = groupItems.findIndex((item) => item.id === active.id);
    const newIndex = groupItems.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(groupItems, oldIndex, newIndex);
    const idToOrder = new Map(reordered.map((item, index) => [item.id, index]));

    const previous = queryClient.getQueryData<BacklogItem[]>(['researcher-backlog-items']);
    queryClient.setQueryData<BacklogItem[]>(['researcher-backlog-items'], (current) => {
      if (!current) return current;
      return current.map((item) => {
        const nextOrder = idToOrder.get(item.id);
        if (nextOrder === undefined) return item;
        return { ...item, display_order: nextOrder };
      });
    });

    try {
      await persistReorder(reordered.map((item) => item.id));
      queryClient.invalidateQueries({ queryKey: ['researcher-backlog-items'] });
    } catch (error) {
      queryClient.setQueryData(['researcher-backlog-items'], previous);
      toast.error(error instanceof Error ? error.message : 'Failed to save new order');
    }
  };

  const renderLane = (itemType: BacklogItemType, laneItems: BacklogItem[]) => (
    <Card key={itemType}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {itemType === 'error' ? <Bug className="h-4 w-4" /> : <Lightbulb className="h-4 w-4" />}
          {ITEM_TYPE_LABEL[itemType]}s ({laneItems.length})
        </CardTitle>
        <CardDescription>
          Drag to reorder within this lane.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {laneItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items in this lane.</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => {
              void handleDragEnd(event, itemType);
            }}
          >
            <SortableContext items={laneItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {laneItems.map((item) => (
                  <SortableBacklogCard key={item.id} id={item.id} enabled={!isReadOnly && !updateMutation.isPending}>
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">Updated {formatDateTime(item.updated_at)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={PRIORITY_BADGE_CLASS[item.priority as BacklogPriority] ?? PRIORITY_BADGE_CLASS.medium}>
                            {PRIORITY_LABEL[item.priority as BacklogPriority] ?? item.priority}
                          </Badge>
                          <Badge variant="outline">{STATUS_LABEL[item.status as BacklogStatus] ?? item.status}</Badge>
                        </div>
                      </div>

                      {item.details && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.details}</p>}

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{ITEM_TYPE_LABEL[item.item_type as BacklogItemType]}</span>
                        <span>•</span>
                        {item.linked_response_id ? (
                          <Button
                            variant="link"
                            className="h-auto p-0 text-xs"
                            onClick={() => navigate(`/researcher/response/${item.linked_response_id}`)}
                          >
                            {linkedProlificByResponseId.get(item.linked_response_id) ?? 'Linked response'}
                          </Button>
                        ) : (
                          <span>No linked response</span>
                        )}
                        {item.completed_at && (
                          <>
                            <span>•</span>
                            <span>Completed {formatDateTime(item.completed_at)}</span>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={item.status}
                          onValueChange={(value) => handleStatusChange(item, value as BacklogStatus)}
                          disabled={isReadOnly || updateMutation.isPending}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS[item.item_type as BacklogItemType].map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button variant="outline" size="sm" onClick={() => openEditDialog(item)} disabled={isReadOnly}>
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>

                        {isSuperAdmin && (
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(item)} disabled={deleteMutation.isPending || isReadOnly}>
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  </SortableBacklogCard>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );

  const isReadOnly = isGuestMode;
  const lanes =
    typeFilter === 'all'
      ? ([['error', errors], ['feature', features]] as const)
      : typeFilter === 'error'
        ? ([['error', errors]] as const)
        : ([['feature', features]] as const);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/researcher/dashboard')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <ChevronRight className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Backlog</h1>
              <p className="text-sm text-muted-foreground">Errors and future features in one shared workflow</p>
            </div>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} disabled={isReadOnly}>
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {isGuestMode && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Guest mode is read-only on this page.</p>
            </CardContent>
          </Card>
        )}

        <Tabs value={typeFilter} onValueChange={(value) => setTypeFilter(value as 'all' | BacklogItemType)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="error">Errors</TabsTrigger>
            <TabsTrigger value="feature">Future Features</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Loading backlog items...</p>
            </CardContent>
          </Card>
        ) : (
          <div className={typeFilter === 'all' ? 'grid gap-6 lg:grid-cols-2' : 'space-y-6'}>
            {lanes.map(([laneType, laneItems]) => renderLane(laneType, laneItems))}
          </div>
        )}
      </main>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Backlog Item</DialogTitle>
            <DialogDescription>Create a new error or future feature.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select
                  value={createForm.itemType}
                  onValueChange={(value) => {
                    const itemType = value as BacklogItemType;
                    const defaultStatus = STATUS_OPTIONS[itemType][0].value;
                    setCreateForm((prev) => ({ ...prev, itemType, status: defaultStatus }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="feature">Future Feature</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Status</Label>
                <Select
                  value={createForm.status}
                  onValueChange={(value) => setCreateForm((prev) => ({ ...prev, status: value as BacklogStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS[createForm.itemType].map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="new-title">Title</Label>
              <Input
                id="new-title"
                value={createForm.title}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Short summary"
              />
            </div>

            <div>
              <Label htmlFor="new-details">Details</Label>
              <Textarea
                id="new-details"
                value={createForm.details}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, details: e.target.value }))}
                placeholder="Context, impact, and notes"
                rows={5}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select
                  value={createForm.priority}
                  onValueChange={(value) => setCreateForm((prev) => ({ ...prev, priority: value as BacklogPriority }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="new-linked-response">Linked Response (optional)</Label>
                <Input
                  id="new-linked-response"
                  value={createForm.linkedResponseId}
                  onChange={(e) => {
                    const parsed = parseLinkedResponseId(e.target.value);
                    setCreateForm((prev) => ({ ...prev, linkedResponseId: parsed || e.target.value }));
                  }}
                  placeholder="Paste response URL or UUID"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Backlog Item</DialogTitle>
            <DialogDescription>Update type, status, priority, and linked response.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select
                  value={editForm.itemType}
                  onValueChange={(value) => {
                    const itemType = value as BacklogItemType;
                    const currentStatus = editForm.status;
                    const safeStatus = isStatusAllowed(itemType, currentStatus) ? currentStatus : STATUS_OPTIONS[itemType][0].value;
                    setEditForm((prev) => ({ ...prev, itemType, status: safeStatus }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="feature">Future Feature</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(value) => setEditForm((prev) => ({ ...prev, status: value as BacklogStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS[editForm.itemType].map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="edit-details">Details</Label>
              <Textarea
                id="edit-details"
                value={editForm.details}
                onChange={(e) => setEditForm((prev) => ({ ...prev, details: e.target.value }))}
                rows={5}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select
                  value={editForm.priority}
                  onValueChange={(value) => setEditForm((prev) => ({ ...prev, priority: value as BacklogPriority }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="edit-linked-response">Linked Response (optional)</Label>
                <Input
                  id="edit-linked-response"
                  value={editForm.linkedResponseId}
                  onChange={(e) => {
                    const parsed = parseLinkedResponseId(e.target.value);
                    setEditForm((prev) => ({ ...prev, linkedResponseId: parsed || e.target.value }));
                  }}
                  placeholder="Paste response URL or UUID"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditOpen(false);
                setEditingItem(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ResearcherErrorLog;
