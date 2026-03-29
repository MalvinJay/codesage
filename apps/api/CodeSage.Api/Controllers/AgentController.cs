using CodeSage.Api.Agents;
using CodeSage.Api.Models;
using CodeSage.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace CodeSage.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AgentController(
    AgentOrchestrator orchestrator,
    FeedbackService feedback,
    ILogger<AgentController> logger) : ControllerBase
{
    /// <summary>
    /// Primary endpoint — routes query to the right agent automatically.
    /// POST /api/agent/query
    /// </summary>
    [HttpPost("query")]
    public async Task<ActionResult<AgentResponse>> QueryAsync(
        [FromBody] AgentRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Query))
            return BadRequest(new { error = "Query cannot be empty." });

        var response = await orchestrator.RouteAsync(request, ct);

        // Persist every interaction for later feedback + eval seeding
        await feedback.RecordAsync(
            response.TraceId, request.Query,
            response.Response, response.AgentUsed,
            string.Join("\n", response.Sources.Select(s => s.FilePath)), ct);

        return Ok(response);
    }
}
