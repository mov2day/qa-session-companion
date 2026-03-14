import {
  type Session, type InsertSession,
  type SessionLogEntry, type InsertSessionLog,
  type SessionSummaryRow, type InsertSessionSummary,
  type IntegrationConfig,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

export interface IStorage {
  // Sessions
  createSession(data: InsertSession): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  getAllSessions(): Promise<Session[]>;
  updateSession(id: string, data: Partial<Session>): Promise<Session | undefined>;
  deleteSession(id: string): Promise<boolean>;

  // Session log
  addLogEntry(data: InsertSessionLog): Promise<SessionLogEntry>;
  getLogEntries(sessionId: string): Promise<SessionLogEntry[]>;

  // Session summary
  createSummary(data: InsertSessionSummary): Promise<SessionSummaryRow>;
  getSummary(sessionId: string): Promise<SessionSummaryRow | undefined>;
  getAllSummaries(): Promise<SessionSummaryRow[]>;

  // Integration config (singleton)
  getIntegrationConfig(): Promise<IntegrationConfig>;
  saveIntegrationConfig(config: IntegrationConfig): Promise<IntegrationConfig>;
}

// ─── File-backed persistent storage ───
// Uses JSON files for simplicity and zero native dependencies

const DATA_DIR = join(process.cwd(), ".qa-data");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson<T>(filename: string, fallback: T): T {
  const filepath = join(DATA_DIR, filename);
  if (!existsSync(filepath)) return fallback;
  try {
    return JSON.parse(readFileSync(filepath, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(filename: string, data: unknown) {
  ensureDataDir();
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

const DEFAULT_CONFIG: IntegrationConfig = {
  jira: { enabled: false, projects: [] },
  github: { enabled: false, repos: [] },
  confluence: { enabled: false, spaceKeys: [] },
};

export class PersistentStorage implements IStorage {
  private sessions: Map<string, Session>;
  private logs: Map<string, SessionLogEntry>;
  private summaries: Map<string, SessionSummaryRow>;
  private config: IntegrationConfig;

  constructor() {
    ensureDataDir();
    const sessionsArr: Session[] = readJson("sessions.json", []);
    const logsArr: SessionLogEntry[] = readJson("logs.json", []);
    const summariesArr: SessionSummaryRow[] = readJson("summaries.json", []);

    this.sessions = new Map(sessionsArr.map(s => [s.id, s]));
    this.logs = new Map(logsArr.map(l => [l.id, l]));
    this.summaries = new Map(summariesArr.map(s => [s.id, s]));
    this.config = readJson("config.json", DEFAULT_CONFIG);
  }

  private persistSessions() {
    writeJson("sessions.json", Array.from(this.sessions.values()));
  }
  private persistLogs() {
    writeJson("logs.json", Array.from(this.logs.values()));
  }
  private persistSummaries() {
    writeJson("summaries.json", Array.from(this.summaries.values()));
  }

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
      createdBy: data.createdBy ?? "default",
      visibility: data.visibility ?? "team",
    };
    this.sessions.set(id, session);
    this.persistSessions();
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
    this.persistSessions();
    return updated;
  }

  async deleteSession(id: string): Promise<boolean> {
    const existed = this.sessions.delete(id);
    if (existed) {
      // Also delete related logs and summaries
      for (const [logId, log] of this.logs) {
        if (log.sessionId === id) this.logs.delete(logId);
      }
      for (const [sumId, sum] of this.summaries) {
        if (sum.sessionId === id) this.summaries.delete(sumId);
      }
      this.persistSessions();
      this.persistLogs();
      this.persistSummaries();
    }
    return existed;
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
    this.persistLogs();
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
    this.persistSummaries();
    return summary;
  }

  async getSummary(sessionId: string): Promise<SessionSummaryRow | undefined> {
    return Array.from(this.summaries.values()).find((s) => s.sessionId === sessionId);
  }

  async getAllSummaries(): Promise<SessionSummaryRow[]> {
    return Array.from(this.summaries.values());
  }

  // ─── Integration Config ───
  async getIntegrationConfig(): Promise<IntegrationConfig> {
    return this.config;
  }

  async saveIntegrationConfig(config: IntegrationConfig): Promise<IntegrationConfig> {
    this.config = config;
    writeJson("config.json", config);
    return config;
  }
}

export const storage = new PersistentStorage();
