import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, Sparkles, Play, AlertTriangle, Shield, Zap, Link2, HelpCircle,
  ChevronRight, ArrowUpCircle, ArrowRightCircle, ArrowDownCircle,
  GitBranch, BookOpen, FileText, ExternalLink, RefreshCw,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Session, TestMap, TestArea, MergedContext } from "@/lib/types";

const RISK_CONFIG = {
  high: { label: "High", color: "text-red-500 dark:text-red-400", bg: "bg-red-500/10", icon: ArrowUpCircle },
  medium: { label: "Med", color: "text-amber-500 dark:text-amber-400", bg: "bg-amber-500/10", icon: ArrowRightCircle },
  low: { label: "Low", color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500/10", icon: ArrowDownCircle },
};

const CATEGORY_CONFIG = [
  { key: "happy_paths" as const, label: "Happy Paths", icon: Shield, desc: "Core acceptance criteria flows" },
  { key: "edge_cases" as const, label: "Edge Cases", icon: Zap, desc: "Boundary conditions and unusual inputs" },
  { key: "negative_flows" as const, label: "Negative Flows", icon: AlertTriangle, desc: "Error states and invalid inputs" },
  { key: "integration_risks" as const, label: "Integration Risks", icon: Link2, desc: "Cross-system touchpoints" },
];

export default function Plan() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data: session, isLoading } = useQuery<Session>({
    queryKey: ["/api/sessions", params.id],
  });

  const generateMap = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/test-map", { sessionId: params.id });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", params.id] });
    },
  });

  const refetchContext = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/context/fetch", {
        sessionId: params.id,
        ticketId: session?.ticketId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", params.id] });
    },
  });

  const testMap: TestMap | null = session?.testMap ? JSON.parse(session.testMap) : null;
  const context: MergedContext | null = session?.contextJson ? JSON.parse(session.contextJson) : null;

  const allAreas = testMap
    ? [
        ...testMap.happy_paths,
        ...testMap.edge_cases,
        ...testMap.negative_flows,
        ...testMap.integration_risks,
      ]
    : [];
  const highCount = allAreas.filter((a) => a.risk === "high").length;
  const medCount = allAreas.filter((a) => a.risk === "medium").length;
  const lowCount = allAreas.filter((a) => a.risk === "low").length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!session) return <div className="text-muted-foreground">Session not found.</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm text-muted-foreground">{session.ticketId}</span>
            <Badge variant="outline" className="text-[10px] h-5">Stage 1: Plan</Badge>
          </div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-session-title">
            {session.ticketTitle || session.ticketId}
          </h1>
          {session.ticketDescription && (
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl line-clamp-3">
              {session.ticketDescription}
            </p>
          )}
        </div>
      </div>

      {/* Context Panel */}
      {context && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Integration Context</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs h-7"
                onClick={() => refetchContext.mutate()}
                disabled={refetchContext.isPending}
                data-testid="button-refetch-context"
              >
                <RefreshCw className={`w-3 h-3 ${refetchContext.isPending ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Tabs defaultValue={context.jira ? "jira" : context.github ? "github" : "confluence"}>
              <TabsList className="h-8">
                {context.jira && (
                  <TabsTrigger value="jira" className="text-xs gap-1 h-7" data-testid="tab-jira">
                    <Link2 className="w-3 h-3" /> Jira
                  </TabsTrigger>
                )}
                {context.github && (
                  <TabsTrigger value="github" className="text-xs gap-1 h-7" data-testid="tab-github">
                    <GitBranch className="w-3 h-3" /> GitHub
                  </TabsTrigger>
                )}
                {context.confluence && (
                  <TabsTrigger value="confluence" className="text-xs gap-1 h-7" data-testid="tab-confluence">
                    <BookOpen className="w-3 h-3" /> Confluence
                  </TabsTrigger>
                )}
              </TabsList>

              {/* Jira Tab */}
              {context.jira && (
                <TabsContent value="jira" className="mt-3">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <InfoPill label="Status" value={context.jira.status} />
                      <InfoPill label="Priority" value={context.jira.priority} />
                      <InfoPill label="Assignee" value={context.jira.assignee || "Unassigned"} />
                      <InfoPill label="Reporter" value={context.jira.reporter || "Unknown"} />
                    </div>

                    {context.jira.labels.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Labels:</span>
                        {context.jira.labels.map(l => (
                          <Badge key={l} variant="secondary" className="text-[10px] h-5">{l}</Badge>
                        ))}
                      </div>
                    )}

                    {context.jira.components.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Components:</span>
                        {context.jira.components.map(c => (
                          <Badge key={c} variant="outline" className="text-[10px] h-5">{c}</Badge>
                        ))}
                      </div>
                    )}

                    {context.jira.acceptanceCriteria && (
                      <div className="bg-muted/30 rounded-md p-3">
                        <span className="text-xs font-medium block mb-1">Acceptance Criteria</span>
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans">
                          {context.jira.acceptanceCriteria}
                        </pre>
                      </div>
                    )}

                    {context.jira.linkedIssues.length > 0 && (
                      <div>
                        <span className="text-xs font-medium block mb-1.5">Linked Issues</span>
                        <div className="space-y-1">
                          {context.jira.linkedIssues.map((li, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <Badge variant="outline" className="text-[9px] h-4">{li.type}</Badge>
                              <span className="font-mono font-medium">{li.key}</span>
                              <span className="text-muted-foreground truncate">{li.summary}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              )}

              {/* GitHub Tab */}
              {context.github && (
                <TabsContent value="github" className="mt-3">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] h-5 font-mono">
                        PR #{context.github.prNumber}
                      </Badge>
                      <span className="text-sm font-medium">{context.github.title}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <InfoPill label="Author" value={context.github.author} />
                      <InfoPill label="Additions" value={`+${context.github.totalAdditions}`} className="text-emerald-600 dark:text-emerald-400" />
                      <InfoPill label="Deletions" value={`-${context.github.totalDeletions}`} className="text-red-600 dark:text-red-400" />
                    </div>

                    <div>
                      <span className="text-xs font-medium block mb-1.5">
                        Files Changed ({context.github.filesChanged.length})
                      </span>
                      <ScrollArea className="max-h-40">
                        <div className="space-y-1">
                          {context.github.filesChanged.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-muted/30">
                              <Badge
                                variant="outline"
                                className={`text-[9px] h-4 ${
                                  f.status === "added" ? "text-emerald-500 border-emerald-500/30" :
                                  f.status === "deleted" ? "text-red-500 border-red-500/30" :
                                  "text-amber-500 border-amber-500/30"
                                }`}
                              >
                                {f.status === "added" ? "A" : f.status === "deleted" ? "D" : "M"}
                              </Badge>
                              <span className="font-mono truncate flex-1">{f.filename}</span>
                              <span className="text-emerald-500 shrink-0">+{f.additions}</span>
                              <span className="text-red-500 shrink-0">-{f.deletions}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>

                    {context.github.reviewComments.length > 0 && (
                      <div>
                        <span className="text-xs font-medium block mb-1.5">Review Comments</span>
                        <div className="space-y-2">
                          {context.github.reviewComments.map((c, i) => (
                            <div key={i} className="bg-muted/30 rounded-md p-2.5">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium">{c.author}</span>
                                <span className="text-[10px] text-muted-foreground font-mono">{c.path}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">{c.body}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              )}

              {/* Confluence Tab */}
              {context.confluence && (
                <TabsContent value="confluence" className="mt-3">
                  <div className="space-y-3">
                    {context.confluence.pages.length > 0 && (
                      <div>
                        <span className="text-xs font-medium block mb-1.5">
                          Related Pages ({context.confluence.pages.length})
                        </span>
                        <div className="space-y-2">
                          {context.confluence.pages.map((page, i) => (
                            <div key={i} className="bg-muted/30 rounded-md p-2.5">
                              <div className="flex items-center gap-2 mb-1">
                                <FileText className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs font-medium">{page.title}</span>
                                <Badge variant="secondary" className="text-[9px] h-4">{page.space}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2">{page.excerpt}</p>
                              <span className="text-[10px] text-muted-foreground/60 mt-1 block">
                                Updated: {page.lastUpdated}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {context.confluence.historicalPatterns.length > 0 && (
                      <div className="border-t border-border pt-3">
                        <span className="text-xs font-medium block mb-1.5 flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          Historical Patterns
                        </span>
                        <div className="space-y-1.5">
                          {context.confluence.historicalPatterns.map((pattern, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <span className="text-amber-500 mt-0.5">•</span>
                              <span className="text-muted-foreground">{pattern}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Generate or show test map */}
      {!testMap ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-sm font-medium mb-1">Generate Test Map</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              The AI will analyze your ticket context{context ? " (enriched with Jira, GitHub, and Confluence data)" : ""} and generate a risk-ranked test plan.
            </p>
            <Button
              onClick={() => generateMap.mutate()}
              disabled={generateMap.isPending}
              className="gap-1.5"
              data-testid="button-generate-map"
            >
              {generateMap.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Test Map
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary bar */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-medium">{allAreas.length} areas</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <ArrowUpCircle className="w-3.5 h-3.5 text-red-500" />
              <span className="font-medium">{highCount} high</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <ArrowRightCircle className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-medium">{medCount} medium</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <ArrowDownCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span className="font-medium">{lowCount} low</span>
            </div>
          </div>

          {/* Test map categories */}
          <Accordion type="multiple" defaultValue={["happy_paths", "edge_cases", "negative_flows", "integration_risks"]}>
            {CATEGORY_CONFIG.map((cat) => {
              const areas = testMap[cat.key] as TestArea[];
              const Icon = cat.icon;
              return (
                <AccordionItem key={cat.key} value={cat.key} className="border rounded-lg mb-3 overflow-hidden">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline" data-testid={`accordion-${cat.key}`}>
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">{cat.label}</span>
                      <Badge variant="secondary" className="text-[10px] h-5 ml-1">
                        {areas.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="px-4 pb-3 space-y-2">
                      <p className="text-xs text-muted-foreground mb-3">{cat.desc}</p>
                      {areas.map((area, i) => {
                        const riskConf = RISK_CONFIG[area.risk];
                        const RiskIcon = riskConf.icon;
                        return (
                          <div
                            key={i}
                            className="flex items-start gap-3 p-3 rounded-md bg-muted/40 border border-transparent hover:border-border transition-colors"
                            data-testid={`test-area-${cat.key}-${i}`}
                          >
                            <div className={`mt-0.5 p-1 rounded ${riskConf.bg}`}>
                              <RiskIcon className={`w-3 h-3 ${riskConf.color}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm font-medium">{area.area}</span>
                                <Badge variant="outline" className={`text-[10px] h-4 ${riskConf.color} border-current/20`}>
                                  {riskConf.label}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{area.scenario}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          {/* Explicit gaps */}
          {testMap.explicit_gaps.length > 0 && (
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-amber-500" />
                  Explicit Gaps
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ul className="space-y-1">
                  {testMap.explicit_gaps.map((gap, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5">•</span>
                      {gap}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Start session button */}
          <div className="flex justify-end">
            <Button
              onClick={() => navigate(`/session/${params.id}/test`)}
              className="gap-1.5"
              data-testid="button-start-session"
            >
              <Play className="w-4 h-4" />
              Start Testing Session
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function InfoPill({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-muted/30 rounded-md p-2 text-center">
      <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-xs font-medium ${className || ""}`}>{value}</div>
    </div>
  );
}
