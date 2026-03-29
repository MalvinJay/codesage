using CodeSage.Api.Data;
using CodeSage.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CodeSage.Api.Services;

public class FeedbackService(FeedbackDbContext db, ILogger<FeedbackService> logger)
{
    public async Task RecordAsync(
        string traceId, string query, string response,
        AgentType agent, string? context, CancellationToken ct = default)
    {
        // Store every agent interaction — feedback signal added later via /feedback
        var record = new FeedbackRecord
        {
            TraceId = traceId,
            Query = query,
            Response = response,
            AgentUsed = agent.ToString(),
            RetrievedContext = context
        };
        db.FeedbackRecords.Add(record);
        await db.SaveChangesAsync(ct);
    }

    public async Task ApplyFeedbackAsync(
        string traceId, FeedbackSignal signal, string? comment, 
        CancellationToken ct = default)
    {
        var record = await db.FeedbackRecords
            .FirstOrDefaultAsync(r => r.TraceId == traceId, ct);

        if (record is null)
        {
            logger.LogWarning("Feedback for unknown traceId {TraceId}", traceId);
            return;
        }

        record.Signal = signal;
        record.Comment = comment;
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Feedback {Signal} recorded for trace {TraceId}", signal, traceId);
    }

    /// <summary>
    /// Returns thumbs-down cases for use as seed eval data.
    /// Phase 4: these feed the eval pipeline.
    /// </summary>
    public async Task<List<FeedbackRecord>> GetNegativeCasesAsync(
        int limit = 200, CancellationToken ct = default)
    {
        return await db.FeedbackRecords
            .Where(r => r.Signal == FeedbackSignal.ThumbsDown)
            .OrderByDescending(r => r.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);
    }

    public async Task<(int total, int positive, int negative)> GetStatsAsync(
        CancellationToken ct = default)
    {
        var total = await db.FeedbackRecords.CountAsync(ct);
        var positive = await db.FeedbackRecords
            .CountAsync(r => r.Signal == FeedbackSignal.ThumbsUp, ct);
        return (total, positive, total - positive);
    }
}
