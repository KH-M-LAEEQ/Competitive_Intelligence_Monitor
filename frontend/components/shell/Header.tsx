"use client";

import { useState } from "react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { apiFetch } from "@/lib/api";
import { Competitor, Surface } from "@/lib/types";

export default function Header() {
  const { workspaceId, workspace, refreshPendingApprovals } = useWorkspaceContext();
  const [running, setRunning] = useState(false);
  const [lastSweep, setLastSweep] = useState<string | null>(null);

  async function handleRunCheckNow() {
    if (!workspaceId) return;
    setRunning(true);
    try {
      const competitors: Competitor[] = await apiFetch(`/workspaces/${workspaceId}/competitors/`);
      for (const competitor of competitors) {
        const surfaces: Surface[] = await apiFetch(
          `/workspaces/${workspaceId}/competitors/${competitor.id}/surfaces/`
        );
        for (const surface of surfaces) {
          try {
            await apiFetch(
              `/workspaces/${workspaceId}/competitors/${competitor.id}/surfaces/${surface.id}/check`,
              { method: "POST" }
            );
          } catch {
            // One surface failing (e.g. an unreachable URL) shouldn't stop the sweep.
          }
        }
      }
      setLastSweep(new Date().toLocaleTimeString());
      await refreshPendingApprovals();
    } finally {
      setRunning(false);
    }
  }

  return (
    <header className="sticky top-0 z-10 flex h-[62px] items-center gap-[18px] border-b border-[var(--border-subtle)] bg-[var(--bg-page)]/90 px-[34px] backdrop-blur">
      <div className="flex items-center gap-[9px]">
        <span
          className="h-1.5 w-1.5 rounded-full bg-[var(--teal)]"
          style={{ animation: "pulseDot 2.4s ease-in-out infinite" }}
        />
        <span className="font-mono text-[11px] tracking-wide text-[var(--text-muted)]">
          Agent live &middot; last sweep {lastSweep ?? "not yet run"}
        </span>
      </div>
      <div className="flex-1" />
      <div className="hidden h-[34px] w-[270px] items-center gap-[9px] rounded-[9px] border border-[var(--border-input)] bg-[var(--bg-input)] px-[13px] sm:flex">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="4.8" stroke="var(--text-dim)" strokeWidth="1.4" />
          <path d="M10.6 10.6L14 14" stroke="var(--text-dim)" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span className="text-[12.5px] text-[var(--text-dim)]">Search changes, competitors&hellip;</span>
      </div>
      <div className="flex h-[34px] items-center gap-2 rounded-[9px] border border-[var(--accent-border)] bg-[var(--accent-wash)] px-3">
        <span className="font-mono text-[10.5px] uppercase tracking-[.1em] text-[var(--accent)]">
          {workspace?.role ?? "member"}
        </span>
      </div>
      <button
        onClick={handleRunCheckNow}
        disabled={running || !workspaceId}
        className="h-[34px] rounded-[9px] bg-[var(--accent)] px-[15px] text-[12.5px] font-semibold text-[var(--accent-on)] disabled:opacity-50"
      >
        {running ? "Checking all surfaces..." : "Run check now"}
      </button>
    </header>
  );
}
