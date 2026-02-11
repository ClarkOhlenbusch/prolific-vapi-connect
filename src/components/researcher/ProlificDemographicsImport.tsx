import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  parseProlificCSV,
  mapProlificCSVToRows,
  toDbRow,
  MAX_PROLIFIC_IMPORT_ROWS,
} from '@/lib/prolific-demographics';

const BATCH_SIZE = 100;

export const ProlificDemographicsImport = () => {
  const { user, isGuestMode } = useResearcherAuth();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'uploading' | 'done'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [parsedCount, setParsedCount] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) {
      setFile(null);
      setParsedCount(null);
      setMessage(null);
      return;
    }
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setFile(null);
      setMessage('Please select a CSV file.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setFile(f);
    setMessage(null);
    setParsedCount(null);

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const rows = parseProlificCSV(text);
      const { rows: mapped, skipped, errors } = mapProlificCSVToRows(rows);
      if (errors.length > 0) {
        setMessage(errors[0]);
        setParsedCount(null);
        return;
      }
      if (mapped.length > MAX_PROLIFIC_IMPORT_ROWS) {
        setMessage(`File has ${mapped.length} rows. Maximum is ${MAX_PROLIFIC_IMPORT_ROWS.toLocaleString()}.`);
        setParsedCount(null);
        return;
      }
      setParsedCount(mapped.length);
      if (skipped > 0) {
        setMessage(`${skipped} row(s) skipped (invalid or missing Participant id).`);
      }
    };
    reader.readAsText(f, 'UTF-8');
  };

  const handleImport = async () => {
    if (!file || parsedCount === null || parsedCount === 0) return;
    if (isGuestMode) {
      toast.error('Import is not available in demo mode.');
      return;
    }

    setStatus('parsing');
    const text = await file.text();
    const rows = parseProlificCSV(text);
    const { rows: mapped, errors } = mapProlificCSVToRows(rows);
    if (errors.length > 0 || mapped.length === 0) {
      setStatus('idle');
      toast.error(errors[0] || 'No valid rows to import.');
      return;
    }
    if (mapped.length > MAX_PROLIFIC_IMPORT_ROWS) {
      setStatus('idle');
      toast.error(`Maximum ${MAX_PROLIFIC_IMPORT_ROWS.toLocaleString()} rows allowed.`);
      return;
    }

    setStatus('uploading');
    const importedBy = user?.id ?? null;

    try {
      let totalUpserted = 0;
      for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
        const batch = mapped.slice(i, i + BATCH_SIZE);
        const dbRows = batch.map((row) => toDbRow(row, importedBy));
        const { error } = await supabase
          .from('prolific_export_demographics')
          .upsert(dbRows, { onConflict: 'prolific_id' });

        if (error) throw error;
        totalUpserted += batch.length;
      }

      setStatus('done');
      setMessage(null);
      setFile(null);
      setParsedCount(null);
      if (inputRef.current) inputRef.current.value = '';
      toast.success(`Imported ${totalUpserted} demographic row(s).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus('idle');
      toast.error(`Import failed: ${msg}`);
    }
  };

  const canImport = file && parsedCount !== null && parsedCount > 0 && status !== 'uploading';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isGuestMode || status === 'uploading'}
        >
          <Upload className="h-4 w-4 mr-2" />
          Choose CSV
        </Button>
        {file && (
          <>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" />
              {file.name}
              {parsedCount !== null && (
                <span className="font-medium text-foreground">({parsedCount} rows)</span>
              )}
            </span>
            <Button
              type="button"
              size="sm"
              onClick={handleImport}
              disabled={!canImport}
            >
              {status === 'uploading' ? 'Importing…' : 'Import'}
            </Button>
          </>
        )}
      </div>
      {message && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      {isGuestMode && (
        <p className="text-xs text-muted-foreground">Prolific demographics import is disabled in demo mode.</p>
      )}
    </div>
  );
};
