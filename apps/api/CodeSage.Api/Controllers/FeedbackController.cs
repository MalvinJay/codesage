using CodeSage.Api.Models;
using CodeSage.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace CodeSage.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FeedbackController(FeedbackService feedback) : ControllerBase
{
    /// <summary>
    /// Records a thumbs up or down for a prior agent response.
    /// POST /api/feedback
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> SubmitAsync(
        [FromBody] FeedbackRequest request, CancellationToken ct)
    {
        await feedback.ApplyFeedbackAsync(
            request.TraceId, request.Signal, request.Comment, ct);
        return Ok(new { recorded = true });
    }

    /// <summary>
    /// Returns aggregate feedback stats for the dashboard.
    /// GET /api/feedback/stats
    /// </summary>
    [HttpGet("stats")]
    public async Task<IActionResult> StatsAsync(CancellationToken ct)
    {
        var (total, positive, negative) = await feedback.GetStatsAsync(ct);
        return Ok(new
        {
            total,
            positive,
            negative,
            positiveRate = total > 0 ? Math.Round((double)positive / total * 100, 1) : 0
        });
    }
}
