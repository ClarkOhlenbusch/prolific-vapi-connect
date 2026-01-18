import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useResearcherAuth } from "@/contexts/ResearcherAuthContext";
import { RefreshCw, RotateCcw, Users } from "lucide-react";

const ASSISTANT_IDS = {
  formal: "77569740-f001-4419-92f8-78a6ed2dde70",
  informal: "f391bf0c-f1d2-4473-bdf8-e88343224d68",
};

const PRACTICE_ASSISTANT_IDS = {
  formal: "ea2a5f95-5c07-4498-996b-5b3e204192f8",
  informal: "30394944-4d48-4586-8e6d-cd3d6b347e80",
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

  // Alternating mode state
  const [alternatingEnabled, setAlternatingEnabled] = useState(false);
  const [formalCount, setFormalCount] = useState(0);
  const [informalCount, setInformalCount] = useState(0);
  const [offsetCount, setOffsetCount] = useState(0);
  const [offsetType, setOffsetType] = useState<"formal" | "informal">("informal");
  const [offsetInput, setOffsetInput] = useState("");
  const [isSavingAlternating, setIsSavingAlternating] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("experiment_settings")
        .select("*")
        .in("setting_key", [
          "active_assistant_type",
          "current_batch_label",
          "alternating_mode_enabled",
          "formal_participant_count",
          "informal_participant_count",
          "condition_offset_count",
          "condition_offset_type"
        ]);

      if (error) {
        console.error("Error fetching settings:", error);
        return;
      }

      if (data) {
        const getValue = (key: string) => data.find(s => s.setting_key === key)?.setting_value;
        const getUpdated = (key: string) => data.find(s => s.setting_key === key)?.updated_at;
        
        const assistantSetting = getValue("active_assistant_type");
        if (assistantSetting) {
          setAssistantType(assistantSetting as "formal" | "informal");
          setLastUpdated(getUpdated("active_assistant_type") || null);
        }
        
        const batchSetting = getValue("current_batch_label");
        if (batchSetting !== undefined) {
          setBatchLabel(batchSetting);
          setBatchLabelInput(batchSetting);
          setBatchLastUpdated(getUpdated("current_batch_label") || null);
        }

        // Alternating mode settings
        setAlternatingEnabled(getValue("alternating_mode_enabled") === "true");
        setFormalCount(parseInt(getValue("formal_participant_count") || "0", 10));
        setInformalCount(parseInt(getValue("informal_participant_count") || "0", 10));
        setOffsetCount(parseInt(getValue("condition_offset_count") || "0", 10));
        setOffsetType((getValue("condition_offset_type") || "informal") as "formal" | "informal");
        setOffsetInput(getValue("condition_offset_count") || "0");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAssistant = async (type: "formal" | "informal") => {
    if (!isSuperAdmin) {
      toast.error("Only super admins can change this setting");
      return;
    }

    if (type === assistantType) return;

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("experiment_settings")
        .update({
          setting_value: type,
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        })
        .eq("setting_key", "active_assistant_type");

      if (error) {
        console.error("Error updating setting:", error);
        toast.error("Failed to update setting");
        return;
      }

      setAssistantType(type);
      setLastUpdated(new Date().toISOString());
      toast.success(`Switched to ${type} assistant`);
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

  const handleToggleAlternating = async (enabled: boolean) => {
    if (!isSuperAdmin) {
      toast.error("Only super admins can change this setting");
      return;
    }

    setIsSavingAlternating(true);

    try {
      const { error } = await supabase
        .from("experiment_settings")
        .update({
          setting_value: String(enabled),
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        })
        .eq("setting_key", "alternating_mode_enabled");

      if (error) {
        console.error("Error toggling alternating mode:", error);
        toast.error("Failed to update setting");
        return;
      }

      setAlternatingEnabled(enabled);
      toast.success(enabled ? "Alternating mode enabled" : "Alternating mode disabled");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to update setting");
    } finally {
      setIsSavingAlternating(false);
    }
  };

  const handleSetOffset = async () => {
    if (!isSuperAdmin) {
      toast.error("Only super admins can change this setting");
      return;
    }

    const count = parseInt(offsetInput, 10);
    if (isNaN(count) || count < 0) {
      toast.error("Please enter a valid number");
      return;
    }

    setIsSavingAlternating(true);

    try {
      // Update both offset count and type
      const updates = [
        supabase
          .from("experiment_settings")
          .update({
            setting_value: String(count),
            updated_at: new Date().toISOString(),
            updated_by: user?.id,
          })
          .eq("setting_key", "condition_offset_count"),
        supabase
          .from("experiment_settings")
          .update({
            setting_value: offsetType,
            updated_at: new Date().toISOString(),
            updated_by: user?.id,
          })
          .eq("setting_key", "condition_offset_type"),
      ];

      const results = await Promise.all(updates);
      const hasError = results.some(r => r.error);

      if (hasError) {
        console.error("Error setting offset:", results);
        toast.error("Failed to update offset");
        return;
      }

      setOffsetCount(count);
      toast.success(`Next ${count} real participants will be assigned to ${offsetType}`);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to update offset");
    } finally {
      setIsSavingAlternating(false);
    }
  };

  const handleResetCounters = async () => {
    if (!isSuperAdmin) {
      toast.error("Only super admins can change this setting");
      return;
    }

    if (!confirm("Are you sure you want to reset both counters to 0? This cannot be undone.")) {
      return;
    }

    setIsSavingAlternating(true);

    try {
      const updates = [
        supabase
          .from("experiment_settings")
          .update({
            setting_value: "0",
            updated_at: new Date().toISOString(),
            updated_by: user?.id,
          })
          .eq("setting_key", "formal_participant_count"),
        supabase
          .from("experiment_settings")
          .update({
            setting_value: "0",
            updated_at: new Date().toISOString(),
            updated_by: user?.id,
          })
          .eq("setting_key", "informal_participant_count"),
        supabase
          .from("experiment_settings")
          .update({
            setting_value: "0",
            updated_at: new Date().toISOString(),
            updated_by: user?.id,
          })
          .eq("setting_key", "condition_offset_count"),
      ];

      const results = await Promise.all(updates);
      const hasError = results.some(r => r.error);

      if (hasError) {
        console.error("Error resetting counters:", results);
        toast.error("Failed to reset counters");
        return;
      }

      setFormalCount(0);
      setInformalCount(0);
      setOffsetCount(0);
      setOffsetInput("0");
      toast.success("Counters reset to 0");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to reset counters");
    } finally {
      setIsSavingAlternating(false);
    }
  };

  // Calculate what the next condition will be
  const getNextCondition = (): "formal" | "informal" => {
    if (!alternatingEnabled) return assistantType;
    if (offsetCount > 0) return offsetType;
    return formalCount <= informalCount ? "formal" : "informal";
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

  const nextCondition = getNextCondition();

  return (
    <div className="space-y-6">
      {/* Current Active Condition Banner */}
      <Card className="border-2 border-primary">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Next real participant will be assigned to:</p>
                <p className="text-2xl font-bold capitalize">{nextCondition}</p>
              </div>
            </div>
            <Badge variant={nextCondition === "formal" ? "default" : "secondary"} className="text-lg px-4 py-2">
              {nextCondition === "formal" ? "Formal" : "Informal"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Alternating Mode Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Alternating Condition Assignment
          </CardTitle>
          <CardDescription>
            Automatically alternate between formal and informal conditions for real participants (24-char Prolific IDs only)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <Label className="text-base font-medium">Enable Alternating Mode</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, real participants are automatically assigned to balance conditions
              </p>
            </div>
            <Switch
              checked={alternatingEnabled}
              onCheckedChange={handleToggleAlternating}
              disabled={!isSuperAdmin || isSavingAlternating}
            />
          </div>

          {/* Current Counts */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base font-medium">Formal Participants</Label>
                <Badge variant="outline" className="text-lg">{formalCount}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Real participants assigned to formal condition
              </p>
            </div>
            <div className="p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base font-medium">Informal Participants</Label>
                <Badge variant="outline" className="text-lg">{informalCount}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Real participants assigned to informal condition
              </p>
            </div>
          </div>

          {/* Balance indicator */}
          <div className="p-4 border rounded-lg">
            <Label className="text-base font-medium mb-2 block">Balance Status</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-blue-500 rounded-l h-4" style={{ 
                width: `${formalCount + informalCount > 0 ? (formalCount / (formalCount + informalCount)) * 100 : 50}%` 
              }} />
              <div className="flex-1 bg-orange-500 rounded-r h-4" style={{ 
                width: `${formalCount + informalCount > 0 ? (informalCount / (formalCount + informalCount)) * 100 : 50}%` 
              }} />
            </div>
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>Formal: {formalCount + informalCount > 0 ? Math.round((formalCount / (formalCount + informalCount)) * 100) : 50}%</span>
              <span>Informal: {formalCount + informalCount > 0 ? Math.round((informalCount / (formalCount + informalCount)) * 100) : 50}%</span>
            </div>
          </div>

          {/* Offset Input */}
          <div className="p-4 border rounded-lg space-y-4">
            <div>
              <Label className="text-base font-medium">Condition Offset (Rebalancing)</Label>
              <p className="text-sm text-muted-foreground">
                Force the next N real participants to a specific condition to rebalance
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">Next</span>
              <Input
                type="number"
                min="0"
                value={offsetInput}
                onChange={(e) => setOffsetInput(e.target.value)}
                disabled={!isSuperAdmin || isSavingAlternating}
                className="w-20"
              />
              <span className="text-sm">participants →</span>
              <select
                value={offsetType}
                onChange={(e) => setOffsetType(e.target.value as "formal" | "informal")}
                disabled={!isSuperAdmin || isSavingAlternating}
                className="h-10 px-3 border rounded-md bg-background"
              >
                <option value="formal">Formal</option>
                <option value="informal">Informal</option>
              </select>
              <Button 
                onClick={handleSetOffset}
                disabled={!isSuperAdmin || isSavingAlternating}
                size="sm"
              >
                Set Offset
              </Button>
            </div>
            {offsetCount > 0 && (
              <Badge variant="destructive">
                Offset active: Next {offsetCount} → {offsetType}
              </Badge>
            )}
          </div>

          {/* Reset Button */}
          <div className="flex items-center justify-between p-4 border rounded-lg border-destructive/50">
            <div className="space-y-1">
              <Label className="text-base font-medium text-destructive">Reset All Counters</Label>
              <p className="text-sm text-muted-foreground">
                Reset formal, informal, and offset counters to 0
              </p>
            </div>
            <Button 
              variant="destructive"
              onClick={handleResetCounters}
              disabled={!isSuperAdmin || isSavingAlternating}
              size="sm"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>

          <Button 
            variant="outline" 
            onClick={fetchSettings}
            disabled={isSavingAlternating}
            className="w-full"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Counts
          </Button>

          {!isSuperAdmin && (
            <p className="text-sm text-amber-600">
              Only super admins can modify these settings
            </p>
          )}
        </CardContent>
      </Card>

      {/* Static Assistant Selection (used when alternating is off, or for testers) */}
      <Card>
        <CardHeader>
          <CardTitle>Static Voice Assistant Configuration</CardTitle>
          <CardDescription>
            {alternatingEnabled 
              ? "Used for testers (non-24-char Prolific IDs) when alternating mode is on"
              : "Configure which voice assistant all participants will interact with"
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="text-base font-medium">Select Active Assistant</Label>
            <p className="text-sm text-muted-foreground">
              {alternatingEnabled 
                ? "This is used when a tester (non-24-char ID) accesses the experiment"
                : "Click on an assistant to set it as active for all participants"
              }
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => handleSelectAssistant("formal")}
              disabled={isSaving || !isSuperAdmin}
              className={`p-4 border rounded-lg text-left transition-all ${
                assistantType === "formal" 
                  ? "border-primary bg-primary/5 ring-2 ring-primary" 
                  : "hover:border-primary/50 hover:bg-muted/50"
              } ${(!isSuperAdmin || isSaving) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-medium">Formal Assistant</h3>
                {assistantType === "formal" && <Badge variant="default">Active</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Professional and polite communication style
              </p>
              <div className="space-y-1">
                <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded block">
                  Main: {ASSISTANT_IDS.formal}
                </code>
                <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded block">
                  Practice: {PRACTICE_ASSISTANT_IDS.formal}
                </code>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectAssistant("informal")}
              disabled={isSaving || !isSuperAdmin}
              className={`p-4 border rounded-lg text-left transition-all ${
                assistantType === "informal" 
                  ? "border-primary bg-primary/5 ring-2 ring-primary" 
                  : "hover:border-primary/50 hover:bg-muted/50"
              } ${(!isSuperAdmin || isSaving) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-medium">Informal Assistant</h3>
                {assistantType === "informal" && <Badge variant="default">Active</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Casual and friendly communication style
              </p>
              <div className="space-y-1">
                <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded block">
                  Main: {ASSISTANT_IDS.informal}
                </code>
                <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded block">
                  Practice: {PRACTICE_ASSISTANT_IDS.informal}
                </code>
              </div>
            </button>
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
