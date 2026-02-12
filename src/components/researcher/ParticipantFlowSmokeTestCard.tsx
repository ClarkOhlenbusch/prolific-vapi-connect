import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Loader2, Play } from "lucide-react";
import { runParticipantFlowSmokeTest, type SmokeTestResult } from "@/lib/participant-flow-smoke-test";
import { toast } from "sonner";

interface ParticipantFlowSmokeTestCardProps {
  disabled?: boolean;
}

export const ParticipantFlowSmokeTestCard = ({ disabled = false }: ParticipantFlowSmokeTestCardProps) => {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<SmokeTestResult | null>(null);

  const summaryBadge = useMemo(() => {
    if (!lastResult) return null;
    return lastResult.passed ? (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Pass</Badge>
    ) : (
      <Badge variant="destructive">Fail</Badge>
    );
  }, [lastResult]);

  const handleRun = async () => {
    setIsRunning(true);
    const result = await runParticipantFlowSmokeTest();
    setLastResult(result);
    setIsRunning(false);

    if (result.passed) {
      toast.success("Participant flow smoke test passed.");
      return;
    }

    toast.error("Participant flow smoke test failed.");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Participant Flow Smoke Test</CardTitle>
            <CardDescription>
              Runs the end-to-end participant path with real Supabase calls: create session, submit questionnaire,
              update early access, verify researcher visibility.
            </CardDescription>
          </div>
          {summaryBadge}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Button onClick={handleRun} disabled={disabled || isRunning}>
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Smoke Test
              </>
            )}
          </Button>
          {disabled && <p className="text-xs text-muted-foreground">Unavailable in guest mode.</p>}
        </div>

        {lastResult && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="text-xs text-muted-foreground">
              run_id={lastResult.runId}
              {lastResult.prolificId ? ` • prolific_id=${lastResult.prolificId}` : ""}
              {lastResult.callId ? ` • call_id=${lastResult.callId}` : ""}
            </div>
            <div className="space-y-2">
              {lastResult.steps.map((step) => (
                <div key={step.key} className="flex items-start gap-2 text-sm">
                  {step.status === "passed" ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 mt-0.5 text-destructive" />
                  )}
                  <div>
                    <div className="font-medium">{step.label}</div>
                    {step.detail && <div className="text-muted-foreground">{step.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
