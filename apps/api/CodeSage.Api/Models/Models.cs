namespace CodeSage.Api.Models;

// ── Agent request/response ────────────────────────────────────────────────────

public record AgentRequest(
    string Query,
    AgentType Agent = AgentType.Auto,
    AgentContext? Context = null
);

public record AgentContext(
    string? RepoOwner = null,
    string? RepoName = null,
    int? PrNumber = null,
    string? Branch = null
);

public record AgentResponse(
    string Response,
    AgentType AgentUsed,
    List<SourceChunk> Sources,
    string TraceId,
    long LatencyMs
);

public record SourceChunk(
    string FilePath,
    string Content,
    double Score
);

// ── Feedback ──────────────────────────────────────────────────────────────────

public record FeedbackRequest(
    string TraceId,
    FeedbackSignal Signal,
    string? Comment = null
);

public enum FeedbackSignal { ThumbsUp, ThumbsDown }

// ── Ingestion ─────────────────────────────────────────────────────────────────

public record IngestRequest(
    string RepoOwner,
    string RepoName,
    string Branch = "main",
    string[]? PathFilter = null
);

public record IngestResult(
    int FilesProcessed,
    int ChunksCreated,
    int ChunksUpdated,
    TimeSpan Duration
);

// ── Eval ──────────────────────────────────────────────────────────────────────

public record EvalCase(
    string Id,
    string Input,
    string? ExpectedOutput,
    string? RetrievedContext,
    AgentType Agent,
    string Source  // "human" | "synthetic"
);

public record EvalResult(
    string CaseId,
    double CorrectnessScore,
    double RelevanceScore,
    double FaithfulnessScore,
    bool Passed,
    string Reasoning
);

// ── Enums ─────────────────────────────────────────────────────────────────────

public enum AgentType
{
    Auto,
    CodeReview,
    Knowledge,
    PrGeneration
}
