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
import { RefreshCw, RotateCcw, Users, Filter } from "lucide-react";
import { BatchManager } from "./BatchManager";

const ASSISTANT_IDS = {
  formal: "77569740-f001-4419-92f8-78a6ed2dde70",
  informal: "f391bf0c-f1d2-4473-bdf8-e88343224d68",
};

const PRACTICE_ASSISTANT_IDS = {
  formal: "ea2a5f95-5c07-4498-996b-5b3e204192f8",
  informal: "30394944-4d48-4586-8e6d-cd3d6b347e80",
};

export const ExperimentSettings = () => {
  const { isSuperAdmin, user } = useResearcherAuth();
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
    fetchSettings();
    fetchAvailableBatches();
  }, []);

  useEffect(() => {
    fetchBatchCounts();
  }, [selectedBatches]);

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
      const { data, error } = await supabase
        .from("experiment_responses")
        .select("batch_label")
        .not("batch_label", "is", null);

      if (error) {
        console.error("Error fetching batches:", error);
        return;
      }

      const uniqueBatches = [...new Set(data?.map(r => r.batch_label).filter(Boolean))] as string[];
      setAvailableBatches(uniqueBatches.sort());
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const fetchBatchCounts = async () => {
    setIsLoadingBatchCounts(true);
    try {
      let query = supabase
        .from("experiment_responses")
        .select("assistant_type");

      if (selectedBatches.length > 0) {
        query = query.in("batch_label", selectedBatches);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching batch counts:", error);
        return;
      }

      const formal = data?.filter(r => r.assistant_type === "formal").length || 0;
      const informal = data?.filter(r => r.assistant_type === "informal").length || 0;
      setBatchCounts({ formal, informal });
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoadingBatchCounts(false);
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

  const handleModeChange = async (mode: "alternating" | "static") => {
    if (!isSuperAdmin) {
      toast.error("Only super admins can change this setting");
      return;
    }

    const enabled = mode === "alternating";
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
              {/* Assignment Counters */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 border rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-base font-medium">Formal Assignments</Label>
                    <Badge variant="outline" className="text-lg">{formalCount}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Real participants assigned to formal
                  </p>
                </div>
                <div className="p-4 border rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-base font-medium">Informal Assignments</Label>
                    <Badge variant="outline" className="text-lg">{informalCount}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Real participants assigned to informal
                  </p>
                </div>
              </div>

              {/* Balance indicator */}
              <div className="p-4 border rounded-lg">
                <Label className="text-base font-medium mb-2 block">Balance Status</Label>
                <div className="flex items-center gap-0">
                  <div 
                    className="bg-blue-500 h-4 rounded-l transition-all" 
                    style={{ 
                      width: `${formalCount + informalCount > 0 ? (formalCount / (formalCount + informalCount)) * 100 : 50}%` 
                    }} 
                  />
                  <div 
                    className="bg-orange-500 h-4 rounded-r transition-all" 
                    style={{ 
                      width: `${formalCount + informalCount > 0 ? (informalCount / (formalCount + informalCount)) * 100 : 50}%` 
                    }} 
                  />
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

          {/* Completed Responses by Batch */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Completed Responses by Batch
              </CardTitle>
              <CardDescription>
                View actual completed response counts filtered by batch
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Filter by Batch(es)</Label>
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
                        {batch}
                      </Badge>
                    ))
                  )}
                </div>
                {selectedBatches.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedBatches([])}
                  >
                    Clear filter
                  </Button>
                )}
              </div>

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
      <BatchManager />
    </div>
  );
};
