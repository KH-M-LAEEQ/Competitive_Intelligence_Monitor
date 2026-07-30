"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { useWorkspaceContext } from "@/lib/workspace-context";
import {
  ApprovalItem,
  Briefing,
  ChangeLog,
  Competitor,
  Surface,
} from "@/lib/types";
import ClassificationBadge, { classificationColor } from "@/components/ui/ClassificationBadge";
import DonutChart from "@/components/charts/DonutChart";
import DualTrendChart, { DualTrendPoint } from "@/components/charts/DualTrendChart";

const TREND_DAYS = 14;
const CLASS_COLORS: Record<string, string> = {
  pricing_move: "#FFB020",
  new_feature: "#4EA8FF",
  positioning_shift: "#8B7BFF",
  hiring_signal: "#35D6A4",
  promotion: "#FF6B81",
  other: "#8A93A0",
};
const CLASS_LABELS: Record<string, string> = {
  pricing_move: "Pricing move",
  new_feature: "New feature",
  positioning_shift: "Positioning",
  hiring_signal: "Hiring signal",
  promotion: "Promotion",
  other: "Other",
};

interface CheckRun {
  status: "running" | "success" | "failed";
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

export default function DashboardPage() {
  const { workspaceId, ready: contextReady } = useWorkspaceContext();
  const [nowMs] = useState(() => Date.now());

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [changeLogs, setChangeLogs] = useState<ChangeLog[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [checkRuns, setCheckRuns] = useState<CheckRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (wsId: number) => {
    try {
      const [comps, logs, allApprovals, briefingList] = await Promise.all([
        apiFetch(`/workspaces/${wsId}/competitors/`),
        apiFetch(`/workspaces/${wsId}/change-logs/`),
        apiFetch(`/workspaces/${wsId}/approvals/`),
        apiFetch(`/workspaces/${wsId}/briefings/`),
      ]);
      setCompetitors(comps);
      setChangeLogs(logs);
      setApprovals(allApprovals);
      setBriefings(briefingList);

      const perCompetitorSurfaces = await Promise.all(
        comps.map(async (c: Competitor) => {
          const surfaces: Surface[] = await apiFetch(
            `/workspaces/${wsId}/competitors/${c.id}/surfaces/`
          );
          return { competitor: c, surfaces };
        })
      );

      const runResults = await Promise.all(
        perCompetitorSurfaces.flatMap(({ competitor, surfaces }) =>
          surfaces.map((s: Surface) =>
            apiFetch(
              `/workspaces/${wsId}/competitors/${competitor.id}/surfaces/${s.id}/check-runs`
            ).catch(() => [])
          )
        )
      );
      setCheckRuns(runResults.flat());
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

  const changesLast30d = useMemo(() => {
    const since = nowMs - 30 * 24 * 60 * 60 * 1000;
    return changeLogs.filter((l) => new Date(l.created_at).getTime() >= since);
  }, [changeLogs, nowMs]);

  const materialCount = useMemo(
    () => changeLogs.filter((l) => l.materiality_score !== null && l.materiality_score >= 50).length,
    [changeLogs]
  );

  const crawlSuccessRate = useMemo(() => {
    if (checkRuns.length === 0) return null;
    const finished = checkRuns.filter((r) => r.status !== "running");
    if (finished.length === 0) return null;
    const successes = finished.filter((r) => r.status === "success").length;
    return (successes / finished.length) * 100;
  }, [checkRuns]);

  const briefingApprovalRate = useMemo(() => {
    const decided = briefings.filter(
      (b) => b.status === "approved" || b.status === "rejected" || b.status === "delivered"
    );
    if (decided.length === 0) return null;
    const approved = decided.filter((b) => b.status !== "rejected").length;
    return (approved / decided.length) * 100;
  }, [briefings]);

  const materialityPrecision = useMemo(() => {
    const scored = changeLogs.filter((l) => l.materiality_score !== null);
    if (scored.length === 0) return null;
    return (materialCount / scored.length) * 100;
  }, [changeLogs, materialCount]);

  const trendData: DualTrendPoint[] = useMemo(() => {
    const buckets: Record<string, { detected: number; material: number }> = {};
    const today = new Date(nowMs);
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      buckets[dayKey(d.toISOString())] = { detected: 0, material: 0 };
    }
    for (const log of changeLogs) {
      const key = dayKey(log.created_at);
      if (key in buckets) {
        buckets[key].detected += 1;
        if (log.materiality_score !== null && log.materiality_score >= 50) {
          buckets[key].material += 1;
        }
      }
    }
    return Object.entries(buckets).map(([date, v]) => ({ date, ...v }));
  }, [changeLogs, nowMs]);

  const classificationData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of changeLogs) {
      if (!log.classification) continue;
      counts[log.classification] = (counts[log.classification] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({
        label: CLASS_LABELS[label] ?? label,
        count,
        color: CLASS_COLORS[label] ?? CLASS_COLORS.other,
      }));
  }, [changeLogs]);

  const movesByCompetitor = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const log of changeLogs) {
      counts[log.competitor_id] = (counts[log.competitor_id] ?? 0) + 1;
    }
    const rows = competitors
      .map((c) => ({ name: c.name, count: counts[c.id] ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r) => ({ ...r, pct: (r.count / max) * 100 }));
  }, [changeLogs, competitors]);

  const topMoves = useMemo(
    () =>
      [...changeLogs]
        .filter((l) => l.materiality_score !== null)
        .sort((a, b) => (b.materiality_score ?? 0) - (a.materiality_score ?? 0))
        .slice(0, 6),
    [changeLogs]
  );

  function competitorName(id: number) {
    return competitors.find((c) => c.id === id)?.name ?? `#${id}`;
  }

  function handleExportCsv() {
    const header = "competitor,classification,materiality_score,created_at,diff\n";
    const rows = changeLogs
      .map((l) =>
        [
          competitorName(l.competitor_id),
          l.classification ?? "",
          l.materiality_score ?? "",
          l.created_at,
          (l.diff ?? "").replace(/"/g, '""').replace(/\n/g, " "),
        ]
          .map((v) => `"${v}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "change-log-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!contextReady || loading) return null;

  return (
    <div className="flex flex-col gap-[18px] px-[34px] py-[30px] pb-[44px]" style={{ maxWidth: 1320 }}>
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-[7px]">
          <h1 className="m-0 text-[26px] font-semibold tracking-[-0.025em]">Intelligence overview</h1>
          <p className="m-0 max-w-[600px] text-[13.5px] text-[var(--text-muted)]">
            {competitors.length} competitor{competitors.length === 1 ? "" : "s"} watched. The
            agent scores materiality, classifies every change, and holds each briefing at the
            approval gate.
          </p>
        </div>
        <div className="flex gap-[7px]">
          <button
            onClick={handleExportCsv}
            className="h-8 rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
          >
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-[14px] lg:grid-cols-4">
        <StatTile
          label="Changes detected"
          value={changeLogs.length}
          sub={`${changesLast30d.length} in last 30d`}
        />
        <StatTile
          label="Judged material"
          value={materialCount}
          sub={
            changeLogs.length > 0
              ? `${Math.round((materialCount / changeLogs.length) * 100)}% of feed`
              : "—"
          }
          barPct={changeLogs.length > 0 ? (materialCount / changeLogs.length) * 100 : 0}
        />
        <StatTile
          label="Awaiting approval"
          value={approvals.filter((a) => a.status === "pending").length}
          sub="Nothing sends without a reviewer."
          valueColor="var(--accent)"
          href="/approvals"
        />
        <StatTile
          label="Crawl success"
          value={crawlSuccessRate !== null ? `${crawlSuccessRate.toFixed(1)}%` : "—"}
          sub="target 95%"
          barPct={crawlSuccessRate ?? 0}
          barColor="var(--teal)"
        />
      </div>

      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-[1.45fr_1fr]">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-[5px]">
              <h2 className="m-0 text-[14.5px] font-semibold tracking-[-0.01em]">
                Detection vs. materiality
              </h2>
              <p className="m-0 text-[11.5px] text-[var(--text-faint)]">
                Daily volume, past {TREND_DAYS} days
              </p>
            </div>
            <div className="flex gap-[14px] pt-[3px]">
              <LegendDot color="var(--blue)" label="Detected" />
              <LegendDot color="var(--accent)" label="Material" />
            </div>
          </div>
          <DualTrendChart data={trendData} />
        </Card>

        <Card>
          <div className="flex flex-col gap-[5px]">
            <h2 className="m-0 text-[14.5px] font-semibold tracking-[-0.01em]">
              Change classification
            </h2>
            <p className="m-0 text-[11.5px] text-[var(--text-faint)]">
              How the agent tagged {changeLogs.length} detected changes
            </p>
          </div>
          <DonutChart data={classificationData} centerValue={changeLogs.length} centerLabel="changes" />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-3">
        <Card>
          <div className="flex flex-col gap-[5px]">
            <h2 className="m-0 text-[14.5px] font-semibold tracking-[-0.01em]">
              Material moves by competitor
            </h2>
            <p className="m-0 text-[11.5px] text-[var(--text-faint)]">All time</p>
          </div>
          <div className="flex flex-col gap-[13px]">
            {movesByCompetitor.length === 0 ? (
              <p className="text-xs text-[var(--text-faint)]">No changes yet.</p>
            ) : (
              movesByCompetitor.map((row) => (
                <div key={row.name} className="flex items-center gap-3">
                  <span className="w-[78px] flex-shrink-0 truncate text-[12.5px] text-[var(--text-secondary)]">
                    {row.name}
                  </span>
                  <div className="h-[9px] flex-1 overflow-hidden rounded-full bg-[var(--bg-track)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${Math.max(row.pct, 4)}%` }}
                    />
                  </div>
                  <span className="w-5 flex-shrink-0 text-right font-mono text-[11.5px] text-[var(--text-muted)]">
                    {row.count}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-[5px]">
            <h2 className="m-0 text-[14.5px] font-semibold tracking-[-0.01em]">Unit cost breakdown</h2>
            <p className="m-0 text-[11.5px] text-[var(--text-faint)]">$39/mo reference, hosted-API stack</p>
          </div>
          <DonutChart
            data={[
              { label: "Crawling", count: 14, color: "#FFB020" },
              { label: "LLM briefings", count: 14, color: "#4EA8FF" },
              { label: "Hosting", count: 6, color: "#8B7BFF" },
              { label: "LLM scoring", count: 4, color: "#35D6A4" },
              { label: "Embeddings", count: 1, color: "#FF6B81" },
            ]}
            centerValue="$39"
            centerLabel="per mo"
          />
        </Card>

        <Card>
          <div className="flex flex-col gap-[5px]">
            <h2 className="m-0 text-[14.5px] font-semibold tracking-[-0.01em]">
              Success metrics vs. target
            </h2>
            <p className="m-0 text-[11.5px] text-[var(--text-faint)]">Rolling window, this workspace</p>
          </div>
          <div className="flex flex-col gap-[15px]">
            <MetricBar
              label="Crawl success"
              value={crawlSuccessRate}
              target={95}
              color="var(--teal)"
            />
            <MetricBar
              label="Materiality precision"
              value={materialityPrecision}
              target={70}
              color="var(--teal)"
            />
            <MetricBar
              label="Briefing approval rate"
              value={briefingApprovalRate}
              target={50}
              color="var(--accent)"
            />
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-[14.5px] font-semibold tracking-[-0.01em]">
            Highest-materiality moves
          </h2>
          <Link href="/feed" className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]">
            View all {changeLogs.length} &rarr;
          </Link>
        </div>
        {topMoves.length === 0 ? (
          <p className="text-sm text-[var(--text-faint)]">
            No scored changes yet — add a competitor, add a surface, and run a check.
          </p>
        ) : (
          <div className="flex flex-col">
            <div className="grid grid-cols-[112px_1fr_132px_78px] gap-[14px] border-b border-[var(--border-subtle)] px-1 pb-[9px] font-mono text-[9.5px] uppercase tracking-[.13em] text-[var(--text-dimmer)]">
              <span>Competitor</span>
              <span>What changed</span>
              <span>Class</span>
              <span>Score</span>
            </div>
            {topMoves.map((log, i) => (
              <div
                key={log.id}
                className="grid grid-cols-[112px_1fr_132px_78px] items-center gap-[14px] px-1 py-[13px]"
                style={{ borderBottom: i < topMoves.length - 1 ? "1px solid var(--border-subtler)" : undefined }}
              >
                <span className="truncate text-[12.5px] font-medium">{competitorName(log.competitor_id)}</span>
                <span className="truncate text-[12.5px] text-[var(--text-secondary)]">
                  {log.rationale ?? log.diff ?? "—"}
                </span>
                <ClassificationBadge classification={log.classification} />
                <span
                  className="font-mono text-xs"
                  style={{ color: classificationColor(log.classification) }}
                >
                  {((log.materiality_score ?? 0) / 100).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[16px] rounded-[14px] border border-[var(--border-default)] bg-[var(--bg-card)] px-[22px] py-5">
      {children}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  barPct,
  barColor = "var(--accent)",
  valueColor,
  href,
}: {
  label: string;
  value: number | string;
  sub?: string;
  barPct?: number;
  barColor?: string;
  valueColor?: string;
  href?: string;
}) {
  const content = (
    <div className="flex flex-col gap-3 rounded-[14px] border border-[var(--border-default)] bg-[var(--bg-card)] px-5 py-[18px]">
      <span className="font-mono text-[9.5px] uppercase tracking-[.13em] text-[var(--text-faint)]">
        {label}
      </span>
      <div className="flex items-baseline gap-[9px]">
        <span className="text-[30px] font-semibold tracking-[-0.03em]" style={{ color: valueColor }}>
          {value}
        </span>
      </div>
      {sub && <span className="font-mono text-[11.5px] text-[var(--text-muted)]">{sub}</span>}
      {barPct !== undefined && (
        <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-track)]">
          <div className="h-full" style={{ width: `${Math.min(barPct, 100)}%`, background: barColor }} />
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block transition-opacity hover:opacity-90">
        {content}
      </Link>
    );
  }

  return content;
}

function MetricBar({
  label,
  value,
  target,
  color,
}: {
  label: string;
  value: number | null;
  target: number;
  color: string;
}) {
  const display = value !== null ? Math.round(value) : null;

  return (
    <div className="flex flex-col gap-[7px]">
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] text-[var(--text-secondary)]">{label}</span>
        <span className="font-mono text-[11.5px]">
          {display !== null ? `${display}%` : "—"}{" "}
          <span className="text-[var(--text-dim)]">/ {target}</span>
        </span>
      </div>
      <div className="relative h-[7px] overflow-hidden rounded-full bg-[var(--bg-track)]">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(display ?? 0, 100)}%`, background: color }}
        />
        <div
          className="absolute top-0 bottom-0 w-[1.5px] bg-white/60"
          style={{ left: `${Math.min(target, 100)}%` }}
        />
      </div>
    </div>
  );
}
