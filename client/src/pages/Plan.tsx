import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Loader2, Sparkles, Play, AlertTriangle, Shield, Zap, Link2, HelpCircle,
  ChevronRight, ArrowUpCircle, ArrowRightCircle, ArrowDownCircle
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Session, TestMap, TestArea } from "@/lib/types";

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

  const testMap: TestMap | null = session?.testMap ? JSON.parse(session.testMap) : null;

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

      {/* Generate or show test map */}
      {!testMap ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-sm font-medium mb-1">Generate Test Map</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              The AI will analyze your ticket context and generate a risk-ranked test plan organized into
              happy paths, edge cases, negative flows, and integration risks.
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
