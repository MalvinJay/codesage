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

## Quick start (local, fully free)

### Prerequisites
- Docker + Docker Compose
- .NET 8 SDK
- Node 20+
- [Groq API key](https://console.groq.com) (free)

### 1. Start local services

```bash
cd infra/docker
docker compose up -d
```

This starts:
- **Weaviate** on `localhost:8080` (vector DB)
- **PostgreSQL** on `localhost:5433` (feedback store)

### 2. Configure environment

```bash
cp apps/api/CodeSage.Api/appsettings.Development.json.example \
   apps/api/CodeSage.Api/appsettings.Development.json
# Edit and fill in your Groq API key + other values
```

### 3. Run the API

```bash
cd apps/api
dotnet restore
dotnet run --project CodeSage.Api/CodeSage.Api.csproj
# API usually live at http://localhost:5000
```

### 4. Run the frontend

```bash
cd apps/web
npm install
npm run dev
# UI live at http://localhost:5173
```

### 5. Run evals locally

```bash
cd evals
npm install
npm run eval
```

## Architecture

```
React UI → .NET API Gateway → Semantic Kernel Planner
                                    ├── CodeReviewAgent   → GitHub API + RAG
                                    ├── KnowledgeAgent    → Weaviate RAG
                                    └── PrGenerationAgent → GitHub API + LLM

Observability: every LLM call traced via Traceloop (OpenTelemetry)
Eval gate:     Braintrust scores all cases in CI before merge
```

## Environment variables

| Variable | Description | Example |
|---|---|---|
| `Groq__ApiKey` | Groq API key (free LLM) | `gsk_...` |
| `OpenAI__ApiKey` | OpenAI key (optional, swap for GPT-4o) | `sk-...` |
| `Weaviate__Endpoint` | Weaviate URL | `http://localhost:8080` |
| `GitHub__Token` | GitHub PAT for PR/repo access | `ghp_...` |
| `ConnectionStrings__Feedback` | Postgres connection string | see appsettings |
| `Traceloop__ApiKey` | Traceloop key (free tier) | `tlp_...` |
| `Braintrust__ApiKey` | Braintrust key (free tier) | `...` |

## Promoting to production

Swap each service in `appsettings.Production.json`:
- Groq → OpenAI GPT-4o
- Local Weaviate → Weaviate Cloud
- Local Postgres → Supabase / AWS RDS
- Railway → AWS ECS (Dockerfile already production-ready)
- Vercel → AWS S3 + CloudFront

The application code is identical across tiers — only config changes.

## Phase roadmap

- [x] Phase 1 — Scaffold (this PR)
- [ ] Phase 2 — RAG pipeline (ingestion + retrieval)
- [ ] Phase 3 — Semantic Kernel agents (review, knowledge, PR gen)
- [ ] Phase 4 — Eval pipeline + CI gate
