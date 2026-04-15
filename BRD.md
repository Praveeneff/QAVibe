# Business Requirements Document (BRD)
## QAVibe — AI-Powered QA Management Platform

**Document Version:** 1.0  
**Date:** 2026-04-12  
**Author:** Praveen Kumar  
**Status:** Draft

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Context & Problem Statement](#2-business-context--problem-statement)
3. [Goals & Objectives](#3-goals--objectives)
4. [Stakeholders](#4-stakeholders)
5. [Scope](#5-scope)
6. [Functional Requirements](#6-functional-requirements)
   - 6.1 User Authentication & Access Control
   - 6.2 Test Case Management
   - 6.3 Test Suites
   - 6.4 Test Execution & Runs
   - 6.5 AI-Powered Test Generation
   - 6.6 BRD & Codebase-Driven Generation
   - 6.7 Duplicate Detection
   - 6.8 Analytics & Reporting
   - 6.9 AI Provider Observability
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [System Architecture Overview](#8-system-architecture-overview)
9. [Data Model Summary](#9-data-model-summary)
10. [User Roles & Permissions](#10-user-roles--permissions)
11. [Integration Requirements](#11-integration-requirements)
12. [UI/UX Requirements](#12-uiux-requirements)
13. [Constraints & Assumptions](#13-constraints--assumptions)
14. [Open Issues & Future Enhancements](#14-open-issues--future-enhancements)
15. [Glossary](#15-glossary)

---

## 1. Executive Summary

QAVibe is an AI-powered Quality Assurance (QA) management platform designed to streamline the creation, organization, execution, and analysis of software test cases. The platform integrates multiple AI providers (Groq, Gemini, OpenAI, Claude, OpenRouter) to automatically generate test cases from plain-text requirements, Business Requirements Documents (BRDs), or source code repositories. It provides full test lifecycle management — from test case authoring through execution, result tracking, and performance analytics.

QAVibe targets software QA teams, developers, and project managers who need a unified, intelligent platform to reduce manual test authoring effort, improve test coverage, and gain visibility into software quality trends over time.

---

## 2. Business Context & Problem Statement

### 2.1 Current Challenges

Modern software development teams face several persistent QA challenges:

1. **Manual test case creation is slow and error-prone.** Writing detailed test cases from requirements documents is time-intensive and subject to human oversight gaps.
2. **Test coverage is inconsistent.** Without intelligent tooling, testers often write tests for areas they know well and skip edge cases.
3. **Duplicate test cases accumulate over time.** Large test suites become bloated with redundant cases, reducing execution efficiency.
4. **No centralized execution tracking.** Teams use spreadsheets or disconnected tools to track which tests passed/failed in a given build.
5. **Quality trend visibility is limited.** Teams lack a consolidated view of pass rates, flaky tests, and regression patterns across environments and build versions.
6. **Document-to-test conversion is manual.** Translating a BRD or codebase into test cases requires significant effort from experienced QA engineers.

### 2.2 Opportunity

AI language models (LLMs) have reached a capability level where they can reliably generate structured, actionable test cases from unstructured inputs. QAVibe leverages this capability through an intelligent fallback chain across multiple free and paid AI providers, making AI-assisted test generation accessible to teams of any size and budget.

---

## 3. Goals & Objectives

| # | Goal | Measurable Objective |
|---|------|---------------------|
| G1 | Reduce time to create test cases | AI generation produces a complete test case set in < 30 seconds from a requirement |
| G2 | Improve test coverage | Dynamic AI context prevents duplicate areas; coverage gaps are surfaced automatically |
| G3 | Centralize test execution | All test runs, results, and environments tracked in one platform |
| G4 | Surface quality trends | Dashboard shows pass rate trends, flaky tests, and environment breakdowns |
| G5 | Eliminate duplicate test cases | Automated Jaccard similarity detection identifies overlapping cases before they accumulate |
| G6 | Support BRD/codebase-driven testing | QA can upload a BRD or link a GitHub repo to auto-generate a full test suite |
| G7 | Maximize AI availability | Intelligent fallback chain ensures generation works even when individual providers are rate-limited |
| G8 | Provide full audit trail | Every change to a test case is versioned and restorable |

---

## 4. Stakeholders

| Role | Responsibilities | Interests |
|------|-----------------|-----------|
| **QA Engineer (Tester)** | Creates, executes, and maintains test cases | Fast authoring, accurate generation, clear execution UI |
| **QA Lead / Admin** | Manages test suites, reviews analytics, manages users | Coverage visibility, team productivity metrics, AI cost control |
| **Developer** | May consume test cases for writing automated tests | Clear steps, expected results, category/priority metadata |
| **Project Manager** | Reviews quality dashboards | Pass rate trends, release readiness indicators |
| **DevOps / Release Manager** | Tracks builds across environments | Per-build, per-environment execution reports |
| **Platform Admin** | Configures AI provider keys, manages users | System health, provider observability, fallback logs |

---

## 5. Scope

### 5.1 In Scope

- User registration, authentication, and role management (admin / tester)
- Full CRUD for test cases with rich metadata (category, priority, severity, execution type)
- Test suite organization (grouping test cases by feature/module)
- Test run creation, execution (result entry), and completion
- AI test case generation from:
  - Plain-text requirements
  - Business Requirements Documents (PDF, DOCX, TXT)
  - GitHub repositories or ZIP-archived codebases
- Intelligent multi-provider AI fallback chain (Groq, Gemini, OpenAI, Claude, OpenRouter)
- CSV import (TestRail-compatible) and export
- Test case version history with restore capability
- Duplicate detection using Jaccard similarity scoring
- Analytics dashboard: pass rates, flaky tests, environment trends
- AI provider observability: latency, token usage, fallback rates
- Test rerun (failed/blocked cases only)

### 5.2 Out of Scope (Current Version)

- Automated test execution (CI/CD integration, Selenium/Playwright runner)
- Integration with third-party issue trackers (Jira, Linear, GitHub Issues)
- Real-time collaboration (multi-user live editing)
- Native mobile application
- Email/Slack notifications
- Fully enforced role-based access (admin-only endpoints)
- Self-hosted AI model support (Ollama, LM Studio)

---

## 6. Functional Requirements

### 6.1 User Authentication & Access Control

| ID | Requirement | Priority |
|----|------------|----------|
| FR-AUTH-01 | The system shall allow new users to register with name, email, and password | Must Have |
| FR-AUTH-02 | The system shall hash passwords using bcrypt (minimum 12 rounds) before storage | Must Have |
| FR-AUTH-03 | The system shall issue a signed JWT upon successful login | Must Have |
| FR-AUTH-04 | The first registered user shall automatically receive the "admin" role; all subsequent users shall receive the "tester" role | Must Have |
| FR-AUTH-05 | The system shall expose a `/auth/me` endpoint to retrieve the current authenticated user's profile | Must Have |
| FR-AUTH-06 | The frontend shall store the JWT in localStorage under the key `qavibe_token` and include it in all API requests | Must Have |
| FR-AUTH-07 | The frontend shall redirect unauthenticated users to `/login` when a 401 response is received | Must Have |
| FR-AUTH-08 | The system shall support role-based route guards (`admin` / `tester`) for future enforcement | Should Have |

---

### 6.2 Test Case Management

| ID | Requirement | Priority |
|----|------------|----------|
| FR-TC-01 | The system shall allow authenticated users to create test cases with: title (required), description, category, execution type, priority, severity, steps (ordered list), expected result, status, and suite assignment | Must Have |
| FR-TC-02 | Test case category shall support: functional, e2e, integration, smoke, sanity, regression | Must Have |
| FR-TC-03 | Test case execution type shall support: manual, automated, exploratory | Must Have |
| FR-TC-04 | Test case priority shall support: P1, P2, P3, P4 | Must Have |
| FR-TC-05 | Test case severity shall support: critical, high, medium, low | Must Have |
| FR-TC-06 | Test case status shall support: active, inactive, draft | Must Have |
| FR-TC-07 | The system shall support listing test cases with filtering by: suiteId, search (title + description), category, severity, priority, status | Must Have |
| FR-TC-08 | The system shall support pagination on the test case list (page, limit) | Must Have |
| FR-TC-09 | The system shall allow authenticated users to update any field of a test case | Must Have |
| FR-TC-10 | Every update to a test case shall create a versioned snapshot (history entry) recording: who changed it, when, and the full previous state | Must Have |
| FR-TC-11 | The system shall allow authenticated users to delete a test case | Must Have |
| FR-TC-12 | The system shall allow exporting all (or filtered) test cases as a CSV file | Must Have |
| FR-TC-13 | The system shall allow importing test cases from CSV, with auto-detection of TestRail format (identified by a "section" header column) | Must Have |
| FR-TC-14 | During CSV import, if a referenced suite does not exist, it shall be created automatically | Should Have |
| FR-TC-15 | The system shall allow viewing the full version history of a test case | Must Have |
| FR-TC-16 | The system shall allow restoring a test case to any previous version, recording the restore as a new history entry with changeType "restore" | Must Have |

---

### 6.3 Test Suites

| ID | Requirement | Priority |
|----|------------|----------|
| FR-TS-01 | The system shall allow authenticated users to create test suites with name and description | Must Have |
| FR-TS-02 | The system shall list all test suites with a count of associated test cases | Must Have |
| FR-TS-03 | The system shall allow updating suite metadata (name, description) | Must Have |
| FR-TS-04 | The system shall allow deleting a suite; test cases within the suite shall remain but become unassigned | Must Have |
| FR-TS-05 | The system shall allow assigning an existing test case to a suite | Must Have |
| FR-TS-06 | The system shall allow removing a test case from its suite (without deleting the test case) | Must Have |

---

### 6.4 Test Execution & Runs

| ID | Requirement | Priority |
|----|------------|----------|
| FR-RUN-01 | The system shall allow authenticated users to create a test run by selecting: name, test case IDs, environment (staging/production/dev/qa), and optionally browser, build version, and device | Must Have |
| FR-RUN-02 | All selected test cases in a new run shall default to "pending" result status | Must Have |
| FR-RUN-03 | Test result status shall support: pending, pass, fail, blocked, skip | Must Have |
| FR-RUN-04 | The system shall allow updating individual test results within a run (status + optional notes) | Must Have |
| FR-RUN-05 | The system shall allow marking a test run as "done" | Must Have |
| FR-RUN-06 | The system shall calculate and display a pass rate for each test run: (pass count / total) × 100 | Must Have |
| FR-RUN-07 | The system shall provide a rerun feature that creates a new run containing only failed and blocked test cases from a completed run | Must Have |
| FR-RUN-08 | Reruns shall be linked to their source run via a `sourceRunId` field | Should Have |
| FR-RUN-09 | The system shall list all test runs with their summary (pass rate, result counts by status) | Must Have |
| FR-RUN-10 | The system shall support filtering test run statistics and trends by environment | Should Have |

---

### 6.5 AI-Powered Test Generation

| ID | Requirement | Priority |
|----|------------|----------|
| FR-AI-01 | The system shall generate test cases from plain-text requirements via a REST endpoint | Must Have |
| FR-AI-02 | Each generated test case shall include: title, description, steps (array), expected result, category, execution type, priority, severity | Must Have |
| FR-AI-03 | The system shall support an intelligent fallback chain: Groq → Gemini (primary/2.0/lite) → OpenRouter free models | Must Have |
| FR-AI-04 | The fallback chain shall mark a provider as "on cooldown" for 5 minutes after a failure, preventing repeated failed calls | Must Have |
| FR-AI-05 | Each provider call shall time out after 10 seconds to prevent hanging | Must Have |
| FR-AI-06 | The system shall classify provider errors: 401 (auth failure → skip), 429 (rate limit → skip), 503 (unavailable → skip) | Must Have |
| FR-AI-07 | The system shall build a dynamic generation context from existing test cases: category distribution, priority distribution, recent titles, covered areas — to guide the AI toward uncovered areas | Must Have |
| FR-AI-08 | The system shall return HTTP 503 with a `retryAfter` field when all providers are exhausted | Must Have |
| FR-AI-09 | The system shall allow users to specify a preferred provider, model, or supply their own API key for a single generation request | Should Have |
| FR-AI-10 | The system shall support OpenAI (gpt-4o), Anthropic Claude (claude-sonnet-4-0), and OpenRouter as additional/optional providers | Should Have |
| FR-AI-11 | All AI generation attempts shall be logged (provider, latency, token count, case count, fallback chain info) | Must Have |

---

### 6.6 BRD & Codebase-Driven Generation

| ID | Requirement | Priority |
|----|------------|----------|
| FR-BRD-01 | The system shall accept BRD documents in PDF, DOCX, and TXT formats for test case generation | Must Have |
| FR-BRD-02 | Uploaded BRDs shall be parsed to extract plain text, which is then passed to the AI generation pipeline | Must Have |
| FR-BRD-03 | Generated test cases from a BRD shall be automatically saved to the database under an optionally specified suite | Must Have |
| FR-BRD-04 | The system shall accept a GitHub repository URL and extract source files for test case generation | Must Have |
| FR-BRD-05 | The system shall accept a ZIP-archived codebase for test case generation | Must Have |
| FR-BRD-06 | Source extraction shall prioritize files from: src/, app/, lib/, controllers/, services/ directories | Should Have |
| FR-BRD-07 | GitHub extraction shall be limited to 60 files; ZIP extraction to 10 files, prioritized by directory type | Should Have |
| FR-BRD-08 | Generated test cases from codebases shall use a codebase-specific system prompt focused on functional coverage of source code paths | Must Have |

---

### 6.7 Duplicate Detection

| ID | Requirement | Priority |
|----|------------|----------|
| FR-DUP-01 | The system shall compute a Jaccard similarity score between a candidate test case (title + steps) and all existing test cases in the same suite | Must Have |
| FR-DUP-02 | Test cases with similarity ≥ 40% shall be flagged as potential duplicates | Must Have |
| FR-DUP-03 | Test cases with similarity ≥ 65% shall be flagged as "high" confidence duplicates | Must Have |
| FR-DUP-04 | The duplicate scan endpoint shall accept a batch of test cases and return scored matches against the existing suite | Must Have |
| FR-DUP-05 | The frontend shall surface duplicate warnings during or after AI generation before saving test cases | Should Have |

---

### 6.8 Analytics & Reporting

| ID | Requirement | Priority |
|----|------------|----------|
| FR-ANA-01 | The dashboard shall display: average pass rate, total test runs, flaky test count | Must Have |
| FR-ANA-02 | The system shall identify "flaky" tests as those with both pass and fail results across runs, ranked by fail count (top 5) | Must Have |
| FR-ANA-03 | The dashboard shall display a trend chart of pass rates for the last 10 completed test runs | Must Have |
| FR-ANA-04 | All dashboard stats and trends shall be filterable by environment | Must Have |
| FR-ANA-05 | The test runs list shall display per-run summaries: total cases, pass/fail/blocked/skip/pending counts, pass rate percentage | Must Have |

---

### 6.9 AI Provider Observability

| ID | Requirement | Priority |
|----|------------|----------|
| FR-OBS-01 | The system shall maintain an AI generation log recording: provider, model, prompt tokens, latency (ms), cases generated, fallback source, timestamp | Must Have |
| FR-OBS-02 | The admin AI logs page shall display: total generations, average latency, fallback rate, provider breakdown with failure counts | Must Have |
| FR-OBS-03 | The system shall display a trend of the last 30 AI generation calls with latency per call | Should Have |
| FR-OBS-04 | The system shall display the 20 most recent AI generation events with relative timestamps | Should Have |

---

## 7. Non-Functional Requirements

### 7.1 Performance

| ID | Requirement |
|----|------------|
| NFR-PERF-01 | AI test case generation (single provider, no fallback) shall complete within 30 seconds under normal conditions |
| NFR-PERF-02 | Test case list pages (up to 50 results) shall load within 2 seconds |
| NFR-PERF-03 | Test run result updates shall persist within 1 second |
| NFR-PERF-04 | Each AI provider call shall time out after 10 seconds to prevent cascading delays in the fallback chain |

### 7.2 Security

| ID | Requirement |
|----|------------|
| NFR-SEC-01 | All passwords shall be hashed with bcrypt (minimum 12 rounds) — plaintext passwords must never be stored |
| NFR-SEC-02 | All write/modify API endpoints shall require a valid JWT |
| NFR-SEC-03 | JWT secret shall be configurable via environment variable and must not be hardcoded |
| NFR-SEC-04 | User-supplied API keys shall not be logged or persisted; they are used only for the current request |
| NFR-SEC-05 | File uploads (BRD, ZIP) shall be processed in memory and not persisted to disk |

### 7.3 Reliability

| ID | Requirement |
|----|------------|
| NFR-REL-01 | The AI fallback chain shall transparently retry across providers; a single provider failure shall not surface as an error to the user |
| NFR-REL-02 | AI generation log writes shall be fire-and-forget; a logging failure shall not interrupt test case generation |
| NFR-REL-03 | Test result updates shall be atomic; partial updates shall not corrupt run state |

### 7.4 Maintainability

| ID | Requirement |
|----|------------|
| NFR-MNT-01 | The backend shall follow NestJS modular architecture with one module per feature domain |
| NFR-MNT-02 | AI providers shall be implemented as injectable services behind a common interface, allowing new providers to be added without modifying the core AI service |
| NFR-MNT-03 | Database schema changes shall be managed through Prisma migrations |
| NFR-MNT-04 | The monorepo shall share TypeScript types via a `packages/shared-types` workspace package |

### 7.5 Portability

| ID | Requirement |
|----|------------|
| NFR-PORT-01 | The application shall run on any environment with Node.js 18+ (Windows, macOS, Linux) |
| NFR-PORT-02 | The database shall use SQLite for development; the schema shall be designed for future migration to PostgreSQL |
| NFR-PORT-03 | All configuration (ports, API keys, database path) shall be managed via environment variables |

---

## 8. System Architecture Overview

```
┌───────────────────────────────────────────────────────────────┐
│                        Client Browser                         │
│                   Next.js 14 (App Router)                     │
│  Pages: /dashboard, /test-cases, /runs, /admin, /login, etc.  │
└──────────────────────────┬────────────────────────────────────┘
                           │ HTTP/REST (JWT Bearer)
                           │ http://localhost:3001
┌──────────────────────────▼────────────────────────────────────┐
│                   NestJS REST API (Port 3001)                  │
│                                                               │
│  ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌───────────────┐  │
│  │   Auth    │ │ TestCase  │ │ TestRuns │ │  TestSuites   │  │
│  │  Module   │ │  Module   │ │  Module  │ │    Module     │  │
│  └───────────┘ └───────────┘ └──────────┘ └───────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐    │
│  │                     AI Module                         │    │
│  │  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌────────────┐  │    │
│  │  │  Groq   │ │  Gemini  │ │OpenAI  │ │   Claude   │  │    │
│  │  │(primary)│ │(fallback)│ │(opt.)  │ │   (opt.)   │  │    │
│  │  └─────────┘ └──────────┘ └────────┘ └────────────┘  │    │
│  │  ┌─────────────────────────────────────────────────┐  │    │
│  │  │          OpenRouter (free models fallback)      │  │    │
│  │  └─────────────────────────────────────────────────┘  │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                  Prisma ORM                            │   │
│  └────────────────────────────┬───────────────────────────┘   │
└───────────────────────────────┼───────────────────────────────┘
                                │
               ┌────────────────▼───────────────┐
               │        SQLite Database          │
               │  (dev.db — Prisma-managed)      │
               └────────────────────────────────┘
```

**Technology Stack:**

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | Next.js (App Router) | 15.x |
| Frontend Language | TypeScript | 5.4 |
| UI Styling | Inline CSS + Tailwind | — |
| Backend Framework | NestJS | 10.x |
| Backend Language | TypeScript | 5.4 |
| ORM | Prisma | 5.x |
| Database | SQLite (dev) | — |
| Authentication | Passport.js + JWT | — |
| Package Manager | pnpm (monorepo) | — |
| AI SDKs | groq-sdk, @google/generative-ai, openai, @anthropic-ai/sdk | latest |

---

## 9. Data Model Summary

### Core Entities

```
User
├── id (cuid, PK)
├── email (unique)
├── passwordHash
├── name
├── role: "admin" | "tester"
└── createdAt, updatedAt

TestSuite
├── id (uuid, PK)
├── name, description
├── createdBy → User
└── createdAt

TestCase
├── id (uuid, PK)
├── title, description
├── category: functional | e2e | integration | smoke | sanity | regression
├── executionType: manual | automated | exploratory
├── priority: P1 | P2 | P3 | P4
├── severity: critical | high | medium | low
├── steps: string[] (serialized as JSON string)
├── expectedResult
├── status: active | inactive | draft
├── suiteId → TestSuite (optional)
├── createdBy → User
└── createdAt, updatedAt

TestRun
├── id (cuid, PK)
├── name
├── status: pending | done
├── environment: staging | production | dev | qa
├── browser: chrome | firefox | safari | edge (optional)
├── buildVersion (optional)
├── device: desktop | mobile | tablet (optional)
├── sourceRunId (for reruns, optional)
├── createdBy → User
└── createdAt, updatedAt

TestResult
├── id (cuid, PK)
├── testCaseId → TestCase
├── testRunId → TestRun
├── status: pending | pass | fail | blocked | skip
├── notes (optional)
└── createdAt, updatedAt

TestCaseHistory
├── id (cuid, PK)
├── testCaseId → TestCase
├── snapshot (full TestCase JSON)
├── changedBy → User
├── changeType: manual | ai | restore
├── version (incremental per testCase)
└── changedAt

AiGenerationLog
├── id (cuid, PK)
├── provider
├── promptTokens (nullable)
├── latencyMs
├── caseCount
├── fallbackFrom (nullable)
└── createdAt
```

---

## 10. User Roles & Permissions

| Feature | Tester | Admin |
|---------|--------|-------|
| Register / Login | ✅ | ✅ |
| View test cases | ✅ | ✅ |
| Create test cases (manual) | ✅ | ✅ |
| Edit / Delete test cases | ✅ | ✅ |
| AI generate test cases | ✅ | ✅ |
| Import / Export CSV | ✅ | ✅ |
| View test case history | ✅ | ✅ |
| Restore test case version | ✅ | ✅ |
| Create / manage test suites | ✅ | ✅ |
| Create test runs | ✅ | ✅ |
| Update test results | ✅ | ✅ |
| View dashboard / analytics | ✅ | ✅ |
| View AI logs | ✅ | ✅ |
| Manage users | ❌ | ✅ (future) |
| Configure AI providers | ❌ | ✅ (via env) |
| Access admin-only routes | ❌ | ✅ |

> Note: Role-based guards are scaffolded but not fully enforced on all endpoints in the current version.

---

## 11. Integration Requirements

### 11.1 AI Provider Integrations

| Provider | SDK | Auth | Default Model | Notes |
|---------|-----|------|---------------|-------|
| Groq | `groq-sdk` | `GROQ_API_KEY` | llama-3.3-70b-versatile | Primary provider (free, high rate limits) |
| Google Gemini | `@google/generative-ai` | `AI_GEMINI_API_KEY` | gemini-2.5-flash | Primary fallback; multiple model quota buckets |
| OpenAI | `openai` | `AI_OPENAI_API_KEY` | gpt-4o | Optional; uses JSON mode |
| Anthropic Claude | `@anthropic-ai/sdk` | `AI_CLAUDE_API_KEY` | claude-sonnet-4-0 | Optional; internal retry logic |
| OpenRouter | `openai` (compat.) | `AI_OPENROUTER_API_KEY` | llama-3.2-3b-instruct:free | Free model fallback pool |

### 11.2 Document Parsing

| Format | Library | Notes |
|--------|---------|-------|
| PDF | `pdf-parse` | Text extraction only |
| DOCX | `mammoth` | Word document text extraction |
| TXT | Native Node.js | Raw text read |
| ZIP (codebase) | `adm-zip` | Extracts and filters source files |
| GitHub Repo | GitHub raw content API | Fetches repository file tree + contents |

### 11.3 CSV Compatibility

- **Export:** All test cases as CSV with pipe-separated steps
- **Import:** Generic CSV format and TestRail export format (auto-detected by "Section" column header)

---

## 12. UI/UX Requirements

| ID | Requirement |
|----|------------|
| UX-01 | The application shall use a dark theme (#111 background, #eee text) throughout |
| UX-02 | All data tables shall support column sorting and field-level filtering |
| UX-03 | The test case list shall support pagination with configurable page size |
| UX-04 | The AI generation panel shall display provider status and allow provider/model selection |
| UX-05 | Pass rate shall be visually indicated (color-coded: green ≥ 80%, yellow 50–79%, red < 50%) |
| UX-06 | Test run dashboards shall include SVG trend charts (no external charting library required) |
| UX-07 | Version history shall be presented in a side panel with diff-viewable snapshots |
| UX-08 | Duplicate detection results shall be shown before committing AI-generated cases to the database |
| UX-09 | Navigation shall be persistent across all authenticated pages |
| UX-10 | The application shall be usable on desktop browsers (Chrome, Firefox, Safari, Edge) |

---

## 13. Constraints & Assumptions

### Constraints

1. **SQLite for development** — Steps arrays must be serialized as JSON strings due to SQLite's lack of native JSON column support in Prisma.
2. **No real-time sync** — The application uses standard request/response; there is no WebSocket layer.
3. **Single-instance deployment** — The current architecture targets a single backend instance (no horizontal scaling consideration).
4. **AI token limits** — Generation is bounded by provider token limits; very large BRDs or codebases may be truncated.
5. **File size limits** — NestJS default body size limits apply to document and ZIP uploads.

### Assumptions

1. At least one AI provider API key will be configured in the environment for AI features to function.
2. Users have a modern browser (ES2020+ support).
3. The backend and frontend run on the same host during development (localhost).
4. GitHub repository URLs are publicly accessible (no private repo support in current version).
5. The platform is deployed for internal team use; public-facing deployment security hardening is out of scope.

---

## 14. Open Issues & Future Enhancements

| ID | Item | Priority |
|----|------|----------|
| OI-01 | Enforce role-based access control on admin-only endpoints | High |
| OI-02 | Add user management UI (admin: list/invite/deactivate users) | High |
| OI-03 | CI/CD integration: webhook to auto-create test runs on build events | High |
| OI-04 | Jira/Linear integration: link test cases to issues; sync test run results | Medium |
| OI-05 | Migrate database from SQLite to PostgreSQL for production scale | Medium |
| OI-06 | Email/Slack notifications for run completion or quality threshold breaches | Medium |
| OI-07 | AI-powered test case improvement suggestions (not just generation) | Medium |
| OI-08 | Support private GitHub repositories via GitHub OAuth/token | Medium |
| OI-09 | Real-time collaboration (multi-user run execution with live updates) | Low |
| OI-10 | Native AI-powered duplicate detection (semantic similarity vs. word overlap) | Low |
| OI-11 | Test case tagging (free-form tags in addition to category/suite) | Low |
| OI-12 | Bulk operations: bulk status change, bulk suite assignment, bulk delete | Low |
| OI-13 | Export test runs as PDF/HTML report | Low |
| OI-14 | Playwright/Cypress test script generation from test case steps | Low |

---

## 15. Glossary

| Term | Definition |
|------|-----------|
| **Test Case** | A documented description of a condition to be tested, including steps, expected result, and metadata (priority, severity, category) |
| **Test Suite** | A named collection of related test cases, typically corresponding to a feature or module |
| **Test Run** | A specific execution instance of a selected set of test cases in a defined environment/build |
| **Test Result** | The outcome of executing a single test case within a test run (pass, fail, blocked, skip, pending) |
| **Flaky Test** | A test case that has recorded both pass and fail results across multiple test runs, indicating unstable behavior |
| **Jaccard Similarity** | A set-based similarity metric computed as: |intersection| / |union| of tokenized word sets; used for duplicate detection |
| **Fallback Chain** | The ordered sequence of AI providers attempted when earlier providers fail or are rate-limited |
| **BRD** | Business Requirements Document — a formal document describing software requirements, used as input for AI test case generation |
| **Pass Rate** | (Passed test cases / Total test cases) × 100, expressed as a percentage |
| **Rerun** | A new test run created from the failed and blocked results of a completed run |
| **Version History** | A chronological log of changes to a test case, each storing a full snapshot of the case at the time of change |
| **JWT** | JSON Web Token — a signed, stateless authentication token issued after login |
| **Groq** | An AI inference provider offering fast LLM inference (default: llama-3.3-70b-versatile) |
| **OpenRouter** | A unified API gateway for multiple LLM providers, used as a free-tier fallback |

---

*End of Document*

*BRD generated by reviewing the QAVibe codebase on 2026-04-12.*
