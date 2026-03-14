/**
 * Integration services for Jira, GitHub, and Confluence.
 * Each integration has a "real" mode (calls actual APIs) and a "mock" mode
 * (returns realistic demo data when no credentials are configured).
 */
import type {
  IntegrationConfig,
  JiraContext,
  GithubPrContext,
  ConfluenceContext,
} from "@shared/schema";

// ─── Jira Integration ───

export async function fetchJiraTicket(
  ticketId: string,
  config: IntegrationConfig["jira"]
): Promise<JiraContext> {
  if (config.enabled && config.baseUrl && config.email && config.apiToken) {
    return fetchJiraTicketReal(ticketId, config);
  }
  return generateMockJiraContext(ticketId);
}

async function fetchJiraTicketReal(
  ticketId: string,
  config: { baseUrl?: string; email?: string; apiToken?: string }
): Promise<JiraContext> {
  const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  const baseUrl = config.baseUrl!.replace(/\/$/, "");

  const res = await fetch(`${baseUrl}/rest/api/3/issue/${ticketId}?expand=renderedFields`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Jira API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const fields = data.fields;

  // Extract acceptance criteria from custom field or description
  let acceptanceCriteria: string | null = null;
  const desc = fields.description?.content
    ? extractTextFromAdf(fields.description)
    : (typeof fields.description === "string" ? fields.description : null);

  if (desc) {
    const acMatch = desc.match(/acceptance\s*criteria[:\s]*([\s\S]*?)(?=\n#{1,3}\s|\n---|\$)/i);
    if (acMatch) acceptanceCriteria = acMatch[1].trim();
  }

  // Extract linked issues
  const linkedIssues = (fields.issuelinks || []).map((link: any) => {
    const outward = link.outwardIssue;
    const inward = link.inwardIssue;
    if (outward) {
      return { key: outward.key, summary: outward.fields?.summary || "", type: link.type?.outward || "relates to" };
    }
    if (inward) {
      return { key: inward.key, summary: inward.fields?.summary || "", type: link.type?.inward || "relates to" };
    }
    return null;
  }).filter(Boolean);

  return {
    key: data.key,
    summary: fields.summary || ticketId,
    description: desc,
    status: fields.status?.name || "Unknown",
    priority: fields.priority?.name || "Medium",
    assignee: fields.assignee?.displayName || null,
    reporter: fields.reporter?.displayName || null,
    labels: fields.labels || [],
    components: (fields.components || []).map((c: any) => c.name),
    acceptanceCriteria,
    linkedIssues,
  };
}

function extractTextFromAdf(adf: any): string {
  if (!adf || !adf.content) return "";
  return adf.content
    .map((block: any) => {
      if (block.type === "paragraph" || block.type === "heading") {
        return (block.content || []).map((c: any) => c.text || "").join("");
      }
      if (block.type === "bulletList" || block.type === "orderedList") {
        return (block.content || []).map((item: any) =>
          "- " + (item.content || []).map((p: any) =>
            (p.content || []).map((c: any) => c.text || "").join("")
          ).join("")
        ).join("\n");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function generateMockJiraContext(ticketId: string): JiraContext {
  const project = ticketId.split("-")[0] || "PROJ";
  const num = parseInt(ticketId.split("-")[1]) || 100;

  const scenarios: Record<number, Partial<JiraContext>> = {
    0: {
      summary: "Implement user authentication flow with OAuth2",
      description: "As a user, I want to log in using my Google or GitHub account so I don't need to create a new password.\n\nThe login page should show social login buttons above the email/password form. After OAuth callback, create or link the user account and establish a session.\n\nEdge cases to consider:\n- User has existing account with same email\n- OAuth provider returns incomplete profile\n- Token refresh flow when access token expires",
      priority: "High",
      labels: ["auth", "security", "sprint-12"],
      components: ["Frontend", "Auth Service"],
      acceptanceCriteria: "1. Google and GitHub OAuth buttons on login page\n2. Successful OAuth creates session and redirects to dashboard\n3. Existing email accounts are linked, not duplicated\n4. Token refresh works transparently\n5. Error states show user-friendly messages",
      linkedIssues: [
        { key: `${project}-${num - 3}`, summary: "Design login page mockups", type: "is blocked by" },
        { key: `${project}-${num + 1}`, summary: "Add rate limiting to auth endpoints", type: "blocks" },
      ],
    },
    1: {
      summary: "Add payment processing with Stripe integration",
      description: "Implement checkout flow using Stripe Elements for PCI compliance. Support credit/debit cards and Apple Pay.\n\nThe checkout should validate the cart, create a PaymentIntent, and handle both success and failure states. Webhook handler needed for async payment confirmations.",
      priority: "Critical",
      labels: ["payments", "stripe", "sprint-12"],
      components: ["Checkout", "Backend API"],
      acceptanceCriteria: "1. Stripe Elements renders card input securely\n2. PaymentIntent created with correct amount\n3. Success redirects to confirmation page\n4. Failed payments show clear error message\n5. Webhook handles payment_intent.succeeded event\n6. Apple Pay works on supported devices",
      linkedIssues: [
        { key: `${project}-${num - 5}`, summary: "Set up Stripe test account", type: "is blocked by" },
      ],
    },
    2: {
      summary: "Refactor search with Elasticsearch integration",
      description: "Replace the current SQL LIKE-based search with Elasticsearch for better relevance and performance.\n\nIndex products, articles, and user profiles. Support typo tolerance, synonyms, and faceted filtering. The search API should return results within 200ms for 95th percentile.",
      priority: "Medium",
      labels: ["search", "performance", "infrastructure"],
      components: ["Search Service", "Backend API"],
      acceptanceCriteria: "1. All three content types are indexed\n2. Typo tolerance handles common misspellings\n3. Faceted filters for category, date, and price range\n4. P95 response time under 200ms\n5. Incremental re-indexing on content change",
      linkedIssues: [],
    },
  };

  const scenario = scenarios[num % 3] || scenarios[0];

  return {
    key: ticketId,
    summary: scenario.summary!,
    description: scenario.description ?? null,
    status: "In Progress",
    priority: scenario.priority || "Medium",
    assignee: "Alex Chen",
    reporter: "Sarah Kim",
    labels: scenario.labels || [],
    components: scenario.components || [],
    acceptanceCriteria: scenario.acceptanceCriteria ?? null,
    linkedIssues: scenario.linkedIssues || [],
  };
}

// ─── GitHub Integration ───

export async function fetchGithubPr(
  ticketId: string,
  config: IntegrationConfig["github"]
): Promise<GithubPrContext | null> {
  if (config.enabled && config.token && config.repos.length > 0) {
    return fetchGithubPrReal(ticketId, config);
  }
  return generateMockGithubPrContext(ticketId);
}

async function fetchGithubPrReal(
  ticketId: string,
  config: { token?: string; repos: string[] }
): Promise<GithubPrContext | null> {
  // Search for PRs referencing the ticket ID across configured repos
  for (const repo of config.repos) {
    const searchRes = await fetch(
      `https://api.github.com/search/issues?q=${encodeURIComponent(ticketId)}+repo:${repo}+type:pr`,
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!searchRes.ok) continue;
    const searchData = await searchRes.json();
    if (!searchData.items || searchData.items.length === 0) continue;

    const pr = searchData.items[0];
    const prNumber = pr.number;

    // Fetch PR files
    const filesRes = await fetch(
      `https://api.github.com/repos/${repo}/pulls/${prNumber}/files`,
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    const files = filesRes.ok ? await filesRes.json() : [];

    // Fetch review comments
    const commentsRes = await fetch(
      `https://api.github.com/repos/${repo}/pulls/${prNumber}/comments`,
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    const comments = commentsRes.ok ? await commentsRes.json() : [];

    return {
      prNumber,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      author: pr.user?.login || "unknown",
      filesChanged: files.map((f: any) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch?.slice(0, 2000), // Truncate large patches
      })),
      totalAdditions: files.reduce((sum: number, f: any) => sum + (f.additions || 0), 0),
      totalDeletions: files.reduce((sum: number, f: any) => sum + (f.deletions || 0), 0),
      reviewComments: comments.slice(0, 20).map((c: any) => ({
        author: c.user?.login || "unknown",
        body: c.body,
        path: c.path,
      })),
    };
  }

  return null;
}

function generateMockGithubPrContext(ticketId: string): GithubPrContext {
  const num = parseInt(ticketId.split("-")[1]) || 100;
  const prNum = 200 + num;

  const fileScenarios = [
    [
      { filename: "src/auth/oauth-handler.ts", status: "added", additions: 145, deletions: 0 },
      { filename: "src/auth/session-manager.ts", status: "modified", additions: 38, deletions: 12 },
      { filename: "src/components/LoginPage.tsx", status: "modified", additions: 67, deletions: 23 },
      { filename: "src/middleware/auth.ts", status: "modified", additions: 22, deletions: 8 },
      { filename: "tests/auth/oauth.test.ts", status: "added", additions: 89, deletions: 0 },
      { filename: "src/types/auth.ts", status: "modified", additions: 15, deletions: 3 },
    ],
    [
      { filename: "src/checkout/stripe-client.ts", status: "added", additions: 112, deletions: 0 },
      { filename: "src/checkout/PaymentForm.tsx", status: "added", additions: 178, deletions: 0 },
      { filename: "src/api/webhooks/stripe.ts", status: "added", additions: 95, deletions: 0 },
      { filename: "src/checkout/CartSummary.tsx", status: "modified", additions: 34, deletions: 11 },
      { filename: "package.json", status: "modified", additions: 2, deletions: 0 },
    ],
    [
      { filename: "src/search/elasticsearch-client.ts", status: "added", additions: 89, deletions: 0 },
      { filename: "src/search/indexer.ts", status: "added", additions: 134, deletions: 0 },
      { filename: "src/api/search.ts", status: "modified", additions: 56, deletions: 78 },
      { filename: "src/components/SearchBar.tsx", status: "modified", additions: 28, deletions: 15 },
      { filename: "docker-compose.yml", status: "modified", additions: 12, deletions: 0 },
    ],
  ];

  const files = fileScenarios[num % 3];
  const totalAdd = files.reduce((s, f) => s + f.additions, 0);
  const totalDel = files.reduce((s, f) => s + f.deletions, 0);

  return {
    prNumber: prNum,
    title: `feat(${ticketId.toLowerCase()}): implement ${ticketId}`,
    body: `## Changes\n\nImplements ${ticketId}.\n\n## Testing\n\n- [ ] Unit tests added\n- [ ] Manual testing checklist attached`,
    state: "open",
    author: "alex-dev",
    filesChanged: files.map(f => ({ ...f, patch: `@@ -1,10 +1,${f.additions} @@\n+// Changes for ${ticketId}` })),
    totalAdditions: totalAdd,
    totalDeletions: totalDel,
    reviewComments: [
      { author: "sarah-review", body: "Consider adding error boundary around this component", path: files[0].filename },
      { author: "mike-qa", body: "Need to test the edge case where token expires mid-flow", path: files[1]?.filename || files[0].filename },
    ],
  };
}

// ─── Confluence Integration ───

export async function fetchConfluenceContext(
  ticketId: string,
  config: IntegrationConfig["confluence"]
): Promise<ConfluenceContext> {
  if (config.enabled && config.baseUrl && config.email && config.apiToken) {
    return fetchConfluenceReal(ticketId, config);
  }
  return generateMockConfluenceContext(ticketId);
}

async function fetchConfluenceReal(
  ticketId: string,
  config: { baseUrl?: string; email?: string; apiToken?: string; spaceKeys: string[] }
): Promise<ConfluenceContext> {
  const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  const baseUrl = config.baseUrl!.replace(/\/$/, "");

  const spaceCql = config.spaceKeys.length > 0
    ? ` AND space in (${config.spaceKeys.map(s => `"${s}"`).join(",")})`
    : "";

  const cql = `text ~ "${ticketId}" OR title ~ "${ticketId}"${spaceCql}`;

  const res = await fetch(
    `${baseUrl}/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=10&expand=body.excerpt,space,version`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Confluence API error: ${res.status}`);
  }

  const data = await res.json();
  const pages = (data.results || []).map((page: any) => ({
    title: page.title,
    space: page.space?.name || page.space?.key || "",
    excerpt: page.body?.excerpt?.value?.replace(/<[^>]+>/g, "").slice(0, 500) || "",
    url: `${baseUrl}${page._links?.webui || ""}`,
    lastUpdated: page.version?.when || "",
  }));

  // Derive patterns from page content
  const historicalPatterns = derivePatterns(pages);

  return { pages, historicalPatterns };
}

function generateMockConfluenceContext(ticketId: string): ConfluenceContext {
  const project = ticketId.split("-")[0] || "PROJ";

  return {
    pages: [
      {
        title: `${project} Architecture Overview`,
        space: "Engineering",
        excerpt: `System architecture for the ${project} module, covering service boundaries, database schema, and API contracts. Last reviewed Q4 2025. Key concern: auth service is a single point of failure.`,
        url: "#",
        lastUpdated: "2025-12-15",
      },
      {
        title: `QA Runbook: ${project} Release Checklist`,
        space: "QA",
        excerpt: `Standard release checklist for ${project}. Includes regression suite areas, smoke test targets, and known flaky tests. Last 3 releases had issues with session timeout handling.`,
        url: "#",
        lastUpdated: "2026-01-10",
      },
      {
        title: `Post-Mortem: ${project}-87 Production Incident`,
        space: "Engineering",
        excerpt: "Race condition in concurrent session handling caused data corruption for 12 users. Root cause: missing database-level locking on user profile updates. Resolution: added row-level locks and retry logic.",
        url: "#",
        lastUpdated: "2025-11-22",
      },
    ],
    historicalPatterns: [
      "Auth-related changes have historically caused session timeout regressions (3 incidents in 6 months)",
      "Database migration changes require additional soak testing — previous release had a slow query issue caught only after 24h",
      `The ${project} module has a known flaky test in the payment webhook handler — intermittent timeout failures`,
      "Cross-service API changes need contract testing — last missed contract change caused a 2-hour outage",
    ],
  };
}

function derivePatterns(pages: { title: string; excerpt: string }[]): string[] {
  const patterns: string[] = [];
  const text = pages.map(p => `${p.title} ${p.excerpt}`).join(" ").toLowerCase();

  if (text.includes("incident") || text.includes("post-mortem")) {
    patterns.push("Historical incidents found — review post-mortems for regression risk areas");
  }
  if (text.includes("flaky") || text.includes("intermittent")) {
    patterns.push("Flaky tests documented — validate test stability before relying on automated results");
  }
  if (text.includes("migration") || text.includes("schema")) {
    patterns.push("Database changes detected in related docs — ensure backward compatibility and rollback plan");
  }
  if (text.includes("performance") || text.includes("slow")) {
    patterns.push("Performance concerns noted — include load/stress testing in session");
  }

  return patterns;
}
