.PHONY: up down reset api web evals ingest health

# ── Local dev stack ───────────────────────────────────────────────────────────

up:
	@echo "→ Starting Weaviate + PostgreSQL..."
	cd infra/docker && docker compose up -d
	@echo "→ Waiting for services..."
	@sleep 4
	@echo "✅ Services up"
	@echo "   Weaviate: http://localhost:8080"
	@echo "   Postgres: localhost:5432 (adminer: http://localhost:8888)"

down:
	cd infra/docker && docker compose down

reset:
	@echo "⚠️  This will wipe all local data (Weaviate + Postgres volumes)"
	cd infra/docker && docker compose down -v

# ── Run services ──────────────────────────────────────────────────────────────

api:
	cd apps/api && dotnet run --project CodeSage.Api

web:
	cd apps/web && npm run dev

evals:
	cd evals && npm run eval

evals-ci:
	cd evals && npm run eval:ci

# ── Utilities ─────────────────────────────────────────────────────────────────

health:
	@curl -s http://localhost:5000/health | python3 -m json.tool || echo "API not running"

ingest:
	@echo "Usage: make ingest OWNER=myorg REPO=my-repo"
	@curl -s -X POST http://localhost:5000/api/ingest \
		-H "Content-Type: application/json" \
		-d "{\"repoOwner\":\"$(OWNER)\",\"repoName\":\"$(REPO)\",\"branch\":\"main\"}" \
		| python3 -m json.tool

logs-weaviate:
	cd infra/docker && docker compose logs -f weaviate

logs-postgres:
	cd infra/docker && docker compose logs -f postgres

install:
	cd apps/web && npm install
	cd evals && npm install

# ── Quick smoke test ──────────────────────────────────────────────────────────

smoke:
	@curl -s -X POST http://localhost:5000/api/agent/query \
		-H "Content-Type: application/json" \
		-d '{"query":"Where is authentication handled?","agent":"Knowledge"}' \
		| python3 -m json.tool
