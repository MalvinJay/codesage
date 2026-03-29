-- CodeSage initial schema
-- EF Core migrations will manage this in prod, but this seeds the dev DB
-- so you can run the API without running `dotnet ef database update` first.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "FeedbackRecords" (
    "Id"               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "TraceId"          TEXT NOT NULL,
    "Query"            TEXT NOT NULL,
    "Response"         TEXT NOT NULL,
    "AgentUsed"        TEXT NOT NULL,
    "Signal"           TEXT NOT NULL DEFAULT 'ThumbsUp',
    "Comment"          TEXT,
    "RetrievedContext" TEXT,
    "CreatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "CorrectnessScore" DOUBLE PRECISION,
    "RelevanceScore"   DOUBLE PRECISION,
    "EvalPassed"       BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_feedback_trace_id  ON "FeedbackRecords"("TraceId");
CREATE INDEX IF NOT EXISTS idx_feedback_signal     ON "FeedbackRecords"("Signal");
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON "FeedbackRecords"("CreatedAt" DESC);

-- Seed one example thumbs-down for eval pipeline testing
INSERT INTO "FeedbackRecords" ("TraceId","Query","Response","AgentUsed","Signal")
VALUES (
    'seed-trace-001',
    'Where is authentication handled?',
    'Authentication is handled in the middleware layer.',
    'Knowledge',
    'ThumbsDown'
);
