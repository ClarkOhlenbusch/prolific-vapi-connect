import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

interface NoConsentFeedback {
  id: string;
  feedback: string | null;
  prolific_id: string | null;
  created_at: string;
}

export const NoConsentFeedbackTable = () => {
  const [feedbackData, setFeedbackData] = useState<NoConsentFeedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeedback();
  }, []);

  const fetchFeedback = async () => {
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
          <Badge variant="secondary">{feedbackData.length} responses</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {feedbackData.length === 0 ? (
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
                {feedbackData.map((item) => (
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
