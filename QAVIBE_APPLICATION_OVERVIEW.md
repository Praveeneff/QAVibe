# QAVibe — Full Application Overview

This document is intended for an LLM that needs to fully understand the QAVibe application: its purpose, architecture, features, data model, API surface, and all current implementation details.

---

## 1. What Is QAVibe?

QAVibe is a **Quality Assurance management tool** that lets QA engineers:
- Manually create, view, edit, and delete test cases
- Automatically generate structured test cases from plain-English requirements using AI (multiple LLM providers with automatic fallback)
- Organize test cases by type (Smoke / Sanity / Regression), execution method (manual / automated / exploratory), and status (active / inactive / draft)

It is a **monorepo** with two apps:
- `apps/backend` — NestJS REST API + SQLite database via Prisma
- `apps/frontend` — Next.js 14 App Router UI

Both run locally during development:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React, TypeScript |
| Backend | NestJS, TypeScript |
| Database | SQLite (via Prisma ORM) |
| Package manager | pnpm (monorepo) |
| AI providers | Google Gemini, OpenAI, Anthropic Claude, OpenRouter |

---

## 3. Repository Structure

```
QAVibe/
├── apps/
│   ├── backend/
│   │   ├── prisma/
│   │   │   └── schema.prisma          # Database schema
│   │   ├── src/
│   │   │   ├── main.ts                # App bootstrap, CORS, port 3001
│   │   │   ├── app.module.ts          # Root module
│   │   │   ├── prisma/                # PrismaService + PrismaModule
│   │   │   ├── test-case/             # CRUD module for test cases
│   │   │   │   ├── test-case.controller.ts
│   │   │   │   ├── test-case.service.ts
│   │   │   │   └── test-case.module.ts
│   │   │   └── ai/                    # AI generation module
│   │   │       ├── ai.controller.ts
│   │   │       ├── ai.service.ts      # Fallback chain logic
│   │   │       ├── ai.module.ts       # Provider factory
│   │   │       └── providers/
│   │   │           ├── interface.ts
│   │   │           ├── gemini.service.ts
│   │   │           ├── openai.service.ts
│   │   │           ├── claude.service.ts
│   │   │           └── openrouter.service.ts
│   │   └── .env                       # All API keys and config
│   └── frontend/
│       └── src/
│           ├── app/
│           │   ├── page.tsx                        # Home / landing page
│           │   └── test-cases/
│           │       ├── page.tsx                    # List all test cases
│           │       ├── new/
│           │       │   ├── page.tsx                # Shell for new test case page
│           │       │   └── NewTestCaseClient.tsx   # AI generation + save UI (client)
│           │       └── [id]/
│           │           ├── page.tsx                # Shell for edit page
│           │           └── EditTestCaseClient.tsx  # Edit + delete UI (client)
│           ├── components/
│           │   └── TestCaseForm.tsx                # Shared create/edit form
│           └── lib/
│               └── api.ts                          # All fetch calls to backend
```

---

## 4. Database Schema

Single model in `apps/backend/prisma/schema.prisma`:

```prisma
model TestCase {
  id             String   @id @default(uuid())
  title          String
  description    String?
  type           String                      // "smoke" | "sanity" | "regression" (AI-generated)
                                             // or "manual" | "automated" | "exploratory" (manual form)
  steps          String?                     // JSON array stored as string, e.g. '["step1","step2"]'
  expectedResult String?
  status         String   @default("active") // "active" | "inactive" | "draft"
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

**Important note on `type` field:** The field serves two different semantic purposes:
- When a test case is **AI-generated**, `type` stores the QA category tag: `smoke`, `sanity`, or `regression`
- When a test case is **manually created** via the form, `type` stores execution method: `manual`, `automated`, or `exploratory`

**Important note on `steps` field:** SQLite does not support Prisma's JSON type, so `steps` is stored as a raw JSON string and must be serialized/deserialized at the application layer.

---

## 5. Backend — REST API

### Base URL
`http://localhost:3001`

### CORS
Configured to allow only `http://localhost:3000` (the frontend).

### Test Case Endpoints (`/test-cases`)

| Method | Path | Description |
|---|---|---|
| GET | `/test-cases` | Get all test cases, ordered by `createdAt` desc |
| GET | `/test-cases/:id` | Get a single test case by UUID |
| POST | `/test-cases` | Create a new test case |
| PATCH | `/test-cases/:id` | Partially update a test case |
| DELETE | `/test-cases/:id` | Delete a test case (returns 204 No Content) |

**POST/PATCH body shape:**
```json
{
  "title": "string (required)",
  "description": "string (optional)",
  "type": "string (required)",
  "steps": "string (optional, JSON array as string)",
  "expectedResult": "string (optional)",
  "status": "string (optional, defaults to 'active')"
}
```

### AI Generation Endpoint

| Method | Path | Description |
|---|---|---|
| POST | `/ai/generate-test-cases` | Generate test cases from a requirement string |

**Request body:**
```json
{
  "input": "string (required) — the feature requirement or user story",
  "provider": "string (optional) — 'gemini' | 'openai' | 'claude' | 'openrouter'",
  "model": "string (optional) — specific model to use",
  "apiKey": "string (optional) — user-supplied API key"
}
```

**Success response** — array of generated test case objects:
```json
[
  {
    "title": "string",
    "description": "string",
    "type": "manual",
    "steps": ["string", "string"],
    "expectedResult": "string"
  }
]
```

**Error response (503) when all providers are rate-limited:**
```json
{
  "error": "rate_limited",
  "message": "AI generation is temporarily unavailable due to rate limits...",
  "retryAfter": 60
}
```

---

## 6. AI System — Full Detail

### Provider Interface

All providers implement:
```typescript
interface AIProvider {
  generateTestCases(input: string, config: { apiKey?: string; model?: string }): Promise<any[]>
}
```

### Active Providers

#### Google Gemini (`gemini.service.ts`)
- Library: `@google/generative-ai`
- Env key: `AI_GEMINI_API_KEY` or `GEMINI_API_KEY`
- Default model: resolves dynamically (`gemini-2.5-flash` attempted first, with internal fallback)
- Env override: `AI_GEMINI_MODEL`
- Rate limit detection: checks HTTP status 429, message strings `"429"`, `"Too Many Requests"`, `"quota"`, `"RESOURCE_EXHAUSTED"`
- Has internal retry (up to 3 attempts) for transient 503 / `api_error` failures before bubbling to chain
- Parses JSON from response; strips markdown fences if present
- DEPRECATED models (do not re-add): `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-1.0-pro` (all 404 on v1beta)

#### OpenAI (`openai.service.ts`)
- Library: `openai`
- Env key: `AI_OPENAI_API_KEY`
- Default model: `gpt-4o`
- Env override: `AI_OPENAI_MODEL`
- Uses `response_format: { type: "json_object" }` for reliable JSON output

#### Anthropic Claude (`claude.service.ts`)
- Library: `@anthropic-ai/sdk`
- Env key: `AI_CLAUDE_API_KEY`
- Default model: `claude-3-sonnet-20240229`
- Env override: `AI_CLAUDE_MODEL`

#### OpenRouter (`openrouter.service.ts`)
- Library: `openai` (OpenAI-compatible client pointed at OpenRouter)
- Base URL: `https://openrouter.ai/api/v1`
- Required header: `"HTTP-Referer": "http://localhost:3000"`
- Auth: Bearer token
- Env key: `AI_OPENROUTER_API_KEY` or `OPENROUTER_API_KEY`
- Default model: `meta-llama/llama-3.2-3b-instruct:free`
- Env override: `AI_OPENROUTER_MODEL`
- Does NOT use `response_format: json_object` (free models don't support it)
- Parses JSON manually: strips markdown fences, then `JSON.parse`; handles arrays nested under keys like `test_cases` or `testCases`
- Internal retry: up to 3 attempts for `api_error` / `Internal server error` types (not for 429)

### System Prompt (all providers)

```
You are a senior QA engineer. Given a feature requirement, FRD, or user story, generate structured test cases.

Always respond with ONLY a valid JSON array. No explanation, no markdown, no code blocks.

Each test case must follow this exact shape:
{
  "title": "string",
  "description": "string",
  "type": "manual",
  "steps": ["string", "string"],
  "expectedResult": "string"
}
```

### Fallback Chain (ai.service.ts)

This is the core logic that makes the AI system resilient. When no user-supplied API key is given, the service tries providers in sequence, moving to the next only on a 429 or 503 rate-limit error. Non-rate-limit errors fail immediately.

**Default chain (when no provider specified — uses Gemini as primary):**

| Step | Provider / Model | Purpose |
|------|-----------------|---------|
| 1 (primary) | `gemini / gemini-2.5-flash` | Latest, fastest Gemini |
| 2 | `gemini / gemini-2.0-flash` | Separate quota bucket |
| 3 | `gemini / gemini-2.0-flash-lite` | Lightest, highest rate limits |
| 4 | `openrouter / meta-llama/llama-3.2-3b-instruct:free` | Free tier, no hard daily quota |
| 5 | `openrouter / mistralai/mistral-7b-instruct:free` | Free tier fallback |
| 6 | `openrouter / microsoft/phi-3-mini-128k-instruct:free` | Free tier fallback |
| 7 | `openrouter / google/gemma-3-1b-it:free` | Free tier last resort |

**When user explicitly selects openrouter as provider:**
- Primary: user's chosen model (or default `meta-llama/llama-3.2-3b-instruct:free`)
- Fallbacks: the remaining three OpenRouter free models in order (skips whichever was primary)
- No Gemini fallback (user's explicit choice is respected)

**When user supplies their own API key:**
- Fallback chain is skipped entirely
- The chosen provider + model is called directly with the user's key
- No silent provider switching

**Rate limit error detection (`isRateLimitError`):**
- `HttpException` with status 429 or 503
- Gemini-specific: status 429 on raw error object, message contains `"429"`, `"Too Many Requests"`, `"quota"`, `"RESOURCE_EXHAUSTED"`

**When all steps exhausted:** throws HTTP 503 with `{ error: "rate_limited", message: "...", retryAfter: 60 }`

### Environment Configuration (`.env`)

```env
# Active default provider for server-side default key path
AI_PROVIDER=openrouter

# API Keys
AI_GEMINI_API_KEY=<key>
AI_CLAUDE_API_KEY=<key>
AI_OPENAI_API_KEY=<key>
AI_OPENROUTER_API_KEY=<key>

# Default models per provider
AI_GEMINI_MODEL=gemini-2.0-flash
AI_CLAUDE_MODEL=claude-3-sonnet-20240229
AI_OPENAI_MODEL=gpt-4o
AI_OPENROUTER_MODEL=meta-llama/llama-3.2-3b-instruct:free
```

---

## 7. Frontend — Pages and Features

### Home Page (`/`)
- Static landing page
- Shows app name "QAVibe" and tagline "Quality Assurance Management"
- Single CTA button: "View Test Cases →" linking to `/test-cases`

### Test Cases List Page (`/test-cases`)
- Server component (`force-dynamic` to always fetch fresh data)
- Calls `GET /test-cases` on the backend
- Displays a table with columns: Title, Type, Status, Created date, Edit link
- Status badge: green for `active`, orange for anything else
- "+ New" button links to `/test-cases/new`
- Shows friendly error if backend is unreachable

### New Test Case Page (`/test-cases/new`)
- Shell server component wrapping `NewTestCaseClient` (client component)
- Contains two sections:
  1. **AI Generation Panel** (top)
  2. **Manual Form** (bottom, always visible)

### AI Generation Panel (inside `NewTestCaseClient.tsx`)

This is the most complex part of the UI. Features:

#### Advanced Settings (collapsible)
- Toggled by "▸ Advanced Settings" / "▾ Advanced Settings" button
- Contains:
  - **AI Provider dropdown**: `gemini` | `openai` | `claude` | `openrouter`
  - **Model input**: text field for custom model name
    - Placeholder is dynamic: when `openrouter` selected → `"e.g. meta-llama/llama-3.2-3b-instruct:free"`, otherwise shows generic examples
    - When switching to `openrouter`, model field is auto-populated with `meta-llama/llama-3.2-3b-instruct:free`
    - When switching away from `openrouter`, model field is cleared
  - **API Key input** (password field): user's own key; if provided, skips server fallback chain

#### Requirement Input
- Large textarea: "Paste Requirement / User Story"
- "Generate Test Cases" button
  - Disabled while generating or when textarea is empty
  - Shows "Generating…" while in-flight

#### Loading / Status States
- `generating: boolean` — controls button disabled state and button text
- `genSuccess: boolean` — shows "✅ Test cases generated" in green after success
- `genError: string` — shows "⚠️ AI is busy. Please try again." in amber on error (real error logged to console)
- `quotaExhausted: boolean` — shows a special yellow warning box with links to get free API keys; auto-expands Advanced Settings panel

#### Generated Test Cases (suggestion cards)
- Each AI-generated test case appears as an editable card
- **All fields are editable inline** (user can modify before saving):
  - Title → `<input type="text">`
  - Type tag → `<select>` (Smoke / Sanity / Regression) — auto-assigned on generation
  - Description → `<textarea rows={2}>`
  - Steps → `<textarea rows={3}>` (one step per line; converted to/from string array)
  - Expected Result → `<textarea rows={2}>`
- **Checkbox** on each card for selection (all selected by default)
- Card border turns blue when selected
- **Auto-tagging logic** (`autoTag` function):
  - Title contains `success`, `valid login`, `happy path` → `smoke`
  - Title contains `validation`, `error`, `invalid`, `fail` → `regression`
  - Everything else → `sanity`
- "Save Selected (N)" button: saves only checked cards
- After all save successfully, suggestion list is cleared

#### Auto-scroll
- After generation completes, page smoothly scrolls to the results section (`resultsRef.scrollIntoView`)

#### State variables in `NewTestCaseClient`
```typescript
requirement: string          // textarea content
showAdvanced: boolean        // advanced panel open/closed
provider: Provider           // selected AI provider
model: string                // custom model name
apiKey: string               // user's API key
generating: boolean          // fetch in-flight
genError: string             // error message
genSuccess: boolean          // success flag
quotaExhausted: boolean      // daily quota hit
suggestions: GeneratedCase[] // AI results
selected: Set<number>        // indices of checked cards
formInitial: TestCase|undefined  // seeds the manual form below
formKey: number              // forces form remount on "Use This"
saving: boolean              // save in-flight
saveMsg: string              // post-save feedback message
resultsRef: RefObject        // ref for auto-scroll
```

#### `GeneratedCase` type
```typescript
interface GeneratedCase {
  title: string;
  description?: string;
  steps?: string[];
  expectedResult?: string;
  tag: "smoke" | "sanity" | "regression";
}
```

#### Save payload
When saving a generated test case, the payload sent to `POST /test-cases` is:
```typescript
{
  title: tc.title,
  description: tc.description,
  type: tc.tag,           // "smoke" | "sanity" | "regression"
  steps: JSON.stringify(tc.steps),
  expectedResult: tc.expectedResult,
  status: "active"
}
```

### Manual Form (below AI panel, inside `NewTestCaseClient.tsx`)
- Rendered by the shared `TestCaseForm` component
- Pre-populated if user clicks "Use This" on a suggestion card
- Fields: Title (required), Description, Type (manual/automated/exploratory), Steps (JSON array string), Expected Result, Status
- On submit: calls `POST /test-cases`, then navigates to `/test-cases`

### Edit Test Case Page (`/test-cases/[id]`)
- Server component fetches the test case by ID
- Renders `EditTestCaseClient` (client component)
- `EditTestCaseClient` wraps `TestCaseForm` pre-populated with existing data
- On submit: calls `PATCH /test-cases/:id`
- Delete button below form: calls `DELETE /test-cases/:id` with confirmation dialog, then navigates to `/test-cases`

---

## 8. Frontend API Layer (`src/lib/api.ts`)

All backend communication goes through this module:

```typescript
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

// Types
interface TestCase {
  id: string;
  title: string;
  description?: string;
  type: string;
  steps?: string;          // JSON string
  expectedResult?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface TestCasePayload {
  title: string;
  description?: string;
  type: string;
  steps?: string;
  expectedResult?: string;
  status?: string;
}

// Functions
getTestCases()              → GET  /test-cases
getTestCase(id)             → GET  /test-cases/:id
createTestCase(data)        → POST /test-cases
updateTestCase(id, data)    → PATCH /test-cases/:id
deleteTestCase(id)          → DELETE /test-cases/:id  (returns void, 204)
```

The base URL can be overridden with the `NEXT_PUBLIC_API_URL` environment variable.

---

## 9. Key Design Decisions

1. **Fallback chain is transparent to the user.** The UI only knows about success or rate-limit exhaustion; it never shows which provider was actually used.

2. **User-supplied API key bypasses the fallback chain.** If the user provides their own key in Advanced Settings, the server uses that key directly with no silent provider switching.

3. **`type` field is overloaded.** AI-generated cases use `smoke/sanity/regression`; manually created cases use `manual/automated/exploratory`. The frontend and backend treat it as a plain string — there is no validation or enum enforcement at the DB level.

4. **Steps stored as JSON string.** SQLite doesn't support Prisma's Json type, so steps arrays are serialized to a string before saving and deserialized at read time.

5. **OpenRouter free models don't support `response_format: json_object`**, so the OpenRouter service uses manual JSON extraction (strip markdown fences → `JSON.parse`).

6. **Daily quota exhaustion vs. per-minute rate limits.** The fallback chain only helps with per-minute RPM limits (429). If the server-side Gemini key's daily quota is exhausted, no amount of model-switching on the same key helps — users must supply their own key.

7. **No authentication.** The app has no user login or auth layer. All endpoints are public.

8. **No pagination.** `GET /test-cases` returns all records ordered by creation date descending.

---

## 10. Running the Application

```bash
# Install dependencies
pnpm install

# Start backend (port 3001)
cd apps/backend && pnpm dev

# Start frontend (port 3000)
cd apps/frontend && pnpm dev
```

Backend requires a `.env` file at `apps/backend/.env` with at least one AI provider API key set.

Database is SQLite at `apps/backend/prisma/dev.db` — created automatically on first run via `prisma migrate dev`.
