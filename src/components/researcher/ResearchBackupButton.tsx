import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useActivityLog } from '@/hooks/useActivityLog';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';

const LOCAL_TABLES = ['experiment_responses', 'participant_calls', 'demographics'] as const;
const CLOUD_TABLES = ['experiment_responses', 'participant_calls'] as const;
const CLOUD_BUCKET = 'research-backups';
const CLOUD_PREFIX = 'snapshots';
const MAX_CLOUD_BACKUPS = 20;
const PAGE_SIZE = 1000;

type BackupTable = (typeof LOCAL_TABLES)[number];
type CloudBackupTable = (typeof CLOUD_TABLES)[number];

type BackupSummary = {
  tablesSucceeded: number;
  tablesFailed: number;
  rowCounts: Record<string, number>;
  errors: Record<string, string>;
};

const getTimestamp = () => new Date().toISOString();

const createFilenameTimestamp = (isoTs: string) =>
  isoTs.replace(/:/g, '-').replace(/\./g, '-');

const downloadJson = (filename: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
};

const fetchRowsPaged = async (table: BackupTable): Promise<Record<string, unknown>[]> => {
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table as never)
      .select('*')
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const page = (data ?? []) as Record<string, unknown>[];
    if (page.length === 0) break;
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
};

const keepNewestCloudBackups = async () => {
  const { data, error } = await supabase.storage
    .from(CLOUD_BUCKET)
    .list(CLOUD_PREFIX, {
      limit: 200,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    });

  if (error) {
    throw new Error(error.message);
  }

  const files = (data ?? []).filter((f) => f.name.startsWith('backup_'));
  if (files.length <= MAX_CLOUD_BACKUPS) {
    return { deleted: 0 };
  }

  const deleteCount = files.length - MAX_CLOUD_BACKUPS;
  const stalePaths = files.slice(0, deleteCount).map((f) => `${CLOUD_PREFIX}/${f.name}`);

  const { error: removeError } = await supabase.storage.from(CLOUD_BUCKET).remove(stalePaths);
  if (removeError) {
    throw new Error(removeError.message);
  }

  return { deleted: stalePaths.length };
};

interface ResearchBackupButtonProps {
  onCompleted?: () => void;
}

export const ResearchBackupButton = ({ onCompleted }: ResearchBackupButtonProps) => {
  const { logActivity } = useActivityLog();
  const { isGuestMode } = useResearcherAuth();
  const [isRunning, setIsRunning] = useState(false);

  const runBackup = async () => {
    if (isGuestMode) {
      toast.error('Backups are disabled in guest mode');
      return;
    }

    setIsRunning(true);
    const startedAt = getTimestamp();
    const filenameTs = createFilenameTimestamp(startedAt);
    const summary: BackupSummary = {
      tablesSucceeded: 0,
      tablesFailed: 0,
      rowCounts: {},
      errors: {},
    };
    const localTables: Partial<Record<BackupTable, Record<string, unknown>[]>> = {};
    const cloudTables: Partial<Record<CloudBackupTable, Record<string, unknown>[]>> = {};

    let succeeded = false;
    try {
      for (const table of LOCAL_TABLES) {
        try {
          const rows = await fetchRowsPaged(table);
          localTables[table] = rows;
          summary.tablesSucceeded += 1;
          summary.rowCounts[table] = rows.length;
        } catch (err) {
          summary.tablesFailed += 1;
          summary.errors[table] = err instanceof Error ? err.message : String(err);
          summary.rowCounts[table] = 0;
        }
      }

      for (const table of CLOUD_TABLES) {
        if (localTables[table]) {
          cloudTables[table] = localTables[table];
          continue;
        }
        try {
          const rows = await fetchRowsPaged(table);
          cloudTables[table] = rows;
        } catch {
          // Local summary already captured failure details.
        }
      }

      const localPayload = {
        meta: {
          startedAt,
          completedAt: getTimestamp(),
          schemaVersion: 1,
          excludedTables: ['navigation_events'],
        },
        summary,
        tables: localTables,
      };
      const localFilename = `research-backup-${filenameTs}.json`;
      downloadJson(localFilename, localPayload);

      let cloudStatus: 'uploaded' | 'skipped' | 'failed' = 'skipped';
      let cloudPath: string | null = null;
      let cloudError: string | null = null;
      let cloudDeletedOld = 0;

      const hasCloudData = CLOUD_TABLES.some((table) => Array.isArray(cloudTables[table]));
      if (hasCloudData) {
        const cloudPathName = `${CLOUD_PREFIX}/backup_${filenameTs}.json`;
        const cloudPayload = {
          meta: {
            startedAt,
            completedAt: getTimestamp(),
            schemaVersion: 1,
            note: 'Compact cloud backup (navigation_events excluded)',
          },
          summary: {
            rowCounts: Object.fromEntries(
              CLOUD_TABLES.map((table) => [table, cloudTables[table]?.length ?? 0]),
            ),
          },
          tables: cloudTables,
        };

        const { error: uploadError } = await supabase.storage
          .from(CLOUD_BUCKET)
          .upload(cloudPathName, JSON.stringify(cloudPayload), {
            contentType: 'application/json',
            upsert: false,
          });

        if (uploadError) {
          cloudStatus = 'failed';
          cloudError = uploadError.message;
        } else {
          cloudStatus = 'uploaded';
          cloudPath = cloudPathName;
          try {
            const retention = await keepNewestCloudBackups();
            cloudDeletedOld = retention.deleted;
          } catch (retentionErr) {
            cloudError = retentionErr instanceof Error ? retentionErr.message : String(retentionErr);
          }
        }
      }

      await logActivity({
        action: 'download_backup_snapshot',
        details: {
          backup_scope_local: [...LOCAL_TABLES],
          backup_scope_cloud: [...CLOUD_TABLES],
          excluded_tables: ['navigation_events'],
          summary,
          local_filename: localFilename,
          cloud_status: cloudStatus,
          cloud_path: cloudPath,
          cloud_retention_deleted: cloudDeletedOld,
          cloud_error: cloudError,
        },
      });

      if (cloudStatus === 'uploaded') {
        toast.success(
          cloudDeletedOld > 0
            ? `Backup complete. Local file downloaded and cloud copy saved (${cloudDeletedOld} old cloud backup(s) removed).`
            : 'Backup complete. Local file downloaded and cloud copy saved.',
        );
      } else if (cloudStatus === 'failed') {
        toast.warning('Local backup downloaded. Cloud upload failed.');
      } else {
        toast.success('Backup complete. Local file downloaded.');
      }
      succeeded = true;
    } catch (err) {
      console.error('Backup failed:', err);
      toast.error(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setIsRunning(false);
      if (succeeded) {
        onCompleted?.();
      }
    }
  };

  return (
    <Button variant="outline" onClick={runBackup} disabled={isRunning || isGuestMode}>
      {isRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
      {isRunning ? 'Backing up…' : 'Backup Data'}
    </Button>
  );
};
