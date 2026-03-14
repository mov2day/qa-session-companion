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
  contextJson: text("context_json"),
  testMap: text("test_map"),
  status: text("status").notNull().default("planning"),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
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
