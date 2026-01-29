import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Activity, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  LogIn,
  LogOut,
  Download,
  RefreshCw,
} from 'lucide-react';

interface ActivityLog {
  id: string;
  user_id: string;
  user_email: string;
  action: string;
  details: unknown;
  created_at: string;
}

const PAGE_SIZE = 15;

const actionLabels: Record<string, { label: string; icon: typeof LogIn; variant: 'default' | 'secondary' | 'outline' }> = {
  login: { label: 'Login', icon: LogIn, variant: 'default' },
  logout: { label: 'Logout', icon: LogOut, variant: 'secondary' },
  download_experiment_responses: { label: 'Download Responses', icon: Download, variant: 'outline' },
  download_demographics: { label: 'Download Demographics', icon: Download, variant: 'outline' },
  download_participant_calls: { label: 'Download Calls', icon: Download, variant: 'outline' },
  download_formality_scores: { label: 'Download Formality', icon: Download, variant: 'outline' },
  download_formality_per_turn: { label: 'Download Per-Turn', icon: Download, variant: 'outline' },
};

export const ActivityLogsTable = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('researcher_activity_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (searchQuery) {
        query = query.or(`user_email.ilike.%${searchQuery}%,action.ilike.%${searchQuery}%`);
      }

      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      setLogs(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error('Error fetching activity logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [currentPage, searchQuery]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getActionDisplay = (action: string) => {
    const config = actionLabels[action] || { 
      label: action.replace(/_/g, ' '), 
      icon: Activity, 
      variant: 'secondary' as const 
    };
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  if (isLoading && logs.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Activity Logs</h3>
        </div>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Activity Logs</h3>
          <Badge variant="secondary">{totalCount}</Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email or action..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-8 w-[250px]"
            />
          </div>
          <Button variant="outline" size="icon" onClick={fetchLogs}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No activity logs found
        </div>
      ) : (
        <>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Date & Time</TableHead>
                  <TableHead className="w-[200px]">User</TableHead>
                  <TableHead className="w-[180px]">Action</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(log.created_at), 'MMM d, yyyy HH:mm:ss')}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {log.user_email}
                    </TableCell>
                    <TableCell>
                      {getActionDisplay(log.action)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {Object.keys(log.details || {}).length > 0 
                        ? JSON.stringify(log.details)
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
