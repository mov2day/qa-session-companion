export interface TestArea {
  area: string;
  scenario: string;
  risk: "high" | "medium" | "low";
}

export interface TestMap {
  happy_paths: TestArea[];
  edge_cases: TestArea[];
  negative_flows: TestArea[];
  integration_risks: TestArea[];
  explicit_gaps: string[];
}

export interface Session {
  id: string;
  ticketId: string;
  ticketTitle: string | null;
  ticketDescription: string | null;
  contextJson: string | null;
  testMap: string | null;
  status: string;
  createdAt: number;
  completedAt: number | null;
  createdBy: string | null;
  visibility: string | null;
}

export interface SessionLogEntry {
  id: string;
  sessionId: string;
  timestamp: number;
  type: string;
  content: string;
  mappedArea: string | null;
  severity: string | null;
}

export interface SessionSummaryRow {
  id: string;
  sessionId: string;
  reportMarkdown: string;
  goNogo: string;
  riskLevel: string;
  coveragePct: number;
  generatedAt: number;
}

// ─── Integration Types ───

export interface IntegrationConfig {
  jira: {
    enabled: boolean;
    baseUrl?: string;
    email?: string;
    apiToken?: string;
    projects: string[];
  };
  github: {
    enabled: boolean;
    token?: string;
    repos: string[];
  };
  confluence: {
    enabled: boolean;
    baseUrl?: string;
    email?: string;
    apiToken?: string;
    spaceKeys: string[];
  };
}

export interface JiraContext {
  key: string;
  summary: string;
  description: string | null;
  status: string;
  priority: string;
  assignee: string | null;
  reporter: string | null;
  labels: string[];
  components: string[];
  acceptanceCriteria: string | null;
  linkedIssues: { key: string; summary: string; type: string }[];
}

export interface GithubPrContext {
  prNumber: number;
  title: string;
  body: string | null;
  state: string;
  author: string;
  filesChanged: {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }[];
  totalAdditions: number;
  totalDeletions: number;
  reviewComments: { author: string; body: string; path: string }[];
}

export interface ConfluenceContext {
  pages: {
    title: string;
    space: string;
    excerpt: string;
    url: string;
    lastUpdated: string;
  }[];
  historicalPatterns: string[];
}

export interface MergedContext {
  jira: JiraContext | null;
  github: GithubPrContext | null;
  confluence: ConfluenceContext | null;
  fetchedAt: number;
}

// ─── Dashboard Stats ───

export interface DashboardStats {
  totalSessions: number;
  completedSessions: number;
  avgCoverage: number;
  totalBugs: number;
  goCount: number;
  noGoCount: number;
  conditionalCount: number;
  coverageTrend: { date: string; coverage: number; sessions: number }[];
  bugsByCategory: { category: string; count: number }[];
  recentSessions: (Session & { summary?: SessionSummaryRow })[];
}
