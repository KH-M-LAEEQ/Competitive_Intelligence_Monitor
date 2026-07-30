"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { ChangeLog, Competitor, Surface } from "@/lib/types";
import ClassificationBadge from "@/components/ui/ClassificationBadge";
import MaterialityBar from "@/components/ui/MaterialityBar";

const NOISE_STORAGE_PREFIX = "ci-noise-dismissed:";
const DIFF_PREVIEW_LINES = 14;

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function diffLines(diff: string | null) {
  if (!diff) return [];
  return diff
    .split("\n")
    .filter((l) => !l.startsWith("---") && !l.startsWith("+++") && !l.startsWith("@@"))
    .map((line) => {
      if (line.startsWith("+")) return { kind: "add" as const, text: line.slice(1) };
      if (line.startsWith("-")) return { kind: "del" as const, text: line.slice(1) };
      return { kind: "ctx" as const, text: line };
    });
}

export default function ChangeFeedPage() {
  const { workspaceId, ready: contextReady } = useWorkspaceContext();

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [surfacesById, setSurfacesById] = useState<Record<number, Surface>>({});
  const [changeLogs, setChangeLogs] = useState<ChangeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [materialOnly, setMaterialOnly] = useState(false);
  const [noiseIds, setNoiseIds] = useState<Set<number>>(new Set());
  const [showFiltered, setShowFiltered] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [drafting, setDrafting] = useState<Record<number, boolean>>({});
  const [drafted, setDrafted] = useState<Record<number, boolean>>({});
  const [draftError, setDraftError] = useState<Record<number, string>>({});

  const storageKey = workspaceId ? `${NOISE_STORAGE_PREFIX}${workspaceId}` : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setNoiseIds(new Set(JSON.parse(raw)));
    } catch {
      // Corrupt or missing localStorage entry — start with an empty dismiss set.
    }
  }, [storageKey]);

  function persistNoise(next: Set<number>) {
    setNoiseIds(next);
    if (storageKey) {
      window.localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
    }
  }

  const load = useCallback(async (wsId: number) => {
    try {
      const [comps, logs] = await Promise.all([
        apiFetch(`/workspaces/${wsId}/competitors/`),
        apiFetch(`/workspaces/${wsId}/change-logs/`),
      ]);
      setCompetitors(comps);
      setChangeLogs(
        [...logs].sort(
          (a: ChangeLog, b: ChangeLog) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      );

      const perCompetitorSurfaces = await Promise.all(
        comps.map((c: Competitor) =>
          apiFetch(`/workspaces/${wsId}/competitors/${c.id}/surfaces/`).catch(() => [])
        )
      );
      const map: Record<number, Surface> = {};
      perCompetitorSurfaces.flat().forEach((s: Surface) => {
        map[s.id] = s;
      });
      setSurfacesById(map);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    void (async () => {
      await load(workspaceId);
    })();
  }, [workspaceId, load]);

  function competitorName(id: number) {
    return competitors.find((c) => c.id === id)?.name ?? `#${id}`;
  }

  const filteredCount = useMemo(
    () => changeLogs.filter((l) => noiseIds.has(l.id)).length,
    [changeLogs, noiseIds]
  );

  const visibleLogs = useMemo(() => {
    return changeLogs.filter((l) => {
      if (!showFiltered && noiseIds.has(l.id)) return false;
      if (materialOnly && !(l.materiality_score !== null && l.materiality_score >= 50)) return false;
      return true;
    });
  }, [changeLogs, noiseIds, showFiltered, materialOnly]);

  function markAsNoise(id: number) {
    const next = new Set(noiseIds);
    next.add(id);
    persistNoise(next);
  }

  function unmarkNoise(id: number) {
    const next = new Set(noiseIds);
    next.delete(id);
    persistNoise(next);
  }

  async function draftBriefing(log: ChangeLog) {
    if (!workspaceId) return;
    setDrafting((prev) => ({ ...prev, [log.id]: true }));
    setDraftError((prev) => ({ ...prev, [log.id]: "" }));
    try {
      await apiFetch(`/workspaces/${workspaceId}/briefings/generate-now`, {
        method: "POST",
        body: JSON.stringify({ change_log_ids: [log.id] }),
      });
      setDrafted((prev) => ({ ...prev, [log.id]: true }));
    } catch (err) {
      setDraftError((prev) => ({
        ...prev,
        [log.id]: err instanceof ApiError ? err.message : "Failed to draft briefing",
      }));
    } finally {
      setDrafting((prev) => ({ ...prev, [log.id]: false }));
    }
  }

  if (!contextReady || loading) return null;

  return (
    <div className="flex flex-col gap-[18px] px-[34px] py-[30px] pb-[44px]" style={{ maxWidth: 1100 }}>
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-[7px]">
          <h1 className="m-0 text-[26px] font-semibold tracking-[-0.025em]">Change feed</h1>
          <p className="m-0 max-w-[560px] text-[13.5px] text-[var(--text-muted)]">
            Every detected change, newest first. Draft a briefing straight from any moment that
            matters.
          </p>
        </div>
        <label className="flex h-8 items-center gap-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] px-3 text-xs font-medium text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={materialOnly}
            onChange={(e) => setMaterialOnly(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Material only
        </label>
      </div>

      {error && (
        <p className="rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      {filteredCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-nested)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
          <span>
            {filteredCount} change{filteredCount === 1 ? "" : "s"} filtered as noise
          </span>
          <button
            onClick={() => setShowFiltered((v) => !v)}
            className="font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
          >
            {showFiltered ? "Hide filtered" : "Show filtered"}
          </button>
        </div>
      )}

      {visibleLogs.length === 0 ? (
        <p className="text-sm text-[var(--text-faint)]">No changes match this view yet.</p>
      ) : (
        <div className="flex flex-col gap-[14px]">
          {visibleLogs.map((log) => {
            const surface = surfacesById[log.surface_id];
            const lines = diffLines(log.diff);
            const isExpanded = expanded.has(log.id);
            const visibleDiffLines = isExpanded ? lines : lines.slice(0, DIFF_PREVIEW_LINES);
            const isNoise = noiseIds.has(log.id);

            return (
              <div
                key={log.id}
                className="flex gap-6 rounded-[14px] border border-[var(--border-default)] bg-[var(--bg-card)] px-[22px] py-5"
                style={isNoise ? { opacity: 0.55 } : undefined}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[13.5px] font-medium">{competitorName(log.competitor_id)}</span>
                    {surface && (
                      <span className="font-mono text-[11px] text-[var(--text-dim)]">
                        {surface.surface_type} &middot; {surface.url}
                      </span>
                    )}
                    <ClassificationBadge classification={log.classification} />
                    <span className="ml-auto font-mono text-[11px] text-[var(--text-faint)]">
                      {relativeTime(log.created_at)}
                    </span>
                  </div>

                  {lines.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-[var(--border-subtler)] bg-[var(--bg-nested)] px-3 py-2.5 font-mono text-[12px] leading-[1.65]">
                      {visibleDiffLines.map((l, i) => (
                        <div
                          key={i}
                          className="whitespace-pre-wrap"
                          style={{
                            color:
                              l.kind === "add"
                                ? "var(--teal)"
                                : l.kind === "del"
                                ? "var(--red)"
                                : "var(--text-dim)",
                            background:
                              l.kind === "add"
                                ? "#35D6A414"
                                : l.kind === "del"
                                ? "#FF6B8114"
                                : undefined,
                          }}
                        >
                          {l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}
                          {l.text}
                        </div>
                      ))}
                      {lines.length > DIFF_PREVIEW_LINES && (
                        <button
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (isExpanded) next.delete(log.id);
                              else next.add(log.id);
                              return next;
                            })
                          }
                          className="mt-1 text-[11px] font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
                        >
                          {isExpanded ? "Show less" : `+${lines.length - DIFF_PREVIEW_LINES} more lines`}
                        </button>
                      )}
                    </div>
                  )}

                  {log.rationale && (
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-[9.5px] uppercase tracking-[.13em] text-[var(--text-dim)]">
                        Why it matters
                      </span>
                      <p className="m-0 text-[13px] leading-[1.55] text-[var(--text-secondary)]">
                        {log.rationale}
                      </p>
                    </div>
                  )}

                  <div className="mt-1 flex items-center gap-3">
                    {isNoise ? (
                      <button
                        onClick={() => unmarkNoise(log.id)}
                        className="h-7 rounded-md border border-[var(--border-input)] px-2.5 text-[11.5px] font-medium text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
                      >
                        Restore to feed
                      </button>
                    ) : (
                      <button
                        onClick={() => markAsNoise(log.id)}
                        className="h-7 rounded-md border border-[var(--border-input)] px-2.5 text-[11.5px] font-medium text-[var(--text-faint)] hover:border-[var(--border-hover)] hover:text-[var(--text-secondary)]"
                      >
                        Mark as noise
                      </button>
                    )}
                    {drafted[log.id] ? (
                      <span className="text-[11.5px] font-medium text-[var(--teal)]">
                        Briefing drafted — sent to approval queue
                      </span>
                    ) : (
                      <button
                        onClick={() => draftBriefing(log)}
                        disabled={drafting[log.id]}
                        className="h-7 rounded-md bg-[var(--accent)] px-2.5 text-[11.5px] font-semibold text-[var(--accent-on)] disabled:opacity-50"
                      >
                        {drafting[log.id] ? "Drafting..." : "Draft briefing"}
                      </button>
                    )}
                    {draftError[log.id] && (
                      <span className="text-[11.5px] text-[var(--red)]">{draftError[log.id]}</span>
                    )}
                  </div>
                </div>

                <div className="w-[132px] flex-shrink-0 border-l border-[var(--border-subtle)] pl-5">
                  <MaterialityBar score={log.materiality_score ?? 0} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
