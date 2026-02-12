import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Position,
  type Edge,
  type Node,
} from "reactflow";
import mermaid from "mermaid";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Eye, Navigation, Route } from "lucide-react";
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
  const mermaidHostRef = useRef<HTMLDivElement | null>(null);
  const mermaidViewRef = useRef<HTMLDivElement | null>(null);
  const flowViewRef = useRef<HTMLDivElement | null>(null);

  const flowElements = useMemo(
    () => buildFlowElements(parsedDiagram, focus),
    [parsedDiagram, focus],
  );

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
    const render = async () => {
      if (!mermaidHostRef.current) return;
      try {
        const renderId = `study-map-${Math.random().toString(36).slice(2)}`;
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

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<FlowNodeData>) => {
      setSelectedNodeId(node.id);
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
      triggerDownload(dataUrl, `study-map-${activeLayer}.png`);
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
      pdf.save(`study-map-${activeLayer}.pdf`);
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
      triggerDownload(url, "study-map-mermaid.svg");
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
    triggerDownload(url, "study-map-master.mmd");
    URL.revokeObjectURL(url);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Study Map</CardTitle>
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
