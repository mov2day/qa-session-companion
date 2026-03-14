import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Area, AreaChart,
} from "recharts";
import {
  TrendingUp, Bug, Shield, CheckCircle2, XCircle, AlertTriangle,
  FlaskConical, BarChart3, ArrowRight, Clock,
} from "lucide-react";
import type { DashboardStats, Session, SessionSummaryRow } from "@/lib/types";

const GO_COLORS = {
  go: "hsl(152, 68%, 40%)",
  "no-go": "hsl(0, 72%, 51%)",
  conditional: "hsl(38, 92%, 50%)",
};

const BUG_COLORS: Record<string, string> = {
  critical: "hsl(0, 72%, 51%)",
  major: "hsl(38, 92%, 50%)",
  minor: "hsl(210, 40%, 55%)",
  unrated: "hsl(220, 9%, 55%)",
};

export default function ManagerDashboard() {
  const [, navigate] = useLocation();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No dashboard data available.</p>
      </div>
    );
  }

  const goNogoData = [
    { name: "Go", value: stats.goCount, color: GO_COLORS.go },
    { name: "No-Go", value: stats.noGoCount, color: GO_COLORS["no-go"] },
    { name: "Conditional", value: stats.conditionalCount, color: GO_COLORS.conditional },
  ].filter(d => d.value > 0);

  const bugData = stats.bugsByCategory.map(b => ({
    ...b,
    color: BUG_COLORS[b.category] || BUG_COLORS.unrated,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2" data-testid="page-title">
          <BarChart3 className="w-5 h-5" />
          Manager Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Org-wide testing coverage, trends, and release readiness
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={FlaskConical}
          label="Total Sessions"
          value={stats.totalSessions}
          sub={`${stats.completedSessions} completed`}
        />
        <KpiCard
          icon={TrendingUp}
          label="Avg Coverage"
          value={`${stats.avgCoverage}%`}
          sub={stats.avgCoverage >= 70 ? "Above target" : "Below 70% target"}
          accent={stats.avgCoverage >= 70}
        />
        <KpiCard
          icon={Bug}
          label="Total Bugs"
          value={stats.totalBugs}
          sub={`Across ${stats.completedSessions} sessions`}
        />
        <KpiCard
          icon={Shield}
          label="Go Rate"
          value={stats.completedSessions > 0
            ? `${Math.round((stats.goCount / stats.completedSessions) * 100)}%`
            : "N/A"
          }
          sub={`${stats.goCount} go / ${stats.noGoCount} no-go`}
          accent={stats.goCount > stats.noGoCount}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Coverage Trend */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-medium">Coverage Trend</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {stats.coverageTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={stats.coverageTrend}>
                  <defs>
                    <linearGradient id="coverageGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(183, 65%, 42%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(183, 65%, 42%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="coverage"
                    stroke="hsl(183, 65%, 42%)"
                    strokeWidth={2}
                    fill="url(#coverageGrad)"
                    name="Avg Coverage %"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="Complete sessions to see coverage trends" />
            )}
          </CardContent>
        </Card>

        {/* Go / No-Go Breakdown */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-medium">Release Decisions</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {goNogoData.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie
                      data={goNogoData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {goNogoData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3 flex-1">
                  {goNogoData.map(d => (
                    <div key={d.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: d.color }} />
                        <span className="text-sm">{d.name}</span>
                      </div>
                      <span className="text-sm font-semibold font-mono">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyChart message="Complete sessions to see release decisions" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Second Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bugs by Severity */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-medium">Bugs by Severity</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {bugData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={bugData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis dataKey="category" type="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={70} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" name="Bugs" radius={[0, 4, 4, 0]}>
                    {bugData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No bugs found across sessions" />
            )}
          </CardContent>
        </Card>

        {/* Sessions per Day */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-medium">Sessions per Day</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {stats.coverageTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.coverageTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="sessions" fill="hsl(183, 65%, 42%)" name="Sessions" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No session data to display" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Sessions Table */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-medium">Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {stats.recentSessions.length > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_80px_80px_80px_70px_40px] gap-3 text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-3 py-1">
                <span>Ticket</span>
                <span className="text-center">Status</span>
                <span className="text-center">Coverage</span>
                <span className="text-center">Verdict</span>
                <span className="text-center">Risk</span>
                <span />
              </div>
              {stats.recentSessions.map((session: any) => {
                const summary = session.summary as SessionSummaryRow | undefined;
                const route = session.status === "complete"
                  ? `/session/${session.id}/report`
                  : session.status === "active"
                  ? `/session/${session.id}/test`
                  : `/session/${session.id}/plan`;

                return (
                  <div
                    key={session.id}
                    className="grid grid-cols-[1fr_80px_80px_80px_70px_40px] gap-3 items-center px-3 py-2.5 rounded-md bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(route)}
                    data-testid={`manager-row-${session.id}`}
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-medium">{session.ticketId}</span>
                      {session.ticketTitle && (
                        <p className="text-xs text-muted-foreground truncate">{session.ticketTitle}</p>
                      )}
                    </div>
                    <div className="text-center">
                      <StatusBadge status={session.status} />
                    </div>
                    <div className="text-center">
                      {summary ? (
                        <div className="space-y-1">
                          <span className="text-xs font-mono font-medium">{summary.coveragePct}%</span>
                          <Progress value={summary.coveragePct} className="h-1" />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="text-center">
                      {summary ? (
                        <VerdictBadge verdict={summary.goNogo} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="text-center">
                      {summary ? (
                        <RiskBadge risk={summary.riskLevel} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="text-center">
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No sessions yet. Create a session from the Dashboard.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: any;
  label: string;
  value: string | number;
  sub: string;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4 px-5">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-md flex items-center justify-center ${accent ? "bg-primary/10" : "bg-muted"}`}>
            <Icon className={`w-4 h-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div>
            <div className="text-lg font-semibold font-mono">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">{sub}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    planning: { label: "Planning", variant: "outline" },
    active: { label: "Active", variant: "default" },
    complete: { label: "Done", variant: "secondary" },
  };
  const c = config[status] || config.planning;
  return <Badge variant={c.variant} className="text-[9px] h-4">{c.label}</Badge>;
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const config: Record<string, { label: string; className: string }> = {
    go: { label: "GO", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
    "no-go": { label: "NO-GO", className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" },
    conditional: { label: "COND", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  };
  const c = config[verdict] || config.conditional;
  return <Badge variant="outline" className={`text-[9px] h-4 ${c.className}`}>{c.label}</Badge>;
}

function RiskBadge({ risk }: { risk: string }) {
  const config: Record<string, { label: string; className: string }> = {
    low: { label: "Low", className: "text-emerald-600 dark:text-emerald-400" },
    medium: { label: "Med", className: "text-amber-600 dark:text-amber-400" },
    high: { label: "High", className: "text-red-600 dark:text-red-400" },
  };
  const c = config[risk] || config.medium;
  return <span className={`text-[10px] font-medium ${c.className}`}>{c.label}</span>;
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
