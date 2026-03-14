# QA Session Companion

An AI-powered voice-native QA co-pilot that transforms how testers plan, execute, and communicate testing.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)

## Overview

QA Session Companion wraps a complete testing session end-to-end: from intelligent test planning using real ticket context, through a voice-driven interactive testing session, to an auto-generated stakeholder report.

### The Problem

| Pain Point | Impact | Frequency |
|---|---|---|
| Writing test plans takes too long | Skipped under sprint pressure | Daily |
| Bugs slip through untested edge cases | Production incidents, rework | Per sprint |
| Hard to communicate coverage to stakeholders | QA work is invisible | Per release |
| Exploratory testing is unstructured | Inconsistent coverage, no audit trail | Daily |

### The Solution

- **Automatic test map generation** from ticket context (Jira, GitHub, Confluence)
- **Voice-first interactive testing session** with real-time AI nudges and gap detection
- **Companion-narrated session summary** comparing planned vs actual testing coverage
- **Stakeholder report** auto-generated with go/no-go recommendation

## Features

### Stage 1: Plan
Enter a ticket ID and the companion builds a complete, risk-ranked test map:
- **Happy Paths** — Core acceptance criteria flows
- **Edge Cases** — Boundary conditions, limit values, unusual inputs
- **Negative Flows** — Error states, invalid inputs, permission boundaries
- **Integration Risks** — Cross-system touchpoints
- **Explicit Gaps** — Things the AI cannot determine from available context

### Stage 2: Test
Voice-first interactive testing session:
- Live coverage progress bar mapped against the test plan
- Auto-tagging of utterances to test plan areas
- Proactive nudge if idle or when high-risk areas are uncovered
- Bug log with severity, context, and test area linkage
- Voice + text mode — works with screen share during testing

### Stage 3: Report
Auto-generated "plan vs actual" debrief:
- **How I understood this ticket** — AI's interpretation of requirements
- **What the testing revealed** — Matches vs surprises, bugs found
- **My honest assessment** — Untested areas, residual risk, go/no-go recommendation

## Tech Stack

| Technology | Role |
|---|---|
| React + Vite | UI framework |
| Tailwind CSS + shadcn/ui | Styling & components |
| Zustand | State management |
| Web Speech API | Voice I/O (browser-native) |
| Node.js + Express | API server |
| SQLite (in-memory) | Session storage |
| Anthropic Claude API | AI engine (configurable) |

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Opens at http://localhost:5000
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Optional | Anthropic API key for Claude (uses smart mock responses without it) |
| `QA_COMPANION_PORT` | Optional | Server port (default: 5000) |

## Configuration

Integration credentials can be set via environment variables or config file:

```json
{
  "jira": {
    "baseUrl": "https://your-company.atlassian.net",
    "apiToken": "ATATT3...",
    "projects": ["PROJ", "BACKEND"]
  },
  "github": {
    "token": "ghp_...",
    "repos": ["org/repo-name"]
  },
  "confluence": {
    "spaceKeys": ["ENG", "QA"]
  },
  "anthropic": {
    "apiKey": "sk-ant-..."
  }
}
```

## Project Structure

```
qa-session-companion/
  client/
    src/
      components/       # UI components (Layout, shadcn/ui)
      hooks/            # Custom React hooks
      lib/              # Utilities, types, theme
      pages/            # Dashboard, Plan, Test, Report views
    index.html
  server/
    routes.ts           # API endpoints + AI logic
    storage.ts          # In-memory session storage
    index.ts            # Express server entry
  shared/
    schema.ts           # Data model (Drizzle ORM schemas)
  package.json
  tailwind.config.ts
  vite.config.ts
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions` | Create a new session |
| `GET` | `/api/sessions/:id` | Get session details |
| `PATCH` | `/api/sessions/:id` | Update session |
| `POST` | `/api/ai/test-map` | Generate test map for a session |
| `POST` | `/api/ai/nudge` | Get real-time nudge during testing |
| `POST` | `/api/ai/summary` | Generate session summary report |
| `GET` | `/api/sessions/:id/log` | Get session log entries |
| `POST` | `/api/sessions/:id/log` | Add a log entry |
| `GET` | `/api/sessions/:id/summary` | Get session summary |

## Roadmap

- [x] MVP: Test map generation, interactive session, summary report
- [ ] Jira integration (ticket fetch, context merge)
- [ ] GitHub integration (PR diff analysis)
- [ ] Confluence integration (historical patterns)
- [ ] Whisper API upgrade for voice accuracy
- [ ] Cloud session history + team sharing
- [ ] Manager dashboard with org-wide coverage trends

## License

MIT
