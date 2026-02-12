import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Cloud, Download, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ResearchBackupButton } from '@/components/researcher/ResearchBackupButton';

const CLOUD_BUCKET = 'research-backups';
const CLOUD_PREFIX = 'snapshots';
const MAX_CLOUD_BACKUPS = 20;

type BackupDetails = {
  participants: number | null;
  responses: number | null;
  completedParticipants: number | null;
  excludedTables: string[];
  backupStartedAt: string | null;
};

type BackupRow = {
  name: string;
  path: string;
  createdAt: string | null;
  updatedAt: string | null;
  sizeBytes: number | null;
  details: BackupDetails | null;
  detailsError: string | null;
};

const formatBytes = (bytes: number | null) => {
  if (bytes == null || Number.isNaN(bytes)) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatDateTime = (date: string | null) => {
  if (!date) return '—';
  try {
    return format(new Date(date), 'MMM d, yyyy HH:mm:ss');
  } catch {
    return date;
  }
};

const parseCloudBackup = async (path: string): Promise<BackupDetails> => {
  const { data, error } = await supabase.storage.from(CLOUD_BUCKET).download(path);
  if (error) {
    throw new Error(error.message);
  }

  const text = await data.text();
  const payload = JSON.parse(text);
  const rowCounts = payload?.summary?.rowCounts ?? {};

  const participantRows = Array.isArray(payload?.tables?.participant_calls)
    ? payload.tables.participant_calls
    : null;
  const responseRows = Array.isArray(payload?.tables?.experiment_responses)
    ? payload.tables.experiment_responses
    : null;

  const participants =
    typeof rowCounts.participant_calls === 'number'
      ? rowCounts.participant_calls
      : participantRows?.length ?? null;

  const responses =
    typeof rowCounts.experiment_responses === 'number'
      ? rowCounts.experiment_responses
      : responseRows?.length ?? null;

  const completedParticipants = participantRows
    ? participantRows.filter((row: { is_completed?: boolean }) => row.is_completed === true).length
    : null;

  const excludedTables = Array.isArray(payload?.meta?.excludedTables)
    ? payload.meta.excludedTables
    : [];

  const backupStartedAt = typeof payload?.meta?.startedAt === 'string' ? payload.meta.startedAt : null;

  return {
    participants,
    responses,
    completedParticipants,
    excludedTables,
    backupStartedAt,
  };
};

const extractSize = (metadata: unknown): number | null => {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).size;
  return typeof raw === 'number' ? raw : null;
};

const ResearcherBackups = () => {
  const navigate = useNavigate();
  const { isGuestMode } = useResearcherAuth();
  const [rows, setRows] = useState<BackupRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const fetchBackups = useCallback(async () => {
    if (isGuestMode) {
      setRows([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.storage.from(CLOUD_BUCKET).list(CLOUD_PREFIX, {
        limit: 200,
        offset: 0,
        sortBy: { column: 'name', order: 'desc' },
      });

      if (error) {
        throw new Error(error.message);
      }

      const files = (data ?? []).filter((file) => file.name.startsWith('backup_') && file.name.endsWith('.json'));
      const baseRows: BackupRow[] = files.map((file) => ({
        name: file.name,
        path: `${CLOUD_PREFIX}/${file.name}`,
        createdAt: file.created_at ?? null,
        updatedAt: file.updated_at ?? null,
        sizeBytes: extractSize(file.metadata),
        details: null,
        detailsError: null,
      }));

      setRows(baseRows);
      setIsLoading(false);

      if (baseRows.length === 0) return;

      setIsLoadingDetails(true);
      const withDetails = await Promise.all(
        baseRows.map(async (row) => {
          try {
            const details = await parseCloudBackup(row.path);
            return { ...row, details };
          } catch (err) {
            return {
              ...row,
              detailsError: err instanceof Error ? err.message : 'Failed to parse backup details',
            };
          }
        }),
      );
      setRows(withDetails);
    } catch (err) {
      console.error('Failed to load backups:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to load cloud backups');
      setRows([]);
    } finally {
      setIsLoading(false);
      setIsLoadingDetails(false);
    }
  }, [isGuestMode]);

  useEffect(() => {
    void fetchBackups();
  }, [fetchBackups]);

  const downloadCloudBackup = async (path: string, filename: string) => {
    try {
      const { data, error } = await supabase.storage.from(CLOUD_BUCKET).download(path);
      if (error) throw new Error(error.message);

      const url = window.URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download cloud backup:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to download backup');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => navigate('/researcher/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Dashboard
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Research Backups</h1>
              <p className="text-sm text-muted-foreground">Cloud snapshots and backup details</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isGuestMode && <ResearchBackupButton onCompleted={fetchBackups} />}
            <Button variant="outline" onClick={() => void fetchBackups()}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Cloud Storage Location
            </CardTitle>
            <CardDescription>
              Backups are stored in Supabase Storage bucket <code>{CLOUD_BUCKET}</code> under folder{' '}
              <code>{CLOUD_PREFIX}/</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Retention keeps the newest {MAX_CLOUD_BACKUPS} cloud backups automatically.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Backup Files</CardTitle>
            <CardDescription>Date, size, participant counts, and response counts per cloud backup</CardDescription>
          </CardHeader>
          <CardContent>
            {isGuestMode ? (
              <div className="text-sm text-muted-foreground">Cloud backups are disabled in guest mode.</div>
            ) : isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading backups...
              </div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No cloud backups found yet.</div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Backup Date</TableHead>
                      <TableHead>File Size</TableHead>
                      <TableHead>Participants</TableHead>
                      <TableHead>Responses</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Excluded Tables</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const dateToShow = row.details?.backupStartedAt ?? row.createdAt ?? row.updatedAt;
                      const showLoadingDetails = !row.details && !row.detailsError && isLoadingDetails;
                      return (
                        <TableRow key={row.name}>
                          <TableCell className="font-mono text-xs">{row.path}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDateTime(dateToShow)}</TableCell>
                          <TableCell>{formatBytes(row.sizeBytes)}</TableCell>
                          <TableCell>
                            {showLoadingDetails ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                              row.detailsError ? 'Error' : (row.details?.participants ?? '—')
                            )}
                          </TableCell>
                          <TableCell>
                            {showLoadingDetails ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                              row.detailsError ? 'Error' : (row.details?.responses ?? '—')
                            )}
                          </TableCell>
                          <TableCell>
                            {showLoadingDetails ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                              row.detailsError ? 'Error' : (row.details?.completedParticipants ?? '—')
                            )}
                          </TableCell>
                          <TableCell>
                            {row.details?.excludedTables?.length ? (
                              row.details.excludedTables.join(', ')
                            ) : (
                              <Badge variant="secondary">None</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void downloadCloudBackup(row.path, row.name)}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ResearcherBackups;
