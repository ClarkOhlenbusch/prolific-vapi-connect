import type { CSSProperties, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, Bug, ChevronDown, ChevronRight, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

type ErrorLogItem = Tables<'error_log_items'>;
type ErrorStatus = 'open' | 'in_progress' | 'resolved';
type ErrorPriority = 'low' | 'medium' | 'high' | 'critical';
type ItemGroup = 'active' | 'resolved';

type FormState = {
  title: string;
  details: string;
  status: ErrorStatus;
  priority: ErrorPriority;
  changelogVersionRef: string;
  responseId: string;
};

const DEFAULT_FORM: FormState = {
  title: '',
  details: '',
  status: 'open',
  priority: 'medium',
  changelogVersionRef: '',
  responseId: '',
};

const STATUS_LABEL: Record<ErrorStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
};

const PRIORITY_LABEL: Record<ErrorPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const PRIORITY_BADGE_CLASS: Record<ErrorPriority, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toFormState(item: ErrorLogItem): FormState {
  return {
    title: item.title,
    details: item.details,
    status: item.status as ErrorStatus,
    priority: item.priority as ErrorPriority,
    changelogVersionRef: item.changelog_version_ref ?? '',
    responseId: item.response_id ?? '',
  };
}

function sortByDisplayOrder(a: ErrorLogItem, b: ErrorLogItem): number {
  if (a.display_order !== b.display_order) return a.display_order - b.display_order;
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const getGroupForStatus = (status: ErrorStatus): ItemGroup => (status === 'resolved' ? 'resolved' : 'active');

const getNextDisplayOrder = (items: ErrorLogItem[], group: ItemGroup): number => {
  const groupItems = items.filter((item) => getGroupForStatus(item.status as ErrorStatus) === group);
  if (groupItems.length === 0) return 0;
  return Math.max(...groupItems.map((item) => item.display_order)) + 1;
};

const isValidOptionalUuid = (value: string): boolean => !value.trim() || UUID_REGEX.test(value.trim());

const SortableErrorCard = ({
  id,
  enabled,
  children,
  className,
}: {
  id: string;
  enabled: boolean;
  children: ReactNode;
  className?: string;
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
    <div ref={setNodeRef} style={style} className={className}>
      <div className="flex justify-end">
        <button
          type="button"
          className={`inline-flex items-center rounded-sm p-1 mb-1 ${
            enabled ? 'cursor-grab active:cursor-grabbing hover:bg-muted' : 'cursor-default opacity-40'
          }`}
          aria-label="Drag error log item"
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

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(DEFAULT_FORM);
  const [editForm, setEditForm] = useState<FormState>(DEFAULT_FORM);
  const [editingItem, setEditingItem] = useState<ErrorLogItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['error-log-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('error_log_items')
        .select('*')
        .order('display_order', { ascending: true })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as ErrorLogItem[];
    },
  });

  const activeItems = useMemo(
    () => items.filter((item) => item.status !== 'resolved').sort(sortByDisplayOrder),
    [items],
  );

  const resolvedItems = useMemo(
    () => items.filter((item) => item.status === 'resolved').sort(sortByDisplayOrder),
    [items],
  );

  const createMutation = useMutation({
    mutationFn: async (payload: FormState) => {
      if (!user?.id) throw new Error('No authenticated user found');
      const statusGroup = getGroupForStatus(payload.status);
      const displayOrder = getNextDisplayOrder(items, statusGroup);

      const { error } = await supabase.from('error_log_items').insert({
        title: payload.title.trim(),
        details: payload.details.trim(),
        status: payload.status,
        priority: payload.priority,
        changelog_version_ref: payload.changelogVersionRef.trim() || null,
        response_id: payload.responseId.trim() || null,
        display_order: displayOrder,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setCreateForm(DEFAULT_FORM);
      setIsCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['error-log-items'] });
      toast.success('Error log item created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create error log item');
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
      if (payload.title !== undefined) updatePayload.title = payload.title.trim();
      if (payload.details !== undefined) updatePayload.details = payload.details.trim();
      if (payload.status !== undefined) updatePayload.status = payload.status;
      if (payload.priority !== undefined) updatePayload.priority = payload.priority;
      if (payload.changelogVersionRef !== undefined) {
        updatePayload.changelog_version_ref = payload.changelogVersionRef.trim() || null;
      }
      if (payload.responseId !== undefined) {
        updatePayload.response_id = payload.responseId.trim() || null;
      }
      if (payload.displayOrder !== undefined) {
        updatePayload.display_order = payload.displayOrder;
      }

      const { error } = await supabase.from('error_log_items').update(updatePayload).eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['error-log-items'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update error log item');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('error_log_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['error-log-items'] });
      toast.success('Error log item deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete error log item');
    },
  });

  const handleCreate = () => {
    if (!createForm.title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!isValidOptionalUuid(createForm.responseId)) {
      toast.error('Response ID must be a valid UUID');
      return;
    }
    createMutation.mutate(createForm);
  };

  const openEditDialog = (item: ErrorLogItem) => {
    setEditingItem(item);
    setEditForm(toFormState(item));
    setIsEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    if (!editForm.title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!isValidOptionalUuid(editForm.responseId)) {
      toast.error('Response ID must be a valid UUID');
      return;
    }

    const currentGroup = getGroupForStatus(editingItem.status as ErrorStatus);
    const nextGroup = getGroupForStatus(editForm.status);
    const nextDisplayOrder =
      currentGroup === nextGroup
        ? undefined
        : getNextDisplayOrder(
            items.filter((item) => item.id !== editingItem.id),
            nextGroup,
          );

    updateMutation.mutate(
      {
        id: editingItem.id,
        payload: {
          ...editForm,
          displayOrder: nextDisplayOrder,
        },
      },
      {
        onSuccess: () => {
          setIsEditOpen(false);
          setEditingItem(null);
          toast.success('Error log item updated');
        },
      },
    );
  };

  const handleStatusChange = (item: ErrorLogItem, status: ErrorStatus) => {
    const currentGroup = getGroupForStatus(item.status as ErrorStatus);
    const nextGroup = getGroupForStatus(status);
    const nextDisplayOrder =
      currentGroup === nextGroup
        ? undefined
        : getNextDisplayOrder(
            items.filter((i) => i.id !== item.id),
            nextGroup,
          );

    updateMutation.mutate(
      { id: item.id, payload: { status, displayOrder: nextDisplayOrder } },
      {
        onSuccess: () => {
          toast.success(`Marked as ${STATUS_LABEL[status]}`);
        },
      },
    );
  };

  const handleDelete = (item: ErrorLogItem) => {
    if (!isSuperAdmin) return;
    if (!window.confirm(`Delete \"${item.title}\"? This cannot be undone.`)) return;
    deleteMutation.mutate(item.id);
  };

  const persistReorder = async (orderedIds: string[]) => {
    for (let index = 0; index < orderedIds.length; index += 1) {
      const id = orderedIds[index];
      const { error } = await supabase.from('error_log_items').update({ display_order: index }).eq('id', id);
      if (error) throw error;
    }
  };

  const handleDragEnd = async (event: DragEndEvent, group: ItemGroup) => {
    if (isReadOnly || updateMutation.isPending) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const groupItems = group === 'active' ? activeItems : resolvedItems;
    const oldIndex = groupItems.findIndex((item) => item.id === active.id);
    const newIndex = groupItems.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(groupItems, oldIndex, newIndex);
    const idToOrder = new Map(reordered.map((item, index) => [item.id, index]));

    const previous = queryClient.getQueryData<ErrorLogItem[]>(['error-log-items']);
    queryClient.setQueryData<ErrorLogItem[]>(['error-log-items'], (current) => {
      if (!current) return current;
      return current.map((item) => {
        const nextOrder = idToOrder.get(item.id);
        if (nextOrder === undefined) return item;
        return { ...item, display_order: nextOrder };
      });
    });

    try {
      await persistReorder(reordered.map((item) => item.id));
      queryClient.invalidateQueries({ queryKey: ['error-log-items'] });
    } catch (error) {
      queryClient.setQueryData(['error-log-items'], previous);
      toast.error(error instanceof Error ? error.message : 'Failed to save new order');
    }
  };

  const isReadOnly = isGuestMode;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/researcher/dashboard')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Bug className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Error Log</h1>
              <p className="text-sm text-muted-foreground">Manual backlog of issues that still need fixes</p>
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

        <Card>
          <CardHeader>
            <CardTitle>Active Issues ({activeItems.length})</CardTitle>
            <CardDescription>
              Drag to reorder. Priority and status are still editable per item.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading error log items...</p>
            ) : activeItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open or in-progress issues.</p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => {
                  void handleDragEnd(event, 'active');
                }}
              >
                <SortableContext items={activeItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {activeItems.map((item) => (
                      <SortableErrorCard key={item.id} id={item.id} enabled={!isReadOnly && !updateMutation.isPending}>
                        <div className="rounded-lg border p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{item.title}</p>
                              <p className="text-xs text-muted-foreground">Updated {formatDateTime(item.updated_at)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={PRIORITY_BADGE_CLASS[item.priority as ErrorPriority] ?? PRIORITY_BADGE_CLASS.medium}>
                                {PRIORITY_LABEL[item.priority as ErrorPriority] ?? item.priority}
                              </Badge>
                              <Badge variant="outline">{STATUS_LABEL[item.status as ErrorStatus] ?? item.status}</Badge>
                            </div>
                          </div>

                          {item.details && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.details}</p>}

                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {item.changelog_version_ref ? (
                              <span>
                                Version ref: <code>{item.changelog_version_ref}</code>
                              </span>
                            ) : (
                              <span>No version reference</span>
                            )}
                            <span>•</span>
                            {item.response_id ? (
                              <Button
                                variant="link"
                                className="h-auto p-0 text-xs"
                                onClick={() => navigate(`/researcher/response/${item.response_id}`)}
                              >
                                Open response {item.response_id.slice(0, 8)}...
                              </Button>
                            ) : (
                              <span>No linked response</span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Select
                              value={item.status}
                              onValueChange={(value) => handleStatusChange(item, value as ErrorStatus)}
                              disabled={isReadOnly || updateMutation.isPending}
                            >
                              <SelectTrigger className="w-[180px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="open">Open</SelectItem>
                                <SelectItem value="in_progress">In progress</SelectItem>
                                <SelectItem value="resolved">Resolved</SelectItem>
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
                      </SortableErrorCard>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </CardContent>
        </Card>

        <Collapsible open={showResolved} onOpenChange={setShowResolved}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Resolved ({resolvedItems.length})</CardTitle>
                  <CardDescription>Previously fixed issues retained as history</CardDescription>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm">
                    {showResolved ? (
                      <>
                        <ChevronDown className="h-4 w-4 mr-1" />
                        Hide
                      </>
                    ) : (
                      <>
                        <ChevronRight className="h-4 w-4 mr-1" />
                        Show
                      </>
                    )}
                  </Button>
                </CollapsibleTrigger>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3">
                {resolvedItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No resolved issues yet.</p>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => {
                      void handleDragEnd(event, 'resolved');
                    }}
                  >
                    <SortableContext items={resolvedItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-3">
                        {resolvedItems.map((item) => (
                          <SortableErrorCard
                            key={item.id}
                            id={item.id}
                            enabled={!isReadOnly && !updateMutation.isPending}
                            className="bg-muted/20 rounded-lg"
                          >
                            <div className="rounded-lg border p-4 space-y-2 bg-muted/20">
                              <div className="flex items-start justify-between gap-3">
                                <p className="font-medium">{item.title}</p>
                                <Badge variant="secondary">Resolved</Badge>
                              </div>
                              {item.details && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.details}</p>}
                              <div className="text-xs text-muted-foreground">
                                Resolved {formatDateTime(item.resolved_at ?? item.updated_at)}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {item.response_id ? (
                                  <Button
                                    variant="link"
                                    className="h-auto p-0 text-xs"
                                    onClick={() => navigate(`/researcher/response/${item.response_id}`)}
                                  >
                                    Open response {item.response_id.slice(0, 8)}...
                                  </Button>
                                ) : (
                                  <span>No linked response</span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Select
                                  value={item.status}
                                  onValueChange={(value) => handleStatusChange(item, value as ErrorStatus)}
                                  disabled={isReadOnly || updateMutation.isPending}
                                >
                                  <SelectTrigger className="w-[180px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="open">Open</SelectItem>
                                    <SelectItem value="in_progress">In progress</SelectItem>
                                    <SelectItem value="resolved">Resolved</SelectItem>
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
                          </SortableErrorCard>
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </main>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Error Log Item</DialogTitle>
            <DialogDescription>Create a new issue to track work that still needs fixing.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="new-title">Title</Label>
              <Input
                id="new-title"
                value={createForm.title}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Short issue summary"
              />
            </div>

            <div>
              <Label htmlFor="new-details">Details</Label>
              <Textarea
                id="new-details"
                value={createForm.details}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, details: e.target.value }))}
                placeholder="Observed behavior, impact, and repro notes"
                rows={5}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select
                  value={createForm.priority}
                  onValueChange={(value) => setCreateForm((prev) => ({ ...prev, priority: value as ErrorPriority }))}
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
                <Label>Status</Label>
                <Select
                  value={createForm.status}
                  onValueChange={(value) => setCreateForm((prev) => ({ ...prev, status: value as ErrorStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="new-version-ref">Changelog Version Reference (optional)</Label>
              <Input
                id="new-version-ref"
                value={createForm.changelogVersionRef}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, changelogVersionRef: e.target.value }))}
                placeholder="e.g. 1.1.12"
              />
            </div>

            <div>
              <Label htmlFor="new-response-id">Linked Response ID (optional)</Label>
              <Input
                id="new-response-id"
                value={createForm.responseId}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, responseId: e.target.value }))}
                placeholder="Response UUID from experiment_responses"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Error Log Item</DialogTitle>
            <DialogDescription>Update issue details, status, priority, and linked response.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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
                  onValueChange={(value) => setEditForm((prev) => ({ ...prev, priority: value as ErrorPriority }))}
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
                <Label>Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(value) => setEditForm((prev) => ({ ...prev, status: value as ErrorStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="edit-version-ref">Changelog Version Reference (optional)</Label>
              <Input
                id="edit-version-ref"
                value={editForm.changelogVersionRef}
                onChange={(e) => setEditForm((prev) => ({ ...prev, changelogVersionRef: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="edit-response-id">Linked Response ID (optional)</Label>
              <Input
                id="edit-response-id"
                value={editForm.responseId}
                onChange={(e) => setEditForm((prev) => ({ ...prev, responseId: e.target.value }))}
                placeholder="Response UUID from experiment_responses"
              />
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
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ResearcherErrorLog;
