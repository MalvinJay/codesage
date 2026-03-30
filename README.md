# CodeSage

AI-powered SDLC assistant — PR review, codebase Q&A, and PR generation, orchestrated via Semantic Kernel with a RAG pipeline backed by Weaviate.

## Monorepo layout

```
codesage/
├── apps/
│   ├── api/          # .NET 8 Web API — Semantic Kernel orchestration
│   └── web/          # React + TypeScript chat UI
├── infra/
│   └── docker/       # Docker Compose for local dev
├── evals/            # Eval suite — Braintrust + LLM-as-judge
└── .github/
    └── workflows/    # CI: build, test, eval gate, deploy
```

## Quick start (local MVP)

### Prerequisites

- Docker + Docker Compose
- .NET 8 SDK
- Node 20+
- [Groq API key](https://console.groq.com) (free)
- [Ollama](https://ollama.com/download)

### Local model flow

This repository supports two modes:

- Local MVP mode: Groq for chat completions, Ollama for embeddings, Weaviate for vector search, PostgreSQL for feedback storage, and optional Ollama-backed eval configuration.
- Production mode: OpenAI for chat completions and embeddings by setting `Features:UseProdLlm=true`.

Important: this MVP does not currently use Ollama for every LLM hop inside the API.
In local mode, Ollama is used for embeddings. Chat completions still go through
Groq unless you explicitly change the application code.

### 1. Start local services

```bash
cd infra/docker
cp .env.example .env
# Edit .env and choose a local-only Postgres password
docker compose up -d
```

This starts:

- **Weaviate** on `localhost:8080` (vector DB)
- **PostgreSQL** on `localhost:5433` (feedback store)

### 2. Start Ollama and pull the local embedding model

The API uses Ollama for local embeddings in MVP mode. Pull the embedding model once:

```bash
ollama pull nomic-embed-text
```

Start Ollama in a separate terminal:

```bash
ollama serve
```

Expected Ollama endpoint:

```text
http://localhost:11434
```

If Ollama is not running, ingestion and knowledge retrieval will fail because the
API cannot generate embeddings.

### 3. Configure environment

```bash
cp apps/api/CodeSage.Api/appsettings.Development.json.example \
   apps/api/CodeSage.Api/appsettings.Development.json
# Edit and fill in your local secrets
```

For the frontend and evals packages, create local env files from the checked-in examples:

```bash
cp apps/web/.env.example apps/web/.env
cp evals/.env.example evals/.env
```

In `apps/api/CodeSage.Api/appsettings.Development.json`, fill in at least:

- `Groq.ApiKey`: required for local chat completions
- `GitHub.Token`: required for ingestion from GitHub
- `ConnectionStrings.Feedback`: local PostgreSQL connection string

Leave `Features.UseProdLlm` set to `false` for the local MVP path. That setting is
what keeps the API on Groq + Ollama instead of switching to OpenAI.

### 4. Run the API

```bash
cd apps/api
dotnet restore
dotnet build
dotnet run --project CodeSage.Api/CodeSage.Api.csproj
# API usually live at http://localhost:5000
```

What happens on startup in local MVP mode:

- Semantic Kernel is registered in the API.
- Chat completion is configured against Groq's OpenAI-compatible endpoint.
- Text embedding generation is configured against local Ollama at `http://localhost:11434/v1`.
- The middleware pipeline is started, including `ApiKeyMiddleware`.
- EF Core attempts to apply feedback database migrations on startup.

### 5. Ingest a repository before asking knowledge questions

Knowledge queries depend on Weaviate already containing embedded code chunks. If
you skip ingestion, the Knowledge agent has no indexed code to retrieve from.

The ingestion pipeline is:

1. `POST /api/ingest` is sent to the API.
2. The API traverses the target GitHub repository recursively.
3. Only supported source/doc extensions are kept.
4. Each file is downloaded from GitHub.
5. File contents are chunked into smaller sections.
6. Each chunk is embedded through Ollama using `nomic-embed-text`.
7. Each vectorized chunk is written into Weaviate as a `CodeChunk`.
8. Later knowledge queries embed the question, search Weaviate by vector similarity, and answer from the retrieved chunks.

Supported file types for ingestion currently include:

- `.cs`
- `.ts`
- `.tsx`
- `.js`
- `.jsx`
- `.py`
- `.go`
- `.java`
- `.md`
- `.yaml`
- `.yml`
- `.json`

To ingest a repository:

```bash
curl -X POST http://localhost:5000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "repoOwner": "YOUR_GITHUB_ORG_OR_USER",
    "repoName": "YOUR_REPO",
    "branch": "main"
  }'
```

Example response:

```json
{
  "filesProcessed": 42,
  "chunksCreated": 315,
  "errors": 0,
  "elapsed": "00:00:18.1234567"
}
```

Optional path filtering is also supported:

```bash
curl -X POST http://localhost:5000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "repoOwner": "YOUR_GITHUB_ORG_OR_USER",
    "repoName": "YOUR_REPO",
    "branch": "main",
    "pathFilter": ["apps/api", "README.md"]
  }'
```

You can also use the helper target:

```bash
make ingest OWNER=YOUR_GITHUB_ORG_OR_USER REPO=YOUR_REPO
```

Do this once after standing up a new local environment, and repeat it whenever you
want Weaviate refreshed with the latest repository state.

### 6. Verify the API before using the UI

Health check:

```bash
curl http://localhost:5000/health
```

Smoke-test a knowledge query after ingestion:

```bash
curl -X POST http://localhost:5000/api/agent/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Where is authentication handled?",
    "agent": "Knowledge"
  }'
```

If this succeeds, the API, embeddings, Weaviate retrieval, and agent orchestration
are all connected.

### 7. Run the frontend

```bash
cd apps/web
npm install
npm run dev
# UI live at http://localhost:5173
```

### 8. Run evals locally

```bash
cd evals
npm install
npm run eval
```

For a fully local MVP setup, the eval judge can use Ollama instead of OpenAI. In
`evals/.env`, set:

```bash
EVAL_JUDGE_PROVIDER=ollama
EVAL_JUDGE_MODEL=llama3.1
EVAL_JUDGE_BASE_URL=http://localhost:11434/v1
EVAL_JUDGE_API_KEY=ollama
```

Then make sure Ollama is running and the model is pulled, for example:

```bash
ollama pull llama3.1
ollama serve
```

Important: `autoevals` `Factuality` only supports OpenAI chat models. The local MVP
runner therefore falls back to heuristic checks when `EVAL_JUDGE_PROVIDER=ollama`.
That means Ollama can still be used for local eval experimentation, but the
OpenAI-backed factuality judge is skipped in that mode.

## Architecture

```
React UI → .NET API Gateway → Semantic Kernel Planner
                                    ├── CodeReviewAgent   → GitHub API + RAG
                                    ├── KnowledgeAgent    → Weaviate RAG
                                    └── PrGenerationAgent → GitHub API + LLM

Observability: Every LLM call traced via Traceloop (OpenTelemetry)
Eval gate:     Braintrust scores all cases in CI before merge
```

## Environment variables

| Variable                      | Description                            | Example                 |
| ----------------------------- | -------------------------------------- | ----------------------- |
| `Groq__ApiKey`                | Groq API key (free LLM)                | `gsk_...`               |
| `OpenAI__ApiKey`              | OpenAI key (optional, swap for GPT-4o) | `sk-...`                |
| `Weaviate__Endpoint`          | Weaviate URL                           | `http://localhost:8080` |
| `GitHub__Token`               | GitHub PAT for PR/repo access          | `ghp_...`               |
| `ConnectionStrings__Feedback` | Postgres connection string             | set locally only        |
| `Traceloop__ApiKey`           | Traceloop key (free tier)              | `tlp_...`               |
| `Braintrust__ApiKey`          | Braintrust key (free tier)             | `...`                   |

## Promoting to production

Swap each service in `appsettings.Production.json`:

- Groq → OpenAI GPT-4o
- Local Weaviate → Weaviate Cloud
- Local Postgres → Supabase / AWS RDS
- Railway → AWS ECS (Dockerfile already production-ready)
- Vercel → AWS S3 + CloudFront

The application code is identical across tiers — only config changes.

## Secret hygiene

- Never commit `.env` files or `appsettings.Development.json`.
- Keep real API keys only in local env files, your shell environment, or deployment platform secrets.
- If a secret has already been pushed to a public repo, rotate it immediately even after removing it from git.

## Phase roadmap

- [x] Phase 1 — Scaffold (this PR)
- [x] Phase 2 — RAG pipeline (ingestion + retrieval)
- [ ] Phase 3 — Semantic Kernel agents (review, knowledge, PR gen)
- [ ] Phase 4 — Eval pipeline + CI gate
