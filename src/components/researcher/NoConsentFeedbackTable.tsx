import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { GUEST_NO_CONSENT_FEEDBACK } from '@/lib/guest-dummy-data';
import { SourceFilterValue } from './GlobalSourceFilter';

interface NoConsentFeedback {
  id: string;
  feedback: string | null;
  prolific_id: string | null;
  created_at: string;
}

// Helper to detect researcher IDs (Prolific IDs are exactly 24 characters)
const isResearcherId = (prolificId: string | null): boolean => {
  if (!prolificId) return false;
  return prolificId.length !== 24;
};

interface NoConsentFeedbackTableProps {
  sourceFilter: SourceFilterValue;
}

export const NoConsentFeedbackTable = ({ sourceFilter }: NoConsentFeedbackTableProps) => {
  const [feedbackData, setFeedbackData] = useState<NoConsentFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const { isGuestMode } = useResearcherAuth();

  // Filter feedback based on source filter
  const filteredFeedbackData = feedbackData.filter(item => {
    if (sourceFilter === 'participant') {
      return !isResearcherId(item.prolific_id);
    } else if (sourceFilter === 'researcher') {
      return isResearcherId(item.prolific_id);
    }
    return true;
  });

  useEffect(() => {
    fetchFeedback();
  }, [isGuestMode]);

  const fetchFeedback = async () => {
    // Use dummy data for guest mode
    if (isGuestMode) {
      setFeedbackData(GUEST_NO_CONSENT_FEEDBACK);
      setLoading(false);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('no_consent_feedback')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFeedbackData(data || []);
    } catch (error) {
      console.error('Error fetching no-consent feedback:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>No-Consent Feedback</CardTitle>
            <CardDescription>
              Anonymous feedback from participants who declined to participate
            </CardDescription>
          </div>
          <Badge variant="secondary">{filteredFeedbackData.length} responses</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {filteredFeedbackData.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No feedback received yet.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Date</TableHead>
                  <TableHead className="w-[200px]">Prolific ID</TableHead>
                  <TableHead>Feedback</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFeedbackData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(item.created_at), 'MMM d, yyyy HH:mm')}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {item.prolific_id || <span className="text-muted-foreground italic">Unknown</span>}
                    </TableCell>
                    <TableCell>
                      {item.feedback || <span className="text-muted-foreground italic">No feedback provided</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
