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
