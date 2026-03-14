import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, XCircle, AlertTriangle, FileDown, ArrowLeft,
  Shield, TrendingUp, Bug, Clock
} from "lucide-react";
import type { Session, SessionSummaryRow } from "@/lib/types";

export default function Report() {
  const params = useParams<{ id: string }>();

  const { data: session, isLoading: sessionLoading } = useQuery<Session>({
    queryKey: ["/api/sessions", params.id],
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<SessionSummaryRow>({
    queryKey: ["/api/sessions", params.id, "summary"],
  });

  const isLoading = sessionLoading || summaryLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!session || !summary) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Summary not available yet.</p>
        <Link href={`/session/${params.id}/test`}>
          <Button variant="outline" size="sm" className="mt-4 gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Session
          </Button>
        </Link>
      </div>
    );
  }

  const goNogoConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    go: { label: "GO", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
    "no-go": { label: "NO-GO", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: XCircle },
    conditional: { label: "CONDITIONAL", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", icon: AlertTriangle },
  };

  const riskConfig: Record<string, { label: string; color: string }> = {
    low: { label: "Low Risk", color: "text-emerald-600 dark:text-emerald-400" },
    medium: { label: "Medium Risk", color: "text-amber-600 dark:text-amber-400" },
    high: { label: "High Risk", color: "text-red-600 dark:text-red-400" },
  };

  const verdict = goNogoConfig[summary.goNogo] || goNogoConfig.conditional;
  const risk = riskConfig[summary.riskLevel] || riskConfig.medium;
  const VerdictIcon = verdict.icon;

  const handleExport = () => {
    const blob = new Blob([summary.reportMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.ticketId}-session-report.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Parse markdown into simple sections
  const sections = parseMarkdown(summary.reportMarkdown);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm text-muted-foreground">{session.ticketId}</span>
            <Badge variant="secondary" className="text-[10px] h-5">Stage 3: Report</Badge>
          </div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-report-title">
            Session Summary
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" />
              Dashboard
            </Button>
          </Link>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} data-testid="button-export">
            <FileDown className="w-3.5 h-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Verdict card */}
      <Card className={`border ${verdict.bg}`}>
        <CardContent className="py-5 px-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${verdict.bg}`}>
                <VerdictIcon className={`w-6 h-6 ${verdict.color}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${verdict.color}`} data-testid="text-verdict">
                    {verdict.label}
                  </span>
                  <span className={`text-sm ${risk.color}`}>• {risk.label}</span>
                </div>
                <p className="text-sm text-muted-foreground">Release recommendation</p>
              </div>
            </div>

            <div className="flex gap-6">
              <MetricBlock icon={TrendingUp} label="Coverage" value={`${summary.coveragePct}%`} />
              <MetricBlock icon={Bug} label="Bugs" value={String(countBugs(summary.reportMarkdown))} />
              <MetricBlock icon={Clock} label="Generated" value={new Date(summary.generatedAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
            </div>
          </div>

          {/* Coverage bar */}
          <div className="mt-4">
            <Progress value={summary.coveragePct} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Report content */}
      <div className="space-y-4">
        {sections.map((section, i) => (
          <Card key={i}>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {section.icon && <section.icon className="w-4 h-4 text-primary" />}
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {section.lines.map((line, j) => {
                  if (line.startsWith("| ")) {
                    return <TableRow key={j} line={line} />;
                  }
                  if (line.startsWith("### ")) {
                    return (
                      <h4 key={j} className="text-sm font-medium mt-4 mb-2">
                        {line.replace("### ", "")}
                      </h4>
                    );
                  }
                  if (line.startsWith("- ")) {
                    return (
                      <div key={j} className="flex items-start gap-2 text-sm mb-1">
                        <span className="text-primary mt-1">•</span>
                        <span dangerouslySetInnerHTML={{ __html: formatInline(line.slice(2)) }} />
                      </div>
                    );
                  }
                  if (/^\d+\.\s/.test(line)) {
                    return (
                      <div key={j} className="flex items-start gap-2 text-sm mb-1 ml-1">
                        <span className="text-muted-foreground font-mono text-xs mt-0.5 w-4 shrink-0">
                          {line.match(/^(\d+)/)?.[1]}.
                        </span>
                        <span dangerouslySetInnerHTML={{ __html: formatInline(line.replace(/^\d+\.\s/, "")) }} />
                      </div>
                    );
                  }
                  if (line.startsWith("|---")) return null;
                  if (line.trim() === "") return <div key={j} className="h-2" />;
                  return (
                    <p key={j} className="text-sm leading-relaxed mb-2" dangerouslySetInnerHTML={{ __html: formatInline(line) }} />
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MetricBlock({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-sm font-semibold">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        {value}
      </div>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function TableRow({ line }: { line: string }) {
  const cells = line.split("|").filter(Boolean).map((c) => c.trim());
  if (cells.length < 2) return null;
  return (
    <div className="flex justify-between py-1.5 text-sm border-b border-border last:border-0">
      <span className="text-muted-foreground">{cells[0]}</span>
      <span className="font-medium" dangerouslySetInnerHTML={{ __html: formatInline(cells[1]) }} />
    </div>
  );
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code class="text-xs bg-muted px-1 py-0.5 rounded">$1</code>');
}

function parseMarkdown(md: string) {
  const sectionIcons: Record<string, any> = {
    "How I Read This Ticket": Shield,
    "What the Session Revealed": TrendingUp,
    "My Honest Assessment": AlertTriangle,
  };

  const lines = md.split("\n");
  const sections: { title: string; icon: any; lines: string[] }[] = [];
  let current: { title: string; icon: any; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      const title = line.replace("## ", "").trim();
      current = { title, icon: sectionIcons[title] || null, lines: [] };
      sections.push(current);
    } else if (line.startsWith("# ")) {
      // Skip H1, we show it as the page title
    } else if (current) {
      current.lines.push(line);
    }
  }

  return sections;
}

function countBugs(md: string): number {
  const match = md.match(/Bugs Found \((\d+)\)/);
  return match ? parseInt(match[1]) : 0;
}
