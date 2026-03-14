import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { fetchJiraTicket, fetchGithubPr, fetchConfluenceContext } from "./integrations";
import type { TestMap, MergedContext, DashboardStats } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ─── Sessions CRUD ───

  app.get("/api/sessions", async (_req, res) => {
    const sessions = await storage.getAllSessions();
    res.json(sessions);
  });

  app.get("/api/sessions/:id", async (req, res) => {
    const session = await storage.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  });

  app.post("/api/sessions", async (req, res) => {
    const { ticketId, ticketTitle, ticketDescription, visibility } = req.body;
    if (!ticketId) return res.status(400).json({ error: "ticketId is required" });

    const session = await storage.createSession({
      ticketId,
      ticketTitle: ticketTitle || null,
      ticketDescription: ticketDescription || null,
      contextJson: null,
      testMap: null,
      status: "planning",
      createdAt: Math.floor(Date.now() / 1000),
      completedAt: null,
      createdBy: "default",
      visibility: visibility || "team",
    });
    res.json(session);
  });

  app.patch("/api/sessions/:id", async (req, res) => {
    const updated = await storage.updateSession(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Session not found" });
    res.json(updated);
  });

  app.delete("/api/sessions/:id", async (req, res) => {
    const deleted = await storage.deleteSession(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Session not found" });
    res.json({ ok: true });
  });

  // ─── Integration Config ───

  app.get("/api/config/integrations", async (_req, res) => {
    const config = await storage.getIntegrationConfig();
    // Mask sensitive tokens
    const masked = {
      jira: { ...config.jira, apiToken: config.jira.apiToken ? "••••••" : undefined },
      github: { ...config.github, token: config.github.token ? "••••••" : undefined },
      confluence: { ...config.confluence, apiToken: config.confluence.apiToken ? "••••••" : undefined },
    };
    res.json(masked);
  });

  app.put("/api/config/integrations", async (req, res) => {
    const existing = await storage.getIntegrationConfig();
    const incoming = req.body;

    // Preserve existing tokens if masked values are sent back
    const config = {
      jira: {
        ...incoming.jira,
        apiToken: incoming.jira?.apiToken === "••••••"
          ? existing.jira.apiToken
          : incoming.jira?.apiToken,
      },
      github: {
        ...incoming.github,
        token: incoming.github?.token === "••••••"
          ? existing.github.token
          : incoming.github?.token,
      },
      confluence: {
        ...incoming.confluence,
        apiToken: incoming.confluence?.apiToken === "••••••"
          ? existing.confluence.apiToken
          : incoming.confluence?.apiToken,
      },
    };

    const saved = await storage.saveIntegrationConfig(config);
    res.json(saved);
  });

  // ─── Context Fetch (Jira + GitHub + Confluence) ───

  app.post("/api/context/fetch", async (req, res) => {
    const { sessionId, ticketId } = req.body;
    if (!ticketId) return res.status(400).json({ error: "ticketId is required" });

    const config = await storage.getIntegrationConfig();

    try {
      const [jira, github, confluence] = await Promise.allSettled([
        fetchJiraTicket(ticketId, config.jira),
        fetchGithubPr(ticketId, config.github),
        fetchConfluenceContext(ticketId, config.confluence),
      ]);

      const context: MergedContext = {
        jira: jira.status === "fulfilled" ? jira.value : null,
        github: github.status === "fulfilled" ? github.value : null,
        confluence: confluence.status === "fulfilled" ? confluence.value : null,
        fetchedAt: Math.floor(Date.now() / 1000),
      };

      // Update session with context + auto-fill title/description from Jira
      if (sessionId) {
        const updateData: Record<string, any> = {
          contextJson: JSON.stringify(context),
        };
        if (context.jira) {
          updateData.ticketTitle = context.jira.summary;
          updateData.ticketDescription = [
            context.jira.description,
            context.jira.acceptanceCriteria ? `\n\nAcceptance Criteria:\n${context.jira.acceptanceCriteria}` : "",
          ].filter(Boolean).join("");
        }
        await storage.updateSession(sessionId, updateData);
      }

      res.json(context);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch context" });
    }
  });

  // ─── AI: Generate test map ───

  app.post("/api/ai/test-map", async (req, res) => {
    const { sessionId } = req.body;
    const session = await storage.getSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Parse merged context if available
    let mergedContext: MergedContext | null = null;
    if (session.contextJson) {
      try { mergedContext = JSON.parse(session.contextJson); } catch {}
    }

    const testMap = generateTestMap(
      session.ticketId,
      session.ticketTitle || "",
      session.ticketDescription || "",
      mergedContext
    );

    await storage.updateSession(sessionId, {
      testMap: JSON.stringify(testMap),
      status: "active",
    });

    res.json(testMap);
  });

  // ─── AI: Nudge ───

  app.post("/api/ai/nudge", async (req, res) => {
    const { sessionId, utterance } = req.body;
    const session = await storage.getSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const testMap: TestMap | null = session.testMap ? JSON.parse(session.testMap) : null;
    const logs = await storage.getLogEntries(sessionId);

    const coveredAreas = new Set(logs.filter(l => l.mappedArea).map(l => l.mappedArea));
    const allAreas = testMap ? [
      ...testMap.happy_paths,
      ...testMap.edge_cases,
      ...testMap.negative_flows,
      ...testMap.integration_risks,
    ] : [];
    const uncoveredHigh = allAreas.filter(a => a.risk === "high" && !coveredAreas.has(a.area));

    const nudge = generateNudge(utterance, uncoveredHigh, coveredAreas.size, allAreas.length);

    res.json({ nudge, mappedArea: detectArea(utterance, allAreas) });
  });

  // ─── AI: Generate summary ───

  app.post("/api/ai/summary", async (req, res) => {
    const { sessionId } = req.body;
    const session = await storage.getSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const logs = await storage.getLogEntries(sessionId);
    const testMap: TestMap | null = session.testMap ? JSON.parse(session.testMap) : null;

    const bugs = logs.filter(l => l.type === "bug");
    const skips = logs.filter(l => l.type === "skip");
    const coveredAreas = new Set(logs.filter(l => l.mappedArea).map(l => l.mappedArea));
    const allAreas = testMap ? [
      ...testMap.happy_paths,
      ...testMap.edge_cases,
      ...testMap.negative_flows,
      ...testMap.integration_risks,
    ] : [];
    const coveragePct = allAreas.length > 0
      ? Math.round((coveredAreas.size / allAreas.length) * 100)
      : 0;

    const hasCritical = bugs.some(b => b.severity === "critical");
    const hasMajor = bugs.some(b => b.severity === "major");
    const goNogo = hasCritical ? "no-go" : hasMajor ? "conditional" : (coveragePct >= 70 ? "go" : "conditional");
    const riskLevel = hasCritical ? "high" : hasMajor ? "medium" : "low";

    const reportMarkdown = generateSummaryReport(
      session, testMap, logs, bugs, skips, coveredAreas, allAreas, coveragePct, goNogo, riskLevel
    );

    const summary = await storage.createSummary({
      sessionId,
      reportMarkdown,
      goNogo,
      riskLevel,
      coveragePct,
      generatedAt: Math.floor(Date.now() / 1000),
    });

    await storage.updateSession(sessionId, {
      status: "complete",
      completedAt: Math.floor(Date.now() / 1000),
    });

    res.json(summary);
  });

  // ─── Session Log ───

  app.get("/api/sessions/:id/log", async (req, res) => {
    const logs = await storage.getLogEntries(req.params.id);
    res.json(logs);
  });

  app.post("/api/sessions/:id/log", async (req, res) => {
    const { type, content, mappedArea, severity } = req.body;
    const entry = await storage.addLogEntry({
      sessionId: req.params.id,
      timestamp: Math.floor(Date.now() / 1000),
      type,
      content,
      mappedArea: mappedArea || null,
      severity: severity || null,
    });
    res.json(entry);
  });

  // ─── Session Summary ───

  app.get("/api/sessions/:id/summary", async (req, res) => {
    const summary = await storage.getSummary(req.params.id);
    if (!summary) return res.status(404).json({ error: "Summary not found" });
    res.json(summary);
  });

  // ─── Manager Dashboard Stats ───

  app.get("/api/dashboard/stats", async (_req, res) => {
    const sessions = await storage.getAllSessions();
    const summaries = await storage.getAllSummaries();
    const summaryMap = new Map(summaries.map(s => [s.sessionId, s]));

    const completed = sessions.filter(s => s.status === "complete");
    const completedSummaries = completed
      .map(s => summaryMap.get(s.id))
      .filter(Boolean) as typeof summaries;

    const avgCoverage = completedSummaries.length > 0
      ? Math.round(completedSummaries.reduce((sum, s) => sum + s.coveragePct, 0) / completedSummaries.length)
      : 0;

    // Count total bugs across all sessions
    let totalBugs = 0;
    const bugsByCategory: Record<string, number> = {};
    for (const session of sessions) {
      const logs = await storage.getLogEntries(session.id);
      const bugs = logs.filter(l => l.type === "bug");
      totalBugs += bugs.length;
      for (const bug of bugs) {
        const cat = bug.severity || "unrated";
        bugsByCategory[cat] = (bugsByCategory[cat] || 0) + 1;
      }
    }

    // Coverage trend (group by date)
    const trendMap = new Map<string, { coverage: number[]; count: number }>();
    for (const s of completedSummaries) {
      const date = new Date(s.generatedAt * 1000).toISOString().split("T")[0];
      const existing = trendMap.get(date) || { coverage: [], count: 0 };
      existing.coverage.push(s.coveragePct);
      existing.count++;
      trendMap.set(date, existing);
    }

    const coverageTrend = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        coverage: Math.round(data.coverage.reduce((a, b) => a + b, 0) / data.coverage.length),
        sessions: data.count,
      }));

    // Recent sessions with summaries
    const recentSessions = sessions.slice(0, 10).map(s => ({
      ...s,
      summary: summaryMap.get(s.id),
    }));

    const stats: DashboardStats = {
      totalSessions: sessions.length,
      completedSessions: completed.length,
      avgCoverage,
      totalBugs,
      goCount: completedSummaries.filter(s => s.goNogo === "go").length,
      noGoCount: completedSummaries.filter(s => s.goNogo === "no-go").length,
      conditionalCount: completedSummaries.filter(s => s.goNogo === "conditional").length,
      coverageTrend,
      bugsByCategory: Object.entries(bugsByCategory).map(([category, count]) => ({ category, count })),
      recentSessions,
    };

    res.json(stats);
  });

  return httpServer;
}

// ─── AI Mock Helpers ───

function generateTestMap(
  ticketId: string,
  title: string,
  description: string,
  mergedContext: MergedContext | null
): TestMap {
  // Build enriched context from all sources
  let context = `${title} ${description}`.toLowerCase();

  if (mergedContext?.jira) {
    const jira = mergedContext.jira;
    context += ` ${jira.summary} ${jira.description || ""} ${jira.acceptanceCriteria || ""}`.toLowerCase();
    context += ` ${jira.labels.join(" ")} ${jira.components.join(" ")}`.toLowerCase();
  }

  if (mergedContext?.github) {
    const gh = mergedContext.github;
    context += ` ${gh.title} ${gh.body || ""}`.toLowerCase();
    context += ` ${gh.filesChanged.map(f => f.filename).join(" ")}`.toLowerCase();
  }

  if (mergedContext?.confluence) {
    context += ` ${mergedContext.confluence.pages.map(p => `${p.title} ${p.excerpt}`).join(" ")}`.toLowerCase();
  }

  const hasAuth = /auth|login|password|token|session|permission|oauth/i.test(context);
  const hasForm = /form|input|submit|validation|field/i.test(context);
  const hasApi = /api|endpoint|request|response|rest|graphql/i.test(context);
  const hasPayment = /payment|checkout|cart|price|billing|stripe/i.test(context);
  const hasSearch = /search|filter|sort|query|elasticsearch/i.test(context);
  const hasDb = /database|migration|schema|sql|query/i.test(context);
  const hasPerf = /performance|latency|p95|p99|load|cache/i.test(context);

  const happy_paths = [
    { area: "Core functionality", scenario: `Verify ${title || ticketId} works as described in acceptance criteria`, risk: "high" as const },
    { area: "User workflow", scenario: "Complete the primary user journey end-to-end", risk: "high" as const },
    { area: "Data persistence", scenario: "Verify changes are saved correctly and retrievable", risk: "medium" as const },
  ];

  if (hasAuth) happy_paths.push({ area: "Authentication flow", scenario: "Valid login credentials grant access successfully", risk: "high" as const });
  if (hasForm) happy_paths.push({ area: "Form submission", scenario: "Submit form with all valid fields and verify success", risk: "high" as const });
  if (hasPayment) happy_paths.push({ area: "Payment processing", scenario: "Complete checkout with valid payment method", risk: "high" as const });

  const edge_cases = [
    { area: "Boundary values", scenario: "Test with minimum and maximum allowed input lengths", risk: "medium" as const },
    { area: "Special characters", scenario: "Input fields handle unicode, emojis, and special characters", risk: "medium" as const },
    { area: "Concurrent operations", scenario: "Multiple rapid submissions or clicks do not cause duplicates", risk: "low" as const },
    { area: "Empty states", scenario: "UI handles zero results or empty data gracefully", risk: "low" as const },
  ];

  if (hasSearch) edge_cases.push({ area: "Search edge cases", scenario: "Search with very long queries, special chars, and SQL-like inputs", risk: "medium" as const });
  if (hasDb) edge_cases.push({ area: "Data migration edge cases", scenario: "Verify backward compatibility with existing data after schema changes", risk: "high" as const });

  const negative_flows = [
    { area: "Invalid input", scenario: "Submit with missing required fields and verify error messages", risk: "high" as const },
    { area: "Error handling", scenario: "Simulate server error and verify graceful degradation", risk: "medium" as const },
    { area: "Unauthorized access", scenario: "Attempt action without proper permissions", risk: "medium" as const },
  ];

  if (hasAuth) negative_flows.push({ area: "Auth failure", scenario: "Invalid credentials show appropriate error, account lockout after retries", risk: "high" as const });
  if (hasPayment) negative_flows.push({ area: "Payment failure", scenario: "Declined card, expired card, and insufficient funds handling", risk: "high" as const });

  const integration_risks = [
    { area: "API contract", scenario: "Verify API request/response matches expected schema", risk: "high" as const },
    { area: "Database consistency", scenario: "Data written matches what is read back, no orphaned records", risk: "medium" as const },
  ];

  if (hasApi) integration_risks.push({ area: "API rate limiting", scenario: "Verify behavior when API rate limits are hit", risk: "low" as const });
  if (hasPerf) integration_risks.push({ area: "Performance under load", scenario: "Verify response times meet SLA under concurrent requests", risk: "high" as const });

  // Enrich gaps from Confluence historical patterns
  const explicit_gaps = [
    "Performance under load not testable in current environment",
    "Third-party service behavior during outages",
    "Cross-browser rendering differences need dedicated session",
  ];

  if (mergedContext?.confluence?.historicalPatterns) {
    for (const pattern of mergedContext.confluence.historicalPatterns) {
      explicit_gaps.push(`Historical pattern: ${pattern}`);
    }
  }

  // Enrich from PR review comments
  if (mergedContext?.github?.reviewComments) {
    for (const comment of mergedContext.github.reviewComments.slice(0, 3)) {
      if (comment.body.toLowerCase().includes("test") || comment.body.toLowerCase().includes("edge case")) {
        explicit_gaps.push(`PR review concern (${comment.path}): ${comment.body.slice(0, 150)}`);
      }
    }
  }

  return { happy_paths, edge_cases, negative_flows, integration_risks, explicit_gaps };
}

function detectArea(utterance: string, allAreas: { area: string; scenario: string }[]): string | null {
  const lowerUtterance = utterance.toLowerCase();
  for (const a of allAreas) {
    const keywords = a.area.toLowerCase().split(/\s+/);
    if (keywords.some(k => k.length > 3 && lowerUtterance.includes(k))) {
      return a.area;
    }
  }
  return allAreas.length > 0 ? allAreas[0].area : null;
}

function generateNudge(
  utterance: string,
  uncoveredHigh: { area: string; scenario: string }[],
  coveredCount: number,
  totalCount: number
): string {
  const lowerUtterance = utterance.toLowerCase();

  if (/bug|issue|defect|broken|error|fail/i.test(lowerUtterance)) {
    return "Bug noted. What severity would you assign — critical, major, or minor?";
  }

  if (/skip|later|not now/i.test(lowerUtterance)) {
    return "Area marked as skipped. I'll note the reason in the session log.";
  }

  if (/coverage|progress|how.*doing|status/i.test(lowerUtterance)) {
    const pct = totalCount > 0 ? Math.round((coveredCount / totalCount) * 100) : 0;
    const remaining = uncoveredHigh.length;
    return `You're at ${pct}% coverage. ${remaining > 0 ? `${remaining} high-risk area${remaining > 1 ? 's' : ''} still uncovered.` : 'All high-risk areas covered.'}`;
  }

  if (/miss|forgot|what.*next/i.test(lowerUtterance)) {
    if (uncoveredHigh.length > 0) {
      return `Next high-priority: "${uncoveredHigh[0].area}" — ${uncoveredHigh[0].scenario}.`;
    }
    return "All high-risk areas are covered. Consider exploring edge cases next.";
  }

  if (/done|finish|wrap/i.test(lowerUtterance)) {
    return "Ready to wrap up. I'll generate your session summary now.";
  }

  const pct = totalCount > 0 ? Math.round((coveredCount / totalCount) * 100) : 0;
  if (uncoveredHigh.length > 0) {
    return `Logged and mapped. Coverage at ${pct}%. Consider "${uncoveredHigh[0].area}" next — it's high-risk and untested.`;
  }
  return `Logged and mapped. Coverage at ${pct}%. Good progress across the test plan.`;
}

function generateSummaryReport(
  session: any,
  testMap: TestMap | null,
  logs: any[],
  bugs: any[],
  skips: any[],
  coveredAreas: Set<string | null>,
  allAreas: any[],
  coveragePct: number,
  goNogo: string,
  riskLevel: string
): string {
  const ticketId = session.ticketId;
  const title = session.ticketTitle || ticketId;
  const utterances = logs.filter(l => l.type === "utterance");

  let report = `# Session Summary: ${ticketId}\n\n`;

  report += `## How I Read This Ticket\n\n`;
  report += `When I received **${ticketId}** ("${title}"), I analyzed the ticket context and identified `;
  report += `**${allAreas.length} test areas** across four categories: `;
  const highCount = allAreas.filter(a => a.risk === "high").length;
  const medCount = allAreas.filter(a => a.risk === "medium").length;
  const lowCount = allAreas.filter(a => a.risk === "low").length;
  report += `${highCount} high-risk, ${medCount} medium-risk, and ${lowCount} low-risk scenarios.\n\n`;

  // Mention context sources used
  let mergedContext: any = null;
  try { mergedContext = session.contextJson ? JSON.parse(session.contextJson) : null; } catch {}
  if (mergedContext) {
    const sources: string[] = [];
    if (mergedContext.jira) sources.push("Jira ticket details");
    if (mergedContext.github) sources.push(`GitHub PR #${mergedContext.github.prNumber} (${mergedContext.github.filesChanged?.length || 0} files changed)`);
    if (mergedContext.confluence) sources.push(`${mergedContext.confluence.pages?.length || 0} Confluence pages`);
    if (sources.length > 0) {
      report += `Context sources: ${sources.join(", ")}.\n\n`;
    }
  }

  if (testMap?.explicit_gaps && testMap.explicit_gaps.length > 0) {
    report += `I flagged ${testMap.explicit_gaps.length} explicit gaps where I couldn't determine testability from context alone:\n`;
    testMap.explicit_gaps.forEach(g => { report += `- ${g}\n`; });
    report += `\n`;
  }

  report += `## What the Session Revealed\n\n`;
  report += `During the session, **${utterances.length} test actions** were logged covering **${coveredAreas.size} of ${allAreas.length}** planned areas (${coveragePct}% coverage).\n\n`;

  if (bugs.length > 0) {
    report += `### Bugs Found (${bugs.length})\n\n`;
    bugs.forEach((b, i) => {
      report += `${i + 1}. **[${(b.severity || "unrated").toUpperCase()}]** ${b.content}\n`;
      if (b.mappedArea) report += `   - Area: ${b.mappedArea}\n`;
    });
    report += `\n`;
  } else {
    report += `No bugs were reported during this session.\n\n`;
  }

  if (skips.length > 0) {
    report += `### Skipped Areas (${skips.length})\n\n`;
    skips.forEach((s, i) => {
      report += `${i + 1}. ${s.content}${s.mappedArea ? ` (${s.mappedArea})` : ""}\n`;
    });
    report += `\n`;
  }

  const untestedAreas = allAreas.filter(a => !coveredAreas.has(a.area));
  if (untestedAreas.length > 0) {
    report += `### Untested Areas (${untestedAreas.length})\n\n`;
    untestedAreas.forEach(a => {
      report += `- **${a.area}** (${a.risk} risk) — ${a.scenario}\n`;
    });
    report += `\n`;
  }

  report += `## My Honest Assessment\n\n`;
  report += `| Metric | Value |\n|---|---|\n`;
  report += `| Coverage | ${coveragePct}% |\n`;
  report += `| Bugs Found | ${bugs.length} |\n`;
  report += `| Risk Level | ${riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} |\n`;
  report += `| Recommendation | **${goNogo.toUpperCase()}** |\n\n`;

  if (goNogo === "go") {
    report += `Based on the coverage achieved and the absence of critical issues, I recommend proceeding with release. `;
    report += `The testing covered the core happy paths and key risk areas effectively.\n`;
  } else if (goNogo === "conditional") {
    report += `I recommend a **conditional go** — the session revealed areas that need attention before release. `;
    if (bugs.some(b => b.severity === "major")) {
      report += `There are major bugs that should be fixed and retested. `;
    }
    if (coveragePct < 70) {
      report += `Coverage is below 70%, meaning significant test areas remain unexplored. `;
    }
    report += `Address the noted issues and consider a follow-up session.\n`;
  } else {
    report += `I recommend **no-go** for release. Critical issues were found that block the feature. `;
    report += `These must be resolved and the affected areas retested before release.\n`;
  }

  return report;
}
