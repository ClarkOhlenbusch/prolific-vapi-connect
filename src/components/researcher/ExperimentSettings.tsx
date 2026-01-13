import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useResearcherAuth } from "@/contexts/ResearcherAuthContext";

const ASSISTANT_IDS = {
  formal: "77569740-f001-4419-92f8-78a6ed2dde70",
  informal: "f391bf0c-f1d2-4473-bdf8-e88343224d68",
};

interface ExperimentSetting {
  setting_key: string;
  setting_value: string;
  updated_at: string;
}

export const ExperimentSettings = () => {
  const { isSuperAdmin, user } = useResearcherAuth();
  const [assistantType, setAssistantType] = useState<"formal" | "informal">("informal");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  
  // Batch label state
  const [batchLabel, setBatchLabel] = useState("");
  const [batchLabelInput, setBatchLabelInput] = useState("");
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [batchLastUpdated, setBatchLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("experiment_settings")
        .select("*")
        .in("setting_key", ["active_assistant_type", "current_batch_label"]);

      if (error) {
        console.error("Error fetching settings:", error);
        return;
      }

      if (data) {
        const assistantSetting = data.find(s => s.setting_key === "active_assistant_type");
        const batchSetting = data.find(s => s.setting_key === "current_batch_label");
        
        if (assistantSetting) {
          setAssistantType(assistantSetting.setting_value as "formal" | "informal");
          setLastUpdated(assistantSetting.updated_at);
        }
        
        if (batchSetting) {
          setBatchLabel(batchSetting.setting_value);
          setBatchLabelInput(batchSetting.setting_value);
          setBatchLastUpdated(batchSetting.updated_at);
        }
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (checked: boolean) => {
    if (!isSuperAdmin) {
      toast.error("Only super admins can change this setting");
      return;
    }

    const newType = checked ? "formal" : "informal";
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("experiment_settings")
        .update({
          setting_value: newType,
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        })
        .eq("setting_key", "active_assistant_type");

      if (error) {
        console.error("Error updating setting:", error);
        toast.error("Failed to update setting");
        return;
      }

      setAssistantType(newType);
      setLastUpdated(new Date().toISOString());
      toast.success(`Switched to ${newType} assistant`);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to update setting");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBatchLabel = async () => {
    if (!isSuperAdmin) {
      toast.error("Only super admins can change this setting");
      return;
    }

    setIsSavingBatch(true);

    try {
      const { error } = await supabase
        .from("experiment_settings")
        .update({
          setting_value: batchLabelInput.trim(),
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        })
        .eq("setting_key", "current_batch_label");

      if (error) {
        console.error("Error updating batch label:", error);
        toast.error("Failed to update batch label");
        return;
      }

      setBatchLabel(batchLabelInput.trim());
      setBatchLastUpdated(new Date().toISOString());
      toast.success(batchLabelInput.trim() ? `Batch label set to "${batchLabelInput.trim()}"` : "Batch label cleared");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to update batch label");
    } finally {
      setIsSavingBatch(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Voice Assistant Configuration</CardTitle>
          <CardDescription>
            Configure which voice assistant all new participants will interact with
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
            <div className="space-y-1">
              <Label htmlFor="assistant-toggle" className="text-base font-medium">
                Active Assistant Type
              </Label>
              <p className="text-sm text-muted-foreground">
                Toggle between formal and informal communication styles
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className={`text-sm font-medium ${assistantType === "informal" ? "text-foreground" : "text-muted-foreground"}`}>
                Informal
              </span>
              <Switch
                id="assistant-toggle"
                checked={assistantType === "formal"}
                onCheckedChange={handleToggle}
                disabled={isSaving || !isSuperAdmin}
              />
              <span className={`text-sm font-medium ${assistantType === "formal" ? "text-foreground" : "text-muted-foreground"}`}>
                Formal
              </span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className={`p-4 border rounded-lg ${assistantType === "formal" ? "border-primary bg-primary/5" : ""}`}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-medium">Formal Assistant</h3>
                {assistantType === "formal" && <Badge variant="default">Active</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Professional and polite communication style
              </p>
              <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                ID: {ASSISTANT_IDS.formal}
              </code>
            </div>

            <div className={`p-4 border rounded-lg ${assistantType === "informal" ? "border-primary bg-primary/5" : ""}`}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-medium">Informal Assistant</h3>
                {assistantType === "informal" && <Badge variant="default">Active</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Casual and friendly communication style
              </p>
              <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                ID: {ASSISTANT_IDS.informal}
              </code>
            </div>
          </div>

          {lastUpdated && (
            <p className="text-xs text-muted-foreground">
              Last updated: {new Date(lastUpdated).toLocaleString()}
            </p>
          )}

          {!isSuperAdmin && (
            <p className="text-sm text-amber-600">
              Only super admins can modify these settings
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Batch Label Configuration</CardTitle>
          <CardDescription>
            Configure the batch label for new participant data. This helps organize responses into named groups.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
            <div className="space-y-1 flex-1 mr-4">
              <Label htmlFor="batch-label" className="text-base font-medium">
                Current Batch Label
              </Label>
              <p className="text-sm text-muted-foreground">
                All new responses will be tagged with this label
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="batch-label"
                placeholder="e.g., Pilot-1, Wave-A"
                value={batchLabelInput}
                onChange={(e) => setBatchLabelInput(e.target.value)}
                disabled={!isSuperAdmin || isSavingBatch}
                className="w-48"
              />
              <Button 
                onClick={handleSaveBatchLabel}
                disabled={!isSuperAdmin || isSavingBatch || batchLabelInput === batchLabel}
                size="sm"
              >
                {isSavingBatch ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Current active label:</span>
            {batchLabel ? (
              <Badge variant="outline">{batchLabel}</Badge>
            ) : (
              <span className="text-sm text-muted-foreground italic">None (responses won't be tagged)</span>
            )}
          </div>

          {batchLastUpdated && (
            <p className="text-xs text-muted-foreground">
              Last updated: {new Date(batchLastUpdated).toLocaleString()}
            </p>
          )}

          {!isSuperAdmin && (
            <p className="text-sm text-amber-600">
              Only super admins can modify these settings
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
