import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const StatusDefinitionsContent = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Two Different Concepts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <div className="font-medium">1) Questionnaire submission (response-level)</div>
            <div className="text-muted-foreground">
              Stored in <code className="font-mono">experiment_responses</code>. This answers: did we receive and persist
              the questionnaire payload?
            </div>
          </div>
          <div>
            <div className="font-medium">2) Call/session completion (call-level)</div>
            <div className="text-muted-foreground">
              Stored in <code className="font-mono">participant_calls</code>. This answers: is the call ended / token
              used?
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>DB: experiment_responses.submission_status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Column: <code className="font-mono">experiment_responses.submission_status</code> with allowed values{" "}
            <code className="font-mono">pending | submitted | abandoned</code>.
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Value</TableHead>
                <TableHead>Meaning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono">pending</TableCell>
                <TableCell className="text-sm">
                  Draft row exists (session started / in progress) but the questionnaire was not submitted (or we have a
                  data inconsistency to fix).
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono">submitted</TableCell>
                <TableCell className="text-sm">
                  Questionnaire successfully submitted. We set <code className="font-mono">submitted_at</code> and treat
                  this as &ldquo;Completed&rdquo; in the researcher UI and analytics.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono">abandoned</TableCell>
                <TableCell className="text-sm">
                  Reserved for sessions that should be excluded from completion-based stats (supported by the schema).
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <Separator />

          <div className="space-y-2 text-sm">
            <div className="font-medium">What sets it?</div>
            <div className="text-muted-foreground">
              Edge Function <code className="font-mono">submit-questionnaire</code> writes the questionnaire payload and
              sets <code className="font-mono">submission_status = 'submitted'</code>, plus{" "}
              <code className="font-mono">submitted_at</code>.
            </div>
            <div className="text-muted-foreground">
              Edge Function <code className="font-mono">upsert-experiment-draft</code> seeds and updates draft rows and
              sets <code className="font-mono">submission_status = 'pending'</code>.
            </div>
            <div className="text-muted-foreground">
              Note: <code className="font-mono">experiment_responses.last_step</code> tracks the last visited page and
              can continue updating after submission (e.g. &ldquo;debriefing&rdquo;).
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>DB: participant_calls.is_completed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="text-muted-foreground">
            Column: <code className="font-mono">participant_calls.is_completed</code>.
          </div>
          <div className="text-muted-foreground">
            In the UI this is shown as <span className="font-medium">Call: Active/Ended</span>. This is intentionally
            separate from questionnaire completion to avoid ambiguity.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>UI Meaning</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <span className="font-medium">Completed (Status badge)</span> means{" "}
            <code className="font-mono">experiment_responses.submission_status = 'submitted'</code>.
          </div>
          <div>
            <span className="font-medium">Pending (Status badge)</span> means the response is not submitted (usually a
            draft, or an inconsistency).
          </div>
          <div>
            <span className="font-medium">Call: Ended</span> means{" "}
            <code className="font-mono">participant_calls.is_completed = true</code>.
          </div>
          <div>
            <span className="font-medium">Call: Active</span> means{" "}
            <code className="font-mono">participant_calls.is_completed = false</code>.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Analytics Defaults</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Summary, Batch Balance, and Statistical Analysis use only submitted questionnaires by default, meaning they
          filter to <code className="font-mono">submission_status = 'submitted'</code>.
        </CardContent>
      </Card>
    </div>
  );
};

