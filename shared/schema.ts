import { pgTable, text, varchar, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Test Map shape ───
export const testAreaSchema = z.object({
  area: z.string(),
  scenario: z.string(),
  risk: z.enum(["high", "medium", "low"]),
});
export type TestArea = z.infer<typeof testAreaSchema>;

export const testMapSchema = z.object({
  happy_paths: z.array(testAreaSchema),
  edge_cases: z.array(testAreaSchema),
  negative_flows: z.array(testAreaSchema),
  integration_risks: z.array(testAreaSchema),
  explicit_gaps: z.array(z.string()),
});
export type TestMap = z.infer<typeof testMapSchema>;

// ─── Sessions ───
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  ticketTitle: text("ticket_title"),
  ticketDescription: text("ticket_description"),
  contextJson: text("context_json"), // JSON blob: Jira, GitHub, Confluence merged context
  testMap: text("test_map"),
  status: text("status").notNull().default("planning"),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
  // Team sharing
  createdBy: text("created_by").default("default"),
  visibility: text("visibility").default("team"), // "private" | "team"
});

export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// ─── Session Log ───
export const sessionLog = pgTable("session_log", {
  id: varchar("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  timestamp: integer("timestamp").notNull(),
  type: text("type").notNull(), // utterance | bug | skip | nudge | note
  content: text("content").notNull(),
  mappedArea: text("mapped_area"),
  severity: text("severity"), // critical | major | minor (for bugs)
});

export const insertSessionLogSchema = createInsertSchema(sessionLog).omit({ id: true });
export type InsertSessionLog = z.infer<typeof insertSessionLogSchema>;
export type SessionLogEntry = typeof sessionLog.$inferSelect;

// ─── Session Summary ───
export const sessionSummary = pgTable("session_summary", {
  id: varchar("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  reportMarkdown: text("report_markdown").notNull(),
  goNogo: text("go_nogo").notNull(), // go | no-go | conditional
  riskLevel: text("risk_level").notNull(), // low | medium | high
  coveragePct: integer("coverage_pct").notNull(),
  generatedAt: integer("generated_at").notNull(),
});

export const insertSessionSummarySchema = createInsertSchema(sessionSummary).omit({ id: true });
export type InsertSessionSummary = z.infer<typeof insertSessionSummarySchema>;
export type SessionSummaryRow = typeof sessionSummary.$inferSelect;

// ─── Integration Config ───
export const integrationConfigSchema = z.object({
  jira: z.object({
    enabled: z.boolean().default(false),
    baseUrl: z.string().optional(),
    email: z.string().optional(),
    apiToken: z.string().optional(),
    projects: z.array(z.string()).default([]),
  }).default({}),
  github: z.object({
    enabled: z.boolean().default(false),
    token: z.string().optional(),
    repos: z.array(z.string()).default([]),
  }).default({}),
  confluence: z.object({
    enabled: z.boolean().default(false),
    baseUrl: z.string().optional(),
    email: z.string().optional(),
    apiToken: z.string().optional(),
    spaceKeys: z.array(z.string()).default([]),
  }).default({}),
});
export type IntegrationConfig = z.infer<typeof integrationConfigSchema>;

// ─── Jira Ticket Context ───
export const jiraContextSchema = z.object({
  key: z.string(),
  summary: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  assignee: z.string().nullable(),
  reporter: z.string().nullable(),
  labels: z.array(z.string()),
  components: z.array(z.string()),
  acceptanceCriteria: z.string().nullable(),
  linkedIssues: z.array(z.object({
    key: z.string(),
    summary: z.string(),
    type: z.string(), // "blocks" | "is blocked by" | "relates to"
  })),
});
export type JiraContext = z.infer<typeof jiraContextSchema>;

// ─── GitHub PR Context ───
export const githubPrContextSchema = z.object({
  prNumber: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  author: z.string(),
  filesChanged: z.array(z.object({
    filename: z.string(),
    status: z.string(), // "added" | "modified" | "deleted"
    additions: z.number(),
    deletions: z.number(),
    patch: z.string().optional(),
  })),
  totalAdditions: z.number(),
  totalDeletions: z.number(),
  reviewComments: z.array(z.object({
    author: z.string(),
    body: z.string(),
    path: z.string(),
  })),
});
export type GithubPrContext = z.infer<typeof githubPrContextSchema>;

// ─── Confluence Context ───
export const confluenceContextSchema = z.object({
  pages: z.array(z.object({
    title: z.string(),
    space: z.string(),
    excerpt: z.string(),
    url: z.string(),
    lastUpdated: z.string(),
  })),
  historicalPatterns: z.array(z.string()), // Derived insights from docs
});
export type ConfluenceContext = z.infer<typeof confluenceContextSchema>;

// ─── Merged Context (stored in session.contextJson) ───
export const mergedContextSchema = z.object({
  jira: jiraContextSchema.nullable().default(null),
  github: githubPrContextSchema.nullable().default(null),
  confluence: confluenceContextSchema.nullable().default(null),
  fetchedAt: z.number(),
});
export type MergedContext = z.infer<typeof mergedContextSchema>;

// ─── Dashboard Aggregates (computed, not stored) ───
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
