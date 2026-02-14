import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { useResearcherMode } from "@/contexts/ResearcherModeContext";
import { supabase } from "@/integrations/supabase/client";
import { buildInfo, formatBuildLabel } from "@/lib/build-info";

export const BuildVersionBadge = () => {
  const location = useLocation();
  const { isResearcherMode } = useResearcherMode();
  const [uncommittedCounter, setUncommittedCounter] = useState(0);
  const [changelogVersion, setChangelogVersion] = useState<string | null>(null);

  const show = useMemo(() => {
    // Show for all researcher routes, and also for participant flow when researcher mode is enabled.
    return location.pathname.startsWith("/researcher") || isResearcherMode;
  }, [isResearcherMode, location.pathname]);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    (async () => {
      try {
        if (import.meta.env.DEV) {
          const res = await fetch("/__dev__/verification-version");
          const payload = (await res.json()) as { ok?: boolean; version?: unknown; patch?: unknown };
          if (!cancelled && typeof payload?.version === "string" && payload.version.trim()) {
            setChangelogVersion(payload.version.trim().replace(/^v/, ""));
            if (typeof payload?.patch === "number" && Number.isFinite(payload.patch) && payload.patch > 0) {
              setUncommittedCounter(payload.patch);
            }
            return;
          }
        }

        const { data, error } = await supabase.rpc("get_latest_changelog_version");
        if (cancelled) return;
        if (error) return;
        if (typeof data === "string" && data.trim()) setChangelogVersion(data.trim());
      } catch {
        // Ignore; badge will fall back to package version.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [show]);

  if (!show) return null;

  const baseVersion = changelogVersion || buildInfo.pkgVersion;
  const label = formatBuildLabel({ baseVersion, uncommittedCounter });

  return (
    <div className="fixed top-2 right-2 z-50 pointer-events-none">
      <Badge
        variant="outline"
        className="pointer-events-auto font-mono text-[11px] text-muted-foreground bg-background/80 backdrop-blur"
        title={[
          `Built at: ${buildInfo.builtAt}`,
          `Changelog: ${baseVersion}`,
          `Git: ${buildInfo.gitSha}${buildInfo.gitDirty ? " (dirty at dev-server start)" : ""}`,
          import.meta.env.DEV ? "Counter increments on HMR updates." : null,
        ].filter(Boolean).join("\n")}
      >
        {label}
      </Badge>
    </div>
  );
};
