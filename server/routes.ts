import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import type { TestMap } from "@shared/schema";

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
    const { ticketId, ticketTitle, ticketDescription } = req.body;
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
    });
    res.json(session);
  });

  app.patch("/api/sessions/:id", async (req, res) => {
    const updated = await storage.updateSession(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Session not found" });
    res.json(updated);
  });

  // ─── AI: Generate test map ───

  app.post("/api/ai/test-map", async (req, res) => {
    const { sessionId } = req.body;
    const session = await storage.getSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Generate a realistic test map based on the ticket context
    const testMap = generateTestMap(session.ticketId, session.ticketTitle || "", session.ticketDescription || "");

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

    // Determine covered areas
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

  return httpServer;
}

// ─── AI Mock Helpers ───

function generateTestMap(ticketId: string, title: string, description: string): TestMap {
  const context = `${title} ${description}`.toLowerCase();

  // Generate context-aware test areas
  const hasAuth = /auth|login|password|token|session|permission/i.test(context);
  const hasForm = /form|input|submit|validation|field/i.test(context);
  const hasApi = /api|endpoint|request|response|rest|graphql/i.test(context);
  const hasPayment = /payment|checkout|cart|price|billing/i.test(context);
  const hasSearch = /search|filter|sort|query/i.test(context);

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

  const explicit_gaps = [
    "Performance under load not testable in current environment",
    "Third-party service behavior during outages",
    "Cross-browser rendering differences need dedicated session",
  ];

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

  // Default: confirm logged and suggest next
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

  // Section 1: How I understood this ticket
  report += `## How I Read This Ticket\n\n`;
  report += `When I received **${ticketId}** ("${title}"), I analyzed the ticket context and identified `;
  report += `**${allAreas.length} test areas** across four categories: `;
  const highCount = allAreas.filter(a => a.risk === "high").length;
  const medCount = allAreas.filter(a => a.risk === "medium").length;
  const lowCount = allAreas.filter(a => a.risk === "low").length;
  report += `${highCount} high-risk, ${medCount} medium-risk, and ${lowCount} low-risk scenarios.\n\n`;

  if (testMap?.explicit_gaps && testMap.explicit_gaps.length > 0) {
    report += `I flagged ${testMap.explicit_gaps.length} explicit gaps where I couldn't determine testability from context alone:\n`;
    testMap.explicit_gaps.forEach(g => { report += `- ${g}\n`; });
    report += `\n`;
  }

  // Section 2: What the session revealed
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

  // Untested areas
  const untestedAreas = allAreas.filter(a => !coveredAreas.has(a.area));
  if (untestedAreas.length > 0) {
    report += `### Untested Areas (${untestedAreas.length})\n\n`;
    untestedAreas.forEach(a => {
      report += `- **${a.area}** (${a.risk} risk) — ${a.scenario}\n`;
    });
    report += `\n`;
  }

  // Section 3: My honest assessment
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
