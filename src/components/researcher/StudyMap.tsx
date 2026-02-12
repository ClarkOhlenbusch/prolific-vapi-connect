import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Position,
  type ReactFlowInstance,
  type Edge,
  type Node,
  type Viewport,
} from "reactflow";
import mermaid from "mermaid";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Eye, ExternalLink, Navigation, Route } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  MASTER_STUDY_MAP_MERMAID,
  NODE_DETAILS,
  STUDY_MAP_GROUP_LABELS,
  type StudyMapFocus,
} from "@/lib/study-map/masterDiagram";
import "reactflow/dist/style.css";

type ParsedNode = {
  id: string;
  label: string;
  group: string;
  route?: string;
  description: string;
};

type ParsedEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

type ParsedDiagram = {
  nodes: ParsedNode[];
  edges: ParsedEdge[];
};

type FlowNodeData = {
  label: string;
  route?: string;
  group: string;
  description: string;
};

type SystemDesignManifest = {
  latest_snapshot?: string | null;
  latest_diff?: string | null;
  generated_at?: string;
};

type SystemDesignSnapshotFile = {
  path: string;
  sha256: string;
  bytes: number;
};

type SystemDesignSnapshot = {
  snapshot_id: string;
  generated_at: string;
  version: string;
  release_status: "local_only" | "pushed" | "released";
  relevant_files: SystemDesignSnapshotFile[];
};

type DiffFileStatus = "added" | "changed" | "removed";

type DiffFileEntry = {
  path: string;
  status: DiffFileStatus;
  before: SystemDesignSnapshotFile | null;
  after: SystemDesignSnapshotFile | null;
  nodeIds: string[];
};

type DiffNodeStatusBuckets = {
  added: Set<string>;
  changed: Set<string>;
  removed: Set<string>;
  all: Set<string>;
};

const GROUP_BASE_POSITIONS: Record<string, { x: number; y: number }> = {
  UNGROUPED: { x: 520, y: 20 },
  JOURNEY: { x: 0, y: 160 },
  LIFECYCLE: { x: 840, y: 160 },
  ARCH: { x: 0, y: 760 },
  DATA: { x: 840, y: 760 },
  DASH: { x: 420, y: 1220 },
};

const GROUP_COLUMNS: Record<string, number> = {
  UNGROUPED: 1,
  JOURNEY: 3,
  LIFECYCLE: 2,
  ARCH: 2,
  DATA: 2,
  DASH: 2,
};

const GROUP_COLORS: Record<string, { bg: string; border: string }> = {
  UNGROUPED: { bg: "#f8fafc", border: "#94a3b8" },
  JOURNEY: { bg: "#eff6ff", border: "#93c5fd" },
  LIFECYCLE: { bg: "#f0fdf4", border: "#86efac" },
  ARCH: { bg: "#faf5ff", border: "#d8b4fe" },
  DATA: { bg: "#fff7ed", border: "#fdba74" },
  DASH: { bg: "#fefce8", border: "#fde047" },
};

const FOCUS_GROUPS: Record<StudyMapFocus, string[]> = {
  all: ["UNGROUPED", "JOURNEY", "LIFECYCLE", "ARCH", "DATA", "DASH"],
  journey: ["UNGROUPED", "JOURNEY"],
  lifecycle: ["UNGROUPED", "LIFECYCLE"],
  architecture: ["UNGROUPED", "ARCH"],
  data: ["UNGROUPED", "DATA"],
  dashboard: ["UNGROUPED", "DASH"],
};

const FOCUS_LABELS: Record<StudyMapFocus, string> = {
  all: "All",
  journey: "Journey",
  lifecycle: "Lifecycle",
  architecture: "Architecture",
  data: "Data",
  dashboard: "Dashboard",
};

const DIFF_STATUS_ORDER: Record<DiffFileStatus, number> = {
  changed: 0,
  added: 1,
  removed: 2,
};

const FILE_NODE_MAPPINGS: { pattern: RegExp; nodeIds: string[] }[] = [
  { pattern: /^src\/App\.tsx$/, nodeIds: ["MASTER", "A_REACT"] },
  { pattern: /^src\/lib\/study-map\/masterDiagram\.ts$/, nodeIds: ["MASTER"] },
  { pattern: /^src\/components\/researcher\/StudyMap\.tsx$/, nodeIds: ["MASTER", "R_DASH"] },
  { pattern: /^src\/hooks\/usePageTracking\.ts$/, nodeIds: ["D_NAV"] },
  { pattern: /^src\/pages\/ProlificId\.tsx$/, nodeIds: ["P_ID"] },
  { pattern: /^src\/pages\/Consent\.tsx$/, nodeIds: ["P_CONSENT"] },
  { pattern: /^src\/pages\/NoConsent\.tsx$/, nodeIds: ["P_CONSENT"] },
  { pattern: /^src\/pages\/Questionnaire\.tsx$/, nodeIds: ["P_Q_PETS"] },
  { pattern: /^src\/pages\/GodspeedQuestionnaire\.tsx$/, nodeIds: ["P_Q_GODSPEED"] },
  { pattern: /^src\/pages\/TiasQuestionnaire\.tsx$/, nodeIds: ["P_Q_TIAS"] },
  { pattern: /^src\/pages\/TipiQuestionnaire\.tsx$/, nodeIds: ["P_Q_TIPI"] },
  { pattern: /^src\/pages\/FeedbackQuestionnaire\.tsx$/, nodeIds: ["P_Q_FEEDBACK"] },
  { pattern: /^src\/pages\/EarlyAccessSignup\.tsx$/, nodeIds: ["P_EA"] },
  { pattern: /^src\/pages\/Debriefing\.tsx$/, nodeIds: ["P_Q_FEEDBACK", "P_EA"] },
  { pattern: /^src\/pages\/Complete\.tsx$/, nodeIds: ["L_COMPLETE"] },
  { pattern: /^src\/pages\/ResearcherDashboard\.tsx$/, nodeIds: ["R_DASH"] },
  { pattern: /^src\/pages\/ResearcherChangelog\.tsx$/, nodeIds: ["R_CHANGELOG"] },
  {
    pattern: /^supabase\/functions\/submit-questionnaire\/index\.ts$/,
    nodeIds: ["L_SUBMIT", "L_ER_SAVE", "D_RESPONSES", "L_COMPLETE"],
  },
  {
    pattern: /^supabase\/functions\/create-researcher-session\/index\.ts$/,
    nodeIds: ["R_LOGIN", "L_PC_CREATE", "D_ROLES"],
  },
  {
    pattern: /^supabase\/functions\/submit-early-access\/index\.ts$/,
    nodeIds: ["P_EA", "L_ER_SAVE", "D_RESPONSES"],
  },
  {
    pattern: /^supabase\/functions\/upsert-experiment-draft\/index\.ts$/,
    nodeIds: ["L_ER_SAVE", "D_RESPONSES", "R_DASH"],
  },
];

const sanitizeToken = (token: string) => token.replace(/\|[^|]*\|/g, "").replace(/;$/, "").trim();

const parseMermaidDiagram = (definition: string): ParsedDiagram => {
  const nodeMap = new Map<string, ParsedNode>();
  const edges: ParsedEdge[] = [];
  const clickMap = new Map<string, string>();
  let currentGroup = "UNGROUPED";
  let edgeIndex = 0;

  const ensureNode = (id: string, group = currentGroup) => {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        id,
        label: id,
        group,
        description: NODE_DETAILS[id] || "No additional metadata available for this node.",
      });
    }
  };

  for (const rawLine of definition.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("%%") || line.startsWith("flowchart")) {
      continue;
    }

    const subgraphMatch = line.match(/^subgraph\s+([A-Za-z0-9_]+)(?:\["([^"]+)"\])?/);
    if (subgraphMatch) {
      currentGroup = subgraphMatch[1];
      continue;
    }

    if (line === "end") {
      currentGroup = "UNGROUPED";
      continue;
    }

    const clickMatch = line.match(/^click\s+([A-Za-z0-9_]+)\s+"([^"]+)"/);
    if (clickMatch) {
      clickMap.set(clickMatch[1], clickMatch[2]);
      continue;
    }

    const nodeMatch = line.match(/^([A-Za-z0-9_]+)\["([^"]+)"\]$/);
    if (nodeMatch) {
      const id = nodeMatch[1];
      const label = nodeMatch[2].replace(/<br\s*\/?>/gi, "\n");
      nodeMap.set(id, {
        id,
        label,
        group: currentGroup,
        description: NODE_DETAILS[id] || "No additional metadata available for this node.",
      });
      continue;
    }

    if (line.includes("-->")) {
      const chainParts = line.split("-->").map((part) => sanitizeToken(part)).filter(Boolean);
      if (chainParts.length >= 2) {
        for (let i = 0; i < chainParts.length - 1; i += 1) {
          const source = chainParts[i];
          const target = chainParts[i + 1];
          ensureNode(source);
          ensureNode(target);
          edges.push({
            id: `edge-${edgeIndex++}`,
            source,
            target,
          });
        }
      }
    }
  }

  const nodes = Array.from(nodeMap.values()).map((node) => ({
    ...node,
    route: clickMap.get(node.id),
  }));

  return { nodes, edges };
};

const buildFlowElements = (parsed: ParsedDiagram, focus: StudyMapFocus): { nodes: Node<FlowNodeData>[]; edges: Edge[] } => {
  const allowedGroups = new Set(FOCUS_GROUPS[focus]);
  const filteredNodes = parsed.nodes.filter((node) => allowedGroups.has(node.group));
  const filteredNodeIds = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges = parsed.edges.filter(
    (edge) => filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target),
  );

  const groupIndices = new Map<string, number>();
  const flowNodes: Node<FlowNodeData>[] = filteredNodes.map((node) => {
    const index = groupIndices.get(node.group) || 0;
    groupIndices.set(node.group, index + 1);

    const base = GROUP_BASE_POSITIONS[node.group] || { x: 0, y: 0 };
    const columns = GROUP_COLUMNS[node.group] || 2;
    const colors = GROUP_COLORS[node.group] || GROUP_COLORS.UNGROUPED;

    const x = base.x + (index % columns) * 260;
    const y = base.y + Math.floor(index / columns) * 120;

    return {
      id: node.id,
      data: {
        label: node.label,
        route: node.route,
        group: STUDY_MAP_GROUP_LABELS[node.group as keyof typeof STUDY_MAP_GROUP_LABELS] || node.group,
        description: node.description,
      },
      position: { x, y },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: {
        width: 230,
        padding: 10,
        borderRadius: 10,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        fontSize: 12,
        lineHeight: 1.25,
      },
    };
  });

  const flowEdges: Edge[] = filteredEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: "smoothstep",
    animated: edge.source === "MASTER",
    style: { stroke: "#64748b", strokeWidth: 1.4 },
    labelStyle: { fill: "#334155", fontSize: 11 },
  }));

  return { nodes: flowNodes, edges: flowEdges };
};

const mapFilePathToNodeIds = (path: string): string[] => {
  const ids = new Set<string>();
  for (const mapping of FILE_NODE_MAPPINGS) {
    if (!mapping.pattern.test(path)) continue;
    mapping.nodeIds.forEach((id) => ids.add(id));
  }
  if (ids.size === 0) ids.add("MASTER");
  return [...ids];
};

const shortHash = (value: string | null | undefined) => (value ? value.slice(0, 8) : "n/a");

const formatBytes = (bytes: number | null | undefined) => {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) return "n/a";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatSnapshotTime = (value: string | null | undefined) => {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const extractSnapshotIdsFromDiffPath = (diffPath: string | null | undefined): { beforeId: string | null; afterId: string | null } => {
  if (!diffPath) return { beforeId: null, afterId: null };
  const fileName = diffPath.split("/").pop() || diffPath;
  const match = fileName.match(/^system-design-diff-(.+)-to-(.+)\.md$/);
  if (!match) return { beforeId: null, afterId: null };
  return {
    beforeId: match[1] === "none" ? null : match[1],
    afterId: match[2] ?? null,
  };
};

const buildDiffFlowElements = (
  base: { nodes: Node<FlowNodeData>[]; edges: Edge[] },
  view: "before" | "after",
  statuses: DiffNodeStatusBuckets,
  focusedNodeIds: Set<string>,
  showOnlyChanged: boolean,
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } => {
  const visibleNodeIds = new Set<string>();
  const nodes = base.nodes
    .filter((node) => node.id === "MASTER" || !showOnlyChanged || statuses.all.has(node.id))
    .map((node) => {
      visibleNodeIds.add(node.id);

      const isRemoved = view === "before" && statuses.removed.has(node.id);
      const isAdded = view === "after" && statuses.added.has(node.id);
      const isChanged = statuses.changed.has(node.id);
      const isFocused = focusedNodeIds.has(node.id);

      let borderColor = (node.style?.border as string) || "#94a3b8";
      let background = (node.style?.background as string) || "#ffffff";
      let boxShadow = "none";
      let borderWidth = "1px";

      if (isRemoved) {
        borderColor = "#dc2626";
        background = "#fee2e2";
        borderWidth = "2px";
      } else if (isAdded) {
        borderColor = "#16a34a";
        background = "#dcfce7";
        borderWidth = "2px";
      } else if (isChanged) {
        borderColor = "#d97706";
        background = "#fef3c7";
        borderWidth = "2px";
      }

      if (isFocused) {
        borderColor = "#2563eb";
        boxShadow = "0 0 0 2px rgba(37, 99, 235, 0.35)";
        borderWidth = "2px";
      }

      return {
        ...node,
        style: {
          ...node.style,
          border: `${borderWidth} solid ${borderColor}`,
          background,
          boxShadow,
          opacity: showOnlyChanged && node.id !== "MASTER" && !statuses.all.has(node.id) ? 0.35 : 1,
        },
      };
    });

  const edges = base.edges
    .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .filter((edge) => {
      if (!showOnlyChanged) return true;
      return (
        statuses.all.has(edge.source) ||
        statuses.all.has(edge.target) ||
        focusedNodeIds.has(edge.source) ||
        focusedNodeIds.has(edge.target)
      );
    })
    .map((edge) => {
      const touchesRemoved = view === "before" && (statuses.removed.has(edge.source) || statuses.removed.has(edge.target));
      const touchesAdded = view === "after" && (statuses.added.has(edge.source) || statuses.added.has(edge.target));
      const touchesChanged = statuses.changed.has(edge.source) || statuses.changed.has(edge.target);
      const touchesFocused = focusedNodeIds.has(edge.source) || focusedNodeIds.has(edge.target);

      let stroke = "#64748b";
      let strokeWidth = 1.4;
      let opacity = showOnlyChanged ? 0.85 : 0.4;
      if (touchesRemoved) {
        stroke = "#dc2626";
        strokeWidth = 2;
        opacity = 0.95;
      } else if (touchesAdded) {
        stroke = "#16a34a";
        strokeWidth = 2;
        opacity = 0.95;
      } else if (touchesChanged) {
        stroke = "#d97706";
        strokeWidth = 2;
        opacity = 0.95;
      }
      if (touchesFocused) {
        stroke = "#2563eb";
        strokeWidth = 2.4;
        opacity = 1;
      }

      return {
        ...edge,
        animated: edge.source === "MASTER" || touchesFocused,
        style: {
          ...(edge.style || {}),
          stroke,
          strokeWidth,
          opacity,
        },
      };
    });

  return { nodes, edges };
};

const triggerDownload = (href: string, filename: string) => {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
};

const StudyMap = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const parsedDiagram = useMemo(() => parseMermaidDiagram(MASTER_STUDY_MAP_MERMAID), []);
  const [focus, setFocus] = useState<StudyMapFocus>("all");
  const [activeLayer, setActiveLayer] = useState<"flow" | "mermaid">("flow");
  const [clickMode, setClickMode] = useState<"open" | "inspect">("open");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | null>(null);
  const [selectedDiffNodeId, setSelectedDiffNodeId] = useState<string | null>(null);
  const [showOnlyChangedNodes, setShowOnlyChangedNodes] = useState(false);
  const [syncDiffViewport, setSyncDiffViewport] = useState(true);
  const [systemDesignManifest, setSystemDesignManifest] = useState<SystemDesignManifest | null>(null);
  const [beforeSnapshot, setBeforeSnapshot] = useState<SystemDesignSnapshot | null>(null);
  const [afterSnapshot, setAfterSnapshot] = useState<SystemDesignSnapshot | null>(null);
  const [isManifestLoading, setIsManifestLoading] = useState(true);
  const mermaidHostRef = useRef<HTMLDivElement | null>(null);
  const mermaidViewRef = useRef<HTMLDivElement | null>(null);
  const flowViewRef = useRef<HTMLDivElement | null>(null);
  const beforeDiffInstanceRef = useRef<ReactFlowInstance | null>(null);
  const afterDiffInstanceRef = useRef<ReactFlowInstance | null>(null);
  const syncingViewportRef = useRef(false);

  const flowElements = useMemo(
    () => buildFlowElements(parsedDiagram, focus),
    [parsedDiagram, focus],
  );
  const fullFlowElements = useMemo(
    () => buildFlowElements(parsedDiagram, "all"),
    [parsedDiagram],
  );

  const toSystemDesignAssetHref = useCallback((path: string | null | undefined) => {
    if (!path) return null;
    const normalized = path.trim().replace(/^\/+/, "");
    if (!normalized) return null;
    return normalized.startsWith("system-design/") ? `/${normalized}` : `/system-design/${normalized}`;
  }, []);

  const loadSystemDesignManifest = useCallback(async () => {
    setIsManifestLoading(true);
    try {
      const response = await fetch("/system-design/manifest.json");
      if (!response.ok) {
        setSystemDesignManifest(null);
        setBeforeSnapshot(null);
        setAfterSnapshot(null);
        return;
      }
      const manifest = (await response.json()) as SystemDesignManifest;
      setSystemDesignManifest(manifest);

      const snapshotHref = toSystemDesignAssetHref(manifest.latest_snapshot ?? null);
      if (!snapshotHref) {
        setAfterSnapshot(null);
        setBeforeSnapshot(null);
        return;
      }

      const afterResponse = await fetch(snapshotHref);
      if (!afterResponse.ok) {
        setAfterSnapshot(null);
        setBeforeSnapshot(null);
        return;
      }
      const latestSnapshot = (await afterResponse.json()) as SystemDesignSnapshot;
      setAfterSnapshot(latestSnapshot);

      const { beforeId } = extractSnapshotIdsFromDiffPath(manifest.latest_diff ?? null);
      if (!beforeId) {
        setBeforeSnapshot(null);
        return;
      }

      const beforePath = `/system-design/snapshots/system-design-snapshot-${beforeId}.json`;
      const beforeResponse = await fetch(beforePath);
      if (!beforeResponse.ok) {
        setBeforeSnapshot(null);
        return;
      }
      const previousSnapshot = (await beforeResponse.json()) as SystemDesignSnapshot;
      setBeforeSnapshot(previousSnapshot);
    } catch {
      setSystemDesignManifest(null);
      setBeforeSnapshot(null);
      setAfterSnapshot(null);
    } finally {
      setIsManifestLoading(false);
    }
  }, [toSystemDesignAssetHref]);

  const selectedNode = useMemo(
    () => flowElements.nodes.find((node) => node.id === selectedNodeId) || null,
    [flowElements.nodes, selectedNodeId],
  );

  const selectedConnections = useMemo(() => {
    if (!selectedNodeId) return [];
    return parsedDiagram.edges.filter(
      (edge) => edge.source === selectedNodeId || edge.target === selectedNodeId,
    );
  }, [parsedDiagram.edges, selectedNodeId]);

  const diffEntries = useMemo(() => {
    if (!afterSnapshot) return [] as DiffFileEntry[];
    const beforeMap = new Map<string, SystemDesignSnapshotFile>(
      (beforeSnapshot?.relevant_files || []).map((file) => [file.path, file]),
    );
    const afterMap = new Map<string, SystemDesignSnapshotFile>(
      (afterSnapshot.relevant_files || []).map((file) => [file.path, file]),
    );

    const allPaths = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);
    const rows: DiffFileEntry[] = [];

    for (const path of allPaths) {
      const beforeFile = beforeMap.get(path) || null;
      const afterFile = afterMap.get(path) || null;
      let status: DiffFileStatus | null = null;

      if (!beforeFile && afterFile) status = "added";
      else if (beforeFile && !afterFile) status = "removed";
      else if (beforeFile && afterFile && beforeFile.sha256 !== afterFile.sha256) status = "changed";
      if (!status) continue;

      rows.push({
        path,
        status,
        before: beforeFile,
        after: afterFile,
        nodeIds: mapFilePathToNodeIds(path),
      });
    }

    return rows.sort((a, b) => {
      const statusCmp = DIFF_STATUS_ORDER[a.status] - DIFF_STATUS_ORDER[b.status];
      if (statusCmp !== 0) return statusCmp;
      return a.path.localeCompare(b.path);
    });
  }, [afterSnapshot, beforeSnapshot]);

  const diffCounts = useMemo(() => {
    const counts = { added: 0, changed: 0, removed: 0 };
    for (const entry of diffEntries) counts[entry.status] += 1;
    return counts;
  }, [diffEntries]);

  const diffNodeStatuses = useMemo(() => {
    const createBuckets = (): DiffNodeStatusBuckets => ({
      added: new Set<string>(),
      changed: new Set<string>(),
      removed: new Set<string>(),
      all: new Set<string>(),
    });

    const beforeBuckets = createBuckets();
    const afterBuckets = createBuckets();

    for (const row of diffEntries) {
      const nodeIds = row.nodeIds.length > 0 ? row.nodeIds : ["MASTER"];
      for (const nodeId of nodeIds) {
        if (row.status === "added") {
          afterBuckets.added.add(nodeId);
          afterBuckets.all.add(nodeId);
        } else if (row.status === "removed") {
          beforeBuckets.removed.add(nodeId);
          beforeBuckets.all.add(nodeId);
        } else {
          beforeBuckets.changed.add(nodeId);
          afterBuckets.changed.add(nodeId);
          beforeBuckets.all.add(nodeId);
          afterBuckets.all.add(nodeId);
        }
      }
    }

    return { before: beforeBuckets, after: afterBuckets };
  }, [diffEntries]);

  const selectedDiffEntry = useMemo(
    () => diffEntries.find((entry) => entry.path === selectedDiffPath) ?? null,
    [diffEntries, selectedDiffPath],
  );

  const focusedDiffNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedDiffEntry) selectedDiffEntry.nodeIds.forEach((id) => ids.add(id));
    if (selectedDiffNodeId) ids.add(selectedDiffNodeId);
    return ids;
  }, [selectedDiffEntry, selectedDiffNodeId]);

  const beforeDiffFlowElements = useMemo(
    () =>
      buildDiffFlowElements(
        fullFlowElements,
        "before",
        diffNodeStatuses.before,
        focusedDiffNodeIds,
        showOnlyChangedNodes,
      ),
    [fullFlowElements, diffNodeStatuses.before, focusedDiffNodeIds, showOnlyChangedNodes],
  );

  const afterDiffFlowElements = useMemo(
    () =>
      buildDiffFlowElements(
        fullFlowElements,
        "after",
        diffNodeStatuses.after,
        focusedDiffNodeIds,
        showOnlyChangedNodes,
      ),
    [fullFlowElements, diffNodeStatuses.after, focusedDiffNodeIds, showOnlyChangedNodes],
  );

  const selectedDiffNode = useMemo(() => {
    if (!selectedDiffNodeId) return null;
    return parsedDiagram.nodes.find((node) => node.id === selectedDiffNodeId) || null;
  }, [parsedDiagram.nodes, selectedDiffNodeId]);

  const selectedDiffConnections = useMemo(() => {
    if (!selectedDiffNodeId) return [];
    return parsedDiagram.edges.filter(
      (edge) => edge.source === selectedDiffNodeId || edge.target === selectedDiffNodeId,
    );
  }, [parsedDiagram.edges, selectedDiffNodeId]);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "neutral",
      flowchart: {
        htmlLabels: true,
        useMaxWidth: true,
      },
    });
  }, []);

  useEffect(() => {
    void loadSystemDesignManifest();
  }, [loadSystemDesignManifest]);

  useEffect(() => {
    const render = async () => {
      if (!mermaidHostRef.current) return;
      try {
        const renderId = `system-design-${Math.random().toString(36).slice(2)}`;
        const { svg, bindFunctions } = await mermaid.render(renderId, MASTER_STUDY_MAP_MERMAID);
        mermaidHostRef.current.innerHTML = svg;
        bindFunctions?.(mermaidHostRef.current);

        const links = mermaidHostRef.current.querySelectorAll("a");
        links.forEach((link) => {
          const href = link.getAttribute("href") || link.getAttribute("xlink:href");
          if (!href || !href.startsWith("/")) return;
          link.addEventListener("click", (event) => {
            event.preventDefault();
            navigate(href);
          });
        });
      } catch (error) {
        console.error("Failed to render Mermaid diagram:", error);
      }
    };

    render();
  }, [navigate]);

  useEffect(() => {
    if (selectedNodeId && !flowElements.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [flowElements.nodes, selectedNodeId]);

  useEffect(() => {
    if (selectedDiffPath && !diffEntries.some((entry) => entry.path === selectedDiffPath)) {
      setSelectedDiffPath(null);
    }
  }, [diffEntries, selectedDiffPath]);

  useEffect(() => {
    if (!selectedDiffPath && diffEntries.length > 0) {
      setSelectedDiffPath(diffEntries[0].path);
    }
  }, [diffEntries, selectedDiffPath]);

  useEffect(() => {
    if (selectedDiffNodeId && !parsedDiagram.nodes.some((node) => node.id === selectedDiffNodeId)) {
      setSelectedDiffNodeId(null);
    }
  }, [parsedDiagram.nodes, selectedDiffNodeId]);

  useEffect(() => {
    if (selectedDiffEntry && selectedDiffEntry.nodeIds.length > 0) {
      setSelectedDiffNodeId((current) => current ?? selectedDiffEntry.nodeIds[0]);
    }
  }, [selectedDiffEntry]);

  useEffect(() => {
    if (!beforeSnapshot || !afterSnapshot) return;
    window.setTimeout(() => {
      beforeDiffInstanceRef.current?.fitView({ padding: 0.25, duration: 250 });
      afterDiffInstanceRef.current?.fitView({ padding: 0.25, duration: 250 });
    }, 0);
  }, [beforeSnapshot?.snapshot_id, afterSnapshot?.snapshot_id]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<FlowNodeData>) => {
      setSelectedNodeId(node.id);
      if (clickMode === "open" && node.data.route) {
        navigate(node.data.route);
      }
    },
    [clickMode, navigate],
  );

  const syncDiffViewportBetweenPanels = useCallback(
    (source: "before" | "after", viewport: Viewport) => {
      if (!syncDiffViewport || syncingViewportRef.current) return;
      const target = source === "before" ? afterDiffInstanceRef.current : beforeDiffInstanceRef.current;
      if (!target) return;
      syncingViewportRef.current = true;
      target.setViewport(viewport, { duration: 0 });
      window.setTimeout(() => {
        syncingViewportRef.current = false;
      }, 0);
    },
    [syncDiffViewport],
  );

  const handleBeforeDiffMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      syncDiffViewportBetweenPanels("before", viewport);
    },
    [syncDiffViewportBetweenPanels],
  );

  const handleAfterDiffMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      syncDiffViewportBetweenPanels("after", viewport);
    },
    [syncDiffViewportBetweenPanels],
  );

  const handleDiffNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<FlowNodeData>) => {
      setSelectedDiffNodeId(node.id);
      if (clickMode === "open" && node.data.route) {
        navigate(node.data.route);
      }
    },
    [clickMode, navigate],
  );

  const exportPng = useCallback(async () => {
    try {
      const target = activeLayer === "flow" ? flowViewRef.current : mermaidViewRef.current;
      if (!target) return;
      const dataUrl = await toPng(target, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      triggerDownload(dataUrl, `system-design-${activeLayer}.png`);
    } catch (_error) {
      toast({
        title: "Export failed",
        description: "Could not export PNG for the current view.",
        variant: "destructive",
      });
    }
  }, [activeLayer, toast]);

  const exportPdf = useCallback(async () => {
    try {
      const target = activeLayer === "flow" ? flowViewRef.current : mermaidViewRef.current;
      if (!target) return;
      const dataUrl = await toPng(target, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });

      const image = new Image();
      image.src = dataUrl;
      await new Promise((resolve) => {
        image.onload = resolve;
      });

      const pdf = new jsPDF({
        orientation: image.width >= image.height ? "landscape" : "portrait",
        unit: "px",
        format: [image.width, image.height],
      });
      pdf.addImage(dataUrl, "PNG", 0, 0, image.width, image.height);
      pdf.save(`system-design-${activeLayer}.pdf`);
    } catch (_error) {
      toast({
        title: "Export failed",
        description: "Could not export PDF for the current view.",
        variant: "destructive",
      });
    }
  }, [activeLayer, toast]);

  const exportSvg = useCallback(() => {
    try {
      const svgEl = mermaidHostRef.current?.querySelector("svg");
      if (!svgEl) {
        toast({
          title: "Export unavailable",
          description: "Mermaid SVG is not ready yet.",
          variant: "destructive",
        });
        return;
      }
      const serializer = new XMLSerializer();
      const svgContent = serializer.serializeToString(svgEl);
      const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, "system-design-mermaid.svg");
      URL.revokeObjectURL(url);
    } catch (_error) {
      toast({
        title: "Export failed",
        description: "Could not export SVG.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const exportMermaidSource = useCallback(() => {
    const blob = new Blob([MASTER_STUDY_MAP_MERMAID.trim()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, "system-design-master.mmd");
    URL.revokeObjectURL(url);
  }, []);

  const latestSnapshotHref = toSystemDesignAssetHref(systemDesignManifest?.latest_snapshot ?? null);
  const latestDiffHref = toSystemDesignAssetHref(systemDesignManifest?.latest_diff ?? null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Design</CardTitle>
        <CardDescription>
          Master diagram with linked sub-diagrams (journey, lifecycle, architecture, data, dashboard).
          Mermaid is the source-of-truth; React Flow is the interactive exploration layer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Layer</Badge>
          <Button
            variant={activeLayer === "flow" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveLayer("flow")}
          >
            <Route className="h-4 w-4 mr-2" />
            React Flow
          </Button>
          <Button
            variant={activeLayer === "mermaid" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveLayer("mermaid")}
          >
            <Eye className="h-4 w-4 mr-2" />
            Mermaid
          </Button>
          <Badge variant="outline" className="ml-2">Click Mode</Badge>
          <Button
            variant={clickMode === "open" ? "default" : "outline"}
            size="sm"
            onClick={() => setClickMode("open")}
          >
            <Navigation className="h-4 w-4 mr-2" />
            Open Route
          </Button>
          <Button
            variant={clickMode === "inspect" ? "default" : "outline"}
            size="sm"
            onClick={() => setClickMode("inspect")}
          >
            Inspect Node
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Focus</Badge>
          {Object.entries(FOCUS_LABELS).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={focus === value ? "default" : "outline"}
              onClick={() => setFocus(value as StudyMapFocus)}
            >
              {label}
            </Button>
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={exportPng}>
              <Download className="h-4 w-4 mr-2" />
              PNG
            </Button>
            <Button size="sm" variant="outline" onClick={exportPdf}>
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
            <Button size="sm" variant="outline" onClick={exportSvg}>
              <Download className="h-4 w-4 mr-2" />
              SVG
            </Button>
            <Button size="sm" variant="outline" onClick={exportMermaidSource}>
              <Download className="h-4 w-4 mr-2" />
              .mmd
            </Button>
          </div>
        </div>

        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-sm font-medium">Latest pre-push artifacts</p>
          <p className="text-xs text-muted-foreground mb-2">
            Snapshot + diff generated by the push workflow for review before approval.
          </p>
          {latestSnapshotHref || latestDiffHref ? (
            <div className="flex flex-wrap gap-2">
              {latestSnapshotHref ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={latestSnapshotHref} target="_blank" rel="noreferrer">
                    Snapshot
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              ) : null}
              {latestDiffHref ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={latestDiffHref} target="_blank" rel="noreferrer">
                    Diff
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => void loadSystemDesignManifest()} disabled={isManifestLoading}>
                {isManifestLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No published artifacts found at <code className="bg-background px-1 rounded">/system-design/manifest.json</code>.
            </p>
          )}
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Diff Mode: Before vs After</p>
              <p className="text-xs text-muted-foreground">
                Visualize the latest System Design delta with highlighted nodes and linked change context.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-green-600/40 text-green-700">Added {diffCounts.added}</Badge>
              <Badge variant="outline" className="border-amber-600/40 text-amber-700">Changed {diffCounts.changed}</Badge>
              <Badge variant="outline" className="border-red-600/40 text-red-700">Removed {diffCounts.removed}</Badge>
              <Button
                size="sm"
                variant={showOnlyChangedNodes ? "default" : "outline"}
                onClick={() => setShowOnlyChangedNodes((value) => !value)}
              >
                {showOnlyChangedNodes ? "Show full graph" : "Show only changed"}
              </Button>
              <Button
                size="sm"
                variant={syncDiffViewport ? "default" : "outline"}
                onClick={() => setSyncDiffViewport((value) => !value)}
              >
                {syncDiffViewport ? "Sync pan/zoom on" : "Sync pan/zoom off"}
              </Button>
            </div>
          </div>

          {afterSnapshot ? (
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_350px]">
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-md border bg-white">
                  <div className="border-b px-3 py-2">
                    <p className="text-xs font-medium">Before</p>
                    {beforeSnapshot ? (
                      <p className="text-[11px] text-muted-foreground">
                        {beforeSnapshot.snapshot_id} · {formatSnapshotTime(beforeSnapshot.generated_at)}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">No previous snapshot available in public artifacts.</p>
                    )}
                  </div>
                  {beforeSnapshot ? (
                    <div className="h-[520px] w-full">
                      <ReactFlow
                        nodes={beforeDiffFlowElements.nodes}
                        edges={beforeDiffFlowElements.edges}
                        onNodeClick={handleDiffNodeClick}
                        onInit={(instance) => {
                          beforeDiffInstanceRef.current = instance;
                        }}
                        onMoveEnd={handleBeforeDiffMoveEnd}
                        fitView
                        fitViewOptions={{ padding: 0.25 }}
                        nodesDraggable={false}
                        nodesConnectable={false}
                        proOptions={{ hideAttribution: true }}
                      >
                        <MiniMap zoomable pannable />
                        <Controls />
                        <Background color="#e2e8f0" gap={16} />
                      </ReactFlow>
                    </div>
                  ) : (
                    <div className="h-[520px] p-4 text-sm text-muted-foreground flex items-center justify-center">
                      Generate at least two snapshots so before/after can be compared here.
                    </div>
                  )}
                </div>

                <div className="rounded-md border bg-white">
                  <div className="border-b px-3 py-2">
                    <p className="text-xs font-medium">After</p>
                    <p className="text-[11px] text-muted-foreground">
                      {afterSnapshot.snapshot_id} · {formatSnapshotTime(afterSnapshot.generated_at)}
                    </p>
                  </div>
                  <div className="h-[520px] w-full">
                    <ReactFlow
                      nodes={afterDiffFlowElements.nodes}
                      edges={afterDiffFlowElements.edges}
                      onNodeClick={handleDiffNodeClick}
                      onInit={(instance) => {
                        afterDiffInstanceRef.current = instance;
                      }}
                      onMoveEnd={handleAfterDiffMoveEnd}
                      fitView
                      fitViewOptions={{ padding: 0.25 }}
                      nodesDraggable={false}
                      nodesConnectable={false}
                      proOptions={{ hideAttribution: true }}
                    >
                      <MiniMap zoomable pannable />
                      <Controls />
                      <Background color="#e2e8f0" gap={16} />
                    </ReactFlow>
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium">Change context</p>
                  <p className="text-xs text-muted-foreground">
                    Click a changed file to focus related nodes in both diagrams.
                  </p>
                </div>

                {selectedDiffEntry ? (
                  <div className="rounded-md border bg-muted/20 p-2 space-y-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{selectedDiffEntry.status}</p>
                    <p className="text-xs font-mono break-all">{selectedDiffEntry.path}</p>
                    <p className="text-xs text-muted-foreground">
                      Before: {formatBytes(selectedDiffEntry.before?.bytes ?? null)} ({shortHash(selectedDiffEntry.before?.sha256)})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      After: {formatBytes(selectedDiffEntry.after?.bytes ?? null)} ({shortHash(selectedDiffEntry.after?.sha256)})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Mapped nodes: {selectedDiffEntry.nodeIds.join(", ")}
                    </p>
                  </div>
                ) : null}

                {selectedDiffNode ? (
                  <div className="rounded-md border bg-muted/20 p-2 space-y-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Focused node</p>
                    <p className="text-sm font-medium">{selectedDiffNode.label}</p>
                    <p className="text-xs text-muted-foreground">{selectedDiffNode.description}</p>
                    <p className="text-xs text-muted-foreground">Connections: {selectedDiffConnections.length}</p>
                  </div>
                ) : null}

                <div className="max-h-[310px] space-y-1 overflow-y-auto pr-1">
                  {diffEntries.length > 0 ? (
                    diffEntries.map((entry) => (
                      <button
                        key={entry.path}
                        type="button"
                        onClick={() => {
                          setSelectedDiffPath(entry.path);
                          if (entry.nodeIds.length > 0) setSelectedDiffNodeId(entry.nodeIds[0]);
                        }}
                        className={`w-full rounded border px-2 py-1.5 text-left transition-colors ${
                          selectedDiffPath === entry.path ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                        }`}
                      >
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{entry.status}</p>
                        <p className="font-mono text-[11px] break-all">{entry.path}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {entry.nodeIds.join(", ")}
                        </p>
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No changed files detected between available snapshots.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No snapshot loaded yet. Run the push workflow preflight to generate and publish System Design artifacts.
            </p>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-md border bg-white">
            {activeLayer === "flow" ? (
              <div ref={flowViewRef} className="h-[760px] w-full">
                <ReactFlow
                  nodes={flowElements.nodes}
                  edges={flowElements.edges}
                  onNodeClick={handleNodeClick}
                  fitView
                  fitViewOptions={{ padding: 0.25 }}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  proOptions={{ hideAttribution: true }}
                >
                  <MiniMap zoomable pannable />
                  <Controls />
                  <Background color="#e2e8f0" gap={16} />
                </ReactFlow>
              </div>
            ) : (
              <div ref={mermaidViewRef} className="h-[760px] overflow-auto p-4">
                <div ref={mermaidHostRef} className="min-w-[980px]" />
              </div>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Node Details</CardTitle>
              <CardDescription>
                In Open Route mode, clicking a routed node navigates in the same tab.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedNode ? (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">Node</p>
                    <p className="font-medium whitespace-pre-line">{selectedNode.data.label}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Group</p>
                    <p className="font-medium">{selectedNode.data.group}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p className="text-sm">{selectedNode.data.description}</p>
                  </div>
                  {selectedNode.data.route && (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => navigate(selectedNode.data.route as string)}
                    >
                      Open {selectedNode.data.route}
                    </Button>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Connections</p>
                    <div className="space-y-1">
                      {selectedConnections.length > 0 ? (
                        selectedConnections.map((edge) => (
                          <p key={edge.id} className="text-xs text-muted-foreground">
                            {edge.source} → {edge.target}
                          </p>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">No mapped connections.</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a node in React Flow to inspect metadata and mapped relationships.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
};

export default StudyMap;
