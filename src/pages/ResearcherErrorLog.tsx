import type { CSSProperties, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, Bug, ChevronDown, ChevronRight, ChevronUp, GripVertical, Lightbulb, Link2, MessageSquare, Pencil, Plus, Trash2, X } from 'lucide-react';
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type BacklogItem = Tables<'researcher_backlog_items'>;
type BacklogItemComment = Tables<'backlog_item_comments'>;
type BacklogItemLink = Tables<'backlog_item_responses'>;
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
  const [deleteTarget, setDeleteTarget] = useState<BacklogItem | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});

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

  const { data: allComments = [] } = useQuery({
    queryKey: ['backlog-item-comments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('backlog_item_comments')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as BacklogItemComment[];
    },
  });

  const { data: allItemLinks = [] } = useQuery({
    queryKey: ['backlog-item-links'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('backlog_item_responses')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as BacklogItemLink[];
    },
  });

  const allLinkResponseIds = useMemo(
    () => Array.from(new Set(allItemLinks.map((l) => l.response_id))),
    [allItemLinks],
  );

  const { data: linkedResponsesForLinks = [] } = useQuery({
    queryKey: ['backlog-item-link-responses', allLinkResponseIds],
    enabled: allLinkResponseIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('experiment_responses')
        .select('id, prolific_id')
        .in('id', allLinkResponseIds);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; prolific_id: string | null }>;
    },
  });

  const linkedProlificForLinks = useMemo(
    () => new Map(linkedResponsesForLinks.map((row) => [row.id, row.prolific_id])),
    [linkedResponsesForLinks],
  );

  const commentsByItemId = useMemo(() => {
    const map = new Map<string, BacklogItemComment[]>();
    for (const comment of allComments) {
      if (!map.has(comment.backlog_item_id)) map.set(comment.backlog_item_id, []);
      map.get(comment.backlog_item_id)!.push(comment);
    }
    return map;
  }, [allComments]);

  const linksByItemId = useMemo(() => {
    const map = new Map<string, BacklogItemLink[]>();
    for (const link of allItemLinks) {
      if (!map.has(link.backlog_item_id)) map.set(link.backlog_item_id, []);
      map.get(link.backlog_item_id)!.push(link);
    }
    return map;
  }, [allItemLinks]);

  const errors = useMemo(
    () => items
      .filter((item) => item.item_type === 'error')
      .filter((item) => showResolved || item.status !== 'resolved')
      .sort(sortByDisplayOrder),
    [items, showResolved],
  );

  const features = useMemo(
    () => items
      .filter((item) => item.item_type === 'feature')
      .filter((item) => showResolved || item.status !== 'shipped')
      .sort(sortByDisplayOrder),
    [items, showResolved],
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

  const addCommentMutation = useMutation({
    mutationFn: async ({ itemId, text }: { itemId: string; text: string }) => {
      if (!user?.id) throw new Error('No authenticated user found');
      const { error } = await supabase.from('backlog_item_comments').insert({
        backlog_item_id: itemId,
        text: text.trim(),
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlog-item-comments'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add comment');
    },
  });

  const removeCommentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('backlog_item_comments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlog-item-comments'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove comment');
    },
  });

  const addLinkMutation = useMutation({
    mutationFn: async ({ itemId, responseId }: { itemId: string; responseId: string }) => {
      const { error } = await supabase.from('backlog_item_responses').insert({
        backlog_item_id: itemId,
        response_id: responseId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlog-item-links'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to link response');
    },
  });

  const removeLinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('backlog_item_responses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlog-item-links'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove link');
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
    setDeleteTarget(item);
  };

  const openCreateDialog = (itemType: BacklogItemType) => {
    const defaultStatus = STATUS_OPTIONS[itemType][0].value;
    setCreateForm({ ...DEFAULT_FORM, itemType, status: defaultStatus });
    setIsCreateOpen(true);
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

  const renderLane = (itemType: BacklogItemType, laneItems: BacklogItem[]) => {
    const totalCount = items.filter((item) => item.item_type === itemType).length;
    return (
    <Card key={itemType}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            {itemType === 'error' ? <Bug className="h-4 w-4" /> : <Lightbulb className="h-4 w-4" />}
            {ITEM_TYPE_LABEL[itemType]}s ({laneItems.length}{totalCount !== laneItems.length ? `/${totalCount}` : ''})
          </CardTitle>
          {!isReadOnly && (
            <Button size="sm" variant="outline" onClick={() => openCreateDialog(itemType)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add {itemType === 'error' ? 'Error' : 'Feature'}
            </Button>
          )}
        </div>
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

                      {/* Expandable: Comments & Extra Linked Responses */}
                      {(() => {
                        const itemComments = commentsByItemId.get(item.id) ?? [];
                        const itemLinks = linksByItemId.get(item.id) ?? [];
                        const totalCount = itemComments.length + itemLinks.length;
                        const isExpanded = expandedItemId === item.id;
                        return (
                          <div className="border-t pt-2">
                            <button
                              type="button"
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                            >
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              <span>Comments &amp; Links</span>
                              {totalCount > 0 && (
                                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">{totalCount}</span>
                              )}
                            </button>

                            {isExpanded && (
                              <div className="mt-3 space-y-4">
                                {/* Extra Linked Responses */}
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                                    <Link2 className="h-3 w-3" /> Extra Linked Responses
                                  </p>
                                  {itemLinks.length === 0 && (
                                    <p className="text-xs text-muted-foreground">None linked yet.</p>
                                  )}
                                  <div className="space-y-1">
                                    {itemLinks.map((link) => (
                                      <div key={link.id} className="flex items-center gap-2">
                                        <Button
                                          variant="link"
                                          className="h-auto p-0 text-xs"
                                          onClick={() => navigate(`/researcher/response/${link.response_id}`)}
                                        >
                                          {linkedProlificForLinks.get(link.response_id) ?? `${link.response_id.slice(0, 8)}…`}
                                        </Button>
                                        {!isReadOnly && (
                                          <button
                                            type="button"
                                            aria-label="Remove link"
                                            className="text-muted-foreground hover:text-destructive transition-colors"
                                            onClick={() => removeLinkMutation.mutate(link.id)}
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  {!isReadOnly && (
                                    <div className="flex gap-2">
                                      <Input
                                        className="h-7 text-xs"
                                        placeholder="Paste response URL or UUID"
                                        value={linkDrafts[item.id] ?? ''}
                                        onChange={(e) => setLinkDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                      />
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-xs shrink-0"
                                        disabled={addLinkMutation.isPending || !linkDrafts[item.id]?.trim()}
                                        onClick={() => {
                                          const responseId = parseLinkedResponseId(linkDrafts[item.id] ?? '');
                                          if (!responseId) { toast.error('Paste a valid response URL or UUID'); return; }
                                          addLinkMutation.mutate(
                                            { itemId: item.id, responseId },
                                            { onSuccess: () => setLinkDrafts((prev) => ({ ...prev, [item.id]: '' })) },
                                          );
                                        }}
                                      >
                                        <Link2 className="h-3 w-3 mr-1" /> Link
                                      </Button>
                                    </div>
                                  )}
                                </div>

                                {/* Comments */}
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                                    <MessageSquare className="h-3 w-3" /> Comments ({itemComments.length})
                                  </p>
                                  {itemComments.length === 0 && (
                                    <p className="text-xs text-muted-foreground">No comments yet.</p>
                                  )}
                                  <div className="space-y-2">
                                    {itemComments.map((comment) => (
                                      <div key={comment.id} className="rounded bg-muted/50 p-2 text-xs space-y-1">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-muted-foreground">
                                            {comment.created_by === user?.id ? 'You' : 'Researcher'} · {formatDateTime(comment.created_at)}
                                          </span>
                                          {isSuperAdmin && (
                                            <button
                                              type="button"
                                              aria-label="Delete comment"
                                              className="text-muted-foreground hover:text-destructive transition-colors"
                                              onClick={() => removeCommentMutation.mutate(comment.id)}
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          )}
                                        </div>
                                        <p className="whitespace-pre-wrap">{comment.text}</p>
                                      </div>
                                    ))}
                                  </div>
                                  {!isReadOnly && (
                                    <div className="flex gap-2">
                                      <Input
                                        className="h-7 text-xs"
                                        placeholder="Add a comment… (Enter to post)"
                                        value={commentDrafts[item.id] ?? ''}
                                        onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            const text = commentDrafts[item.id]?.trim();
                                            if (!text) return;
                                            addCommentMutation.mutate(
                                              { itemId: item.id, text },
                                              { onSuccess: () => setCommentDrafts((prev) => ({ ...prev, [item.id]: '' })) },
                                            );
                                          }
                                        }}
                                      />
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-xs shrink-0"
                                        disabled={addCommentMutation.isPending || !commentDrafts[item.id]?.trim()}
                                        onClick={() => {
                                          const text = commentDrafts[item.id]?.trim();
                                          if (!text) return;
                                          addCommentMutation.mutate(
                                            { itemId: item.id, text },
                                            { onSuccess: () => setCommentDrafts((prev) => ({ ...prev, [item.id]: '' })) },
                                          );
                                        }}
                                      >
                                        Post
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </SortableBacklogCard>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );};

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
          <div className="flex items-center gap-2">
            <Switch
              id="show-resolved"
              checked={showResolved}
              onCheckedChange={setShowResolved}
            />
            <Label htmlFor="show-resolved" className="text-sm cursor-pointer">Show resolved</Label>
          </div>
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

        {/* Dev Changes Summary — researcher-only */}
        {!isGuestMode && (
          <Card>
            <CardHeader className="pb-2">
              <button
                type="button"
                className="flex items-center justify-between w-full text-left"
                onClick={() => setSummaryOpen((prev) => !prev)}
              >
                <CardTitle className="text-sm font-semibold">Dev Changes Summary</CardTitle>
                {summaryOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
            </CardHeader>
            {summaryOpen && (
              <CardContent className="pt-0">
                <ol className="space-y-2 text-sm">
                  {[
                    { n: 1, label: 'Multiple responses per backlog item (comments + linked)', status: '✅ Implemented', verify: 'Click "Comments & Links" toggle on any card — add comments or link extra responses inline.' },
                    { n: 2, label: 'Toggle to show resolved/shipped items', status: '✅ Implemented', verify: 'Toggle "Show resolved" switch in the header — resolved errors and shipped features appear/disappear' },
                    { n: 3, label: 'Delete confirmation modal', status: '✅ Implemented', verify: 'Click Delete on any item — a proper modal appears instead of the browser confirm dialog' },
                    { n: 4, label: 'Filter responses by flagged/reviewed', status: '✅ Implemented', verify: 'Go to Dashboard → Responses tab → Flag and Reviewed dropdowns in filter bar' },
                    { n: 5, label: 'Add Error / Add Feature per-column buttons', status: '✅ Implemented', verify: '"Add Error" in the Errors lane header, "Add Feature" in the Features lane header' },
                    { n: 6, label: 'URL renamed to /researcher/backlog', status: '✅ Implemented', verify: 'Navigate to /researcher/backlog — this page loads. Old /researcher/error-log is now a 404' },
                  ].map(({ n, label, status, verify }) => (
                    <li key={n} className="flex flex-col gap-0.5 border-b last:border-0 pb-2 last:pb-0">
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground w-4 shrink-0">{n}.</span>
                        <span className="font-medium flex-1">{label}</span>
                        <span className="shrink-0">{status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground pl-6">{verify}</p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            )}
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

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete backlog item?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.title}&rdquo;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
