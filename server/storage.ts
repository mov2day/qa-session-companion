import {
  type Session, type InsertSession,
  type SessionLogEntry, type InsertSessionLog,
  type SessionSummaryRow, type InsertSessionSummary,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Sessions
  createSession(data: InsertSession): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  getAllSessions(): Promise<Session[]>;
  updateSession(id: string, data: Partial<Session>): Promise<Session | undefined>;

  // Session log
  addLogEntry(data: InsertSessionLog): Promise<SessionLogEntry>;
  getLogEntries(sessionId: string): Promise<SessionLogEntry[]>;

  // Session summary
  createSummary(data: InsertSessionSummary): Promise<SessionSummaryRow>;
  getSummary(sessionId: string): Promise<SessionSummaryRow | undefined>;
}

export class MemStorage implements IStorage {
  private sessions: Map<string, Session> = new Map();
  private logs: Map<string, SessionLogEntry> = new Map();
  private summaries: Map<string, SessionSummaryRow> = new Map();

  // ─── Sessions ───
  async createSession(data: InsertSession): Promise<Session> {
    const id = randomUUID();
    const session: Session = {
      id,
      ticketId: data.ticketId,
      ticketTitle: data.ticketTitle ?? null,
      ticketDescription: data.ticketDescription ?? null,
      contextJson: data.contextJson ?? null,
      testMap: data.testMap ?? null,
      status: data.status ?? "planning",
      createdAt: data.createdAt,
      completedAt: data.completedAt ?? null,
    };
    this.sessions.set(id, session);
    return session;
  }

  async getSession(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async getAllSessions(): Promise<Session[]> {
    return Array.from(this.sessions.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  async updateSession(id: string, data: Partial<Session>): Promise<Session | undefined> {
    const existing = this.sessions.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.sessions.set(id, updated);
    return updated;
  }

  // ─── Session Log ───
  async addLogEntry(data: InsertSessionLog): Promise<SessionLogEntry> {
    const id = randomUUID();
    const entry: SessionLogEntry = {
      id,
      sessionId: data.sessionId,
      timestamp: data.timestamp,
      type: data.type,
      content: data.content,
      mappedArea: data.mappedArea ?? null,
      severity: data.severity ?? null,
    };
    this.logs.set(id, entry);
    return entry;
  }

  async getLogEntries(sessionId: string): Promise<SessionLogEntry[]> {
    return Array.from(this.logs.values())
      .filter((l) => l.sessionId === sessionId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  // ─── Session Summary ───
  async createSummary(data: InsertSessionSummary): Promise<SessionSummaryRow> {
    const id = randomUUID();
    const summary: SessionSummaryRow = {
      id,
      sessionId: data.sessionId,
      reportMarkdown: data.reportMarkdown,
      goNogo: data.goNogo,
      riskLevel: data.riskLevel,
      coveragePct: data.coveragePct,
      generatedAt: data.generatedAt,
    };
    this.summaries.set(id, summary);
    return summary;
  }

  async getSummary(sessionId: string): Promise<SessionSummaryRow | undefined> {
    return Array.from(this.summaries.values()).find((s) => s.sessionId === sessionId);
  }
}

export const storage = new MemStorage();
