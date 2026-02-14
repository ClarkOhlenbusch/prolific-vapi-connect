import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useResearcherAuth } from "@/contexts/ResearcherAuthContext";
import { RefreshCw, RotateCcw, Users, Check } from "lucide-react";
import { BatchManager } from "./BatchManager";
import { fetchArchivedFilters } from "@/lib/archived-responses";
import type { SourceFilterValue } from "./GlobalSourceFilter";

// Prolific participant IDs are 24 chars; researcher/demo IDs are not
const isResearcherId = (prolificId: string | null): boolean => {
  return prolificId != null && prolificId.length !== 24;
};

const ASSISTANT_IDS = {
  formal: "77569740-f001-4419-92f8-78a6ed2dde70",
  informal: "f391bf0c-f1d2-4473-bdf8-e88343224d68",
};

const PRACTICE_ASSISTANT_IDS = {
  formal: "ea2a5f95-5c07-4498-996b-5b3e204192f8",
  informal: "30394944-4d48-4586-8e6d-cd3d6b347e80",
};

import { GUEST_EXPERIMENT_SETTINGS } from "@/lib/guest-dummy-data";

interface ExperimentSettingsProps {
  sourceFilter?: SourceFilterValue;
  openBatchCreate?: boolean;
  onBatchCreateConsumed?: () => void;
}

export const ExperimentSettings = ({ sourceFilter = "all", openBatchCreate, onBatchCreateConsumed }: ExperimentSettingsProps) => {
  const { isSuperAdmin, user, isGuestMode } = useResearcherAuth();
  const [assistantType, setAssistantType] = useState<"formal" | "informal">("informal");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Mode toggle: "alternating" or "static"
  const [activeMode, setActiveMode] = useState<"alternating" | "static">("alternating");


  // Alternating mode state
  const [alternatingEnabled, setAlternatingEnabled] = useState(false);
  const [formalCount, setFormalCount] = useState(0);
  const [informalCount, setInformalCount] = useState(0);
  const [offsetCount, setOffsetCount] = useState(0);
  const [offsetType, setOffsetType] = useState<"formal" | "informal">("informal");
  const [offsetInput, setOffsetInput] = useState("");
  const [isSavingAlternating, setIsSavingAlternating] = useState(false);

  // Batch filtering for counts
  const [availableBatches, setAvailableBatches] = useState<string[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [batchCounts, setBatchCounts] = useState<{ formal: number; informal: number }>({ formal: 0, informal: 0 });
  const [isLoadingBatchCounts, setIsLoadingBatchCounts] = useState(false);

  useEffect(() => {
    // Use dummy data for guest mode
    if (isGuestMode) {
      setAssistantType(GUEST_EXPERIMENT_SETTINGS.assistantType);
      setAlternatingEnabled(GUEST_EXPERIMENT_SETTINGS.alternatingEnabled);
      setActiveMode(GUEST_EXPERIMENT_SETTINGS.alternatingEnabled ? "alternating" : "static");
      setFormalCount(GUEST_EXPERIMENT_SETTINGS.formalCount);
      setInformalCount(GUEST_EXPERIMENT_SETTINGS.informalCount);
      setOffsetCount(GUEST_EXPERIMENT_SETTINGS.offsetCount);
      setOffsetType(GUEST_EXPERIMENT_SETTINGS.offsetType);
      setOffsetInput(String(GUEST_EXPERIMENT_SETTINGS.offsetCount));
      setLastUpdated(GUEST_EXPERIMENT_SETTINGS.lastUpdated);
      setAvailableBatches(GUEST_EXPERIMENT_SETTINGS.availableBatches);
      setBatchCounts({ formal: 24, informal: 18 });
      setIsLoading(false);
      return;
    }
    fetchSettings();
    fetchAvailableBatches();
  }, [isGuestMode]);

  useEffect(() => {
    if (!isGuestMode) {
      fetchBatchCounts();
    }
  }, [selectedBatches, sourceFilter, isGuestMode]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("experiment_settings")
        .select("*")
        .in("setting_key", [
          "active_assistant_type",
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

        // Alternating mode settings
        const altEnabled = getValue("alternating_mode_enabled") === "true";
        setAlternatingEnabled(altEnabled);
        setActiveMode(altEnabled ? "alternating" : "static");
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

  const fetchAvailableBatches = async () => {
    try {
      // Use the authoritative batch list rather than deriving from responses
      // (response queries can be row-limited and can omit newly created batches).
      const { data, error } = await supabase
        .from("experiment_batches")
        .select("name")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const names = (data ?? [])
        .map((r) => (r.name ?? "").trim())
        .filter(Boolean);
      setAvailableBatches([...new Set(names)].sort());
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const fetchBatchCounts = async () => {
    setIsLoadingBatchCounts(true);
    try {
      let query = supabase
        .from("experiment_responses")
        .select("prolific_id, call_id, assistant_type, batch_label")
        // Only include completed questionnaires.
        .eq("submission_status", "submitted");

      if (selectedBatches.length > 0) {
        query = query.in("batch_label", selectedBatches);
      }

      const [{ data, error }, { archivedResponseKeys }] = await Promise.all([
        query,
        fetchArchivedFilters(),
      ]);

      if (error) {
        console.error("Error fetching batch counts:", error);
        return;
      }

      let rows = (data ?? []).filter(
        (r) => !archivedResponseKeys.has(`${r.prolific_id}|${r.call_id}`)
      );
      if (sourceFilter === "participant") {
        rows = rows.filter((r) => !isResearcherId(r.prolific_id ?? null));
      } else if (sourceFilter === "researcher") {
        rows = rows.filter((r) => isResearcherId(r.prolific_id ?? null));
      }

      const formal = rows.filter((r) => r.assistant_type === "formal").length;
      const informal = rows.filter((r) => r.assistant_type === "informal").length;
      setBatchCounts({ formal, informal });
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoadingBatchCounts(false);
    }
  };

  const handleSelectAssistant = async (type: "formal" | "informal") => {
    if (type === assistantType) return;

    // Guest mode: update local state only
    if (isGuestMode) {
      setAssistantType(type);
      setLastUpdated(new Date().toISOString());
      toast.success(`Switched to ${type} assistant (demo mode - changes not saved)`);
      return;
    }

    if (!isSuperAdmin) {
      toast.error("Only super admins can change this setting");
      return;
    }

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

  const handleModeChange = async (mode: "alternating" | "static") => {
    const enabled = mode === "alternating";

    // Guest mode: update local state only
    if (isGuestMode) {
      setAlternatingEnabled(enabled);
      setActiveMode(mode);
      toast.success((enabled ? "Switched to Alternating Mode" : "Switched to Static Mode") + " (demo mode - changes not saved)");
      return;
    }

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
        console.error("Error toggling mode:", error);
        toast.error("Failed to update setting");
        return;
      }

      setAlternatingEnabled(enabled);
      setActiveMode(mode);
      toast.success(enabled ? "Switched to Alternating Mode" : "Switched to Static Mode");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to update setting");
    } finally {
      setIsSavingAlternating(false);
    }
  };

  const handleSetOffset = async () => {
    const count = parseInt(offsetInput, 10);
    if (isNaN(count) || count < 0) {
      toast.error("Please enter a valid number");
      return;
    }

    // Guest mode: update local state only
    if (isGuestMode) {
      setOffsetCount(count);
      toast.success(`Next ${count} real participants will be assigned to ${offsetType} (demo mode - changes not saved)`);
      return;
    }

    if (!isSuperAdmin) {
      toast.error("Only super admins can change this setting");
      return;
    }

    setIsSavingAlternating(true);

    try {
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
    if (!confirm("Are you sure you want to reset both counters to 0? This cannot be undone.")) {
      return;
    }

    // Guest mode: update local state only
    if (isGuestMode) {
      setFormalCount(0);
      setInformalCount(0);
      setOffsetCount(0);
      setOffsetInput("0");
      toast.success("Counters reset to 0 (demo mode - changes not saved)");
      return;
    }

    if (!isSuperAdmin) {
      toast.error("Only super admins can change this setting");
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

  const toggleBatchSelection = (batch: string) => {
    setSelectedBatches(prev =>
      prev.includes(batch)
        ? prev.filter(b => b !== batch)
        : [...prev, batch]
    );
  };

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
      </div>
    );
  }

  const nextCondition = getNextCondition();
  const balanceFormal = batchCounts.formal;
  const balanceInformal = batchCounts.informal;
  const balanceTotal = balanceFormal + balanceInformal;

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

      {/* Mode Toggle Tabs */}
      <Tabs value={activeMode} onValueChange={(v) => handleModeChange(v as "alternating" | "static")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="alternating" disabled={isSavingAlternating || !isSuperAdmin}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Alternating Mode
          </TabsTrigger>
          <TabsTrigger value="static" disabled={isSavingAlternating || !isSuperAdmin}>
            Static Mode
          </TabsTrigger>
        </TabsList>

        {/* Alternating Mode Content */}
        <TabsContent value="alternating" className="space-y-6">
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
              {/* Balance indicator */}
              <div className="p-4 border rounded-lg">
                <Label className="text-base font-medium mb-2 block">Balance Status</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Based on completed responses {selectedBatches.length > 0 ? "in selected batch(es)" : "across all batches"}.
                </p>
                <div className="flex items-center gap-0">
                  <div 
                    className="bg-blue-500 h-4 rounded-l transition-all" 
                    style={{ 
                      width: `${balanceTotal > 0 ? (balanceFormal / balanceTotal) * 100 : 50}%`
                    }} 
                  />
                  <div 
                    className="bg-orange-500 h-4 rounded-r transition-all" 
                    style={{ 
                      width: `${balanceTotal > 0 ? (balanceInformal / balanceTotal) * 100 : 50}%`
                    }} 
                  />
                </div>
                <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                  <span>Formal: {balanceTotal > 0 ? Math.round((balanceFormal / balanceTotal) * 100) : 50}%</span>
                  <span>Informal: {balanceTotal > 0 ? Math.round((balanceInformal / balanceTotal) * 100) : 50}%</span>
                </div>
              </div>

              {/* Batch scope for balance */}
              <div className="p-4 border rounded-lg space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label>Batch Scope for Balance</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Click batch chips to toggle. Leave none selected to include all batches.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedBatches(availableBatches)}
                      disabled={availableBatches.length === 0}
                    >
                      Select all
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedBatches([])}
                      disabled={selectedBatches.length === 0}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableBatches.length === 0 ? (
                    <span className="text-sm text-muted-foreground">No batches found</span>
                  ) : (
                    availableBatches.map((batch) => (
                      <Badge
                        key={batch}
                        variant={selectedBatches.includes(batch) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleBatchSelection(batch)}
                      >
                        {selectedBatches.includes(batch) ? <Check className="h-3 w-3 mr-1" /> : null}
                        {batch}
                      </Badge>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedBatches.length > 0
                    ? `${selectedBatches.length} batch(es) selected`
                    : "All batches included"}
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/30">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-base font-medium">Formal Completed</Label>
                      {isLoadingBatchCounts ? (
                        <Skeleton className="h-6 w-12" />
                      ) : (
                        <Badge variant="outline" className="text-lg">{batchCounts.formal}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {selectedBatches.length > 0 ? `In selected batch(es)` : "All batches"}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg bg-orange-50 dark:bg-orange-950/30">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-base font-medium">Informal Completed</Label>
                      {isLoadingBatchCounts ? (
                        <Skeleton className="h-6 w-12" />
                      ) : (
                        <Badge variant="outline" className="text-lg">{batchCounts.informal}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {selectedBatches.length > 0 ? `In selected batch(es)` : "All batches"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Diagnostic: assignment vs submitted */}
              <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
                <div>
                  <Label className="text-base font-medium">Assignment vs Submitted (Diagnostic)</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Offsetting and alternating apply to assignments. Submitted counts can still drift because of incomplete sessions.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded border bg-background p-3">
                    <p className="text-sm font-medium mb-1">Assigned (global counters)</p>
                    <p className="text-xs text-muted-foreground">Formal: {formalCount} · Informal: {informalCount}</p>
                  </div>
                  <div className="rounded border bg-background p-3">
                    <p className="text-sm font-medium mb-1">Submitted (current batch scope)</p>
                    <p className="text-xs text-muted-foreground">
                      Formal: {batchCounts.formal} · Informal: {batchCounts.informal}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Gap (submitted - assigned): Formal {batchCounts.formal - formalCount >= 0 ? "+" : ""}{batchCounts.formal - formalCount}, Informal {batchCounts.informal - informalCount >= 0 ? "+" : ""}{batchCounts.informal - informalCount}
                </p>
              </div>

              {/* Offset Input */}
              <div className="p-4 border rounded-lg space-y-4">
                <div>
                  <Label className="text-base font-medium">Condition Offset (Rebalancing)</Label>
                  <p className="text-sm text-muted-foreground">
                    Force the next N real participants to a specific condition
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
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
                  <Select
                    value={offsetType}
                    onValueChange={(v) => setOffsetType(v as "formal" | "informal")}
                    disabled={!isSuperAdmin || isSavingAlternating}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="formal">Formal</SelectItem>
                      <SelectItem value="informal">Informal</SelectItem>
                    </SelectContent>
                  </Select>
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

              {/* Reset and Refresh */}
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
            </CardContent>
          </Card>

        </TabsContent>

        {/* Static Mode Content */}
        <TabsContent value="static" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Static Voice Assistant Configuration</CardTitle>
              <CardDescription>
                All participants will interact with the selected assistant
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-base font-medium">Select Active Assistant</Label>
                <p className="text-sm text-muted-foreground">
                  Click on an assistant to set it as active for all participants
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Batch Manager Section */}
      <BatchManager
        sourceFilter={sourceFilter}
        openBatchCreate={openBatchCreate}
        onBatchCreateConsumed={onBatchCreateConsumed}
      />
    </div>
  );
};
