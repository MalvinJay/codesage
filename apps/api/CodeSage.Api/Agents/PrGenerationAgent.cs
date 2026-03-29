using CodeSage.Api.Models;
using CodeSage.Api.Services;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using System.ComponentModel;

namespace CodeSage.Api.Agents;

/// <summary>
/// Generates rich PR descriptions from a diff.
/// Includes: summary, motivation, changes breakdown, testing notes, risk flags.
/// </summary>
public class PrGenerationAgent(
    Kernel kernel,
    GitHubService github,
    EmbeddingService embedding,
    WeaviateService weaviate,
    ILogger<PrGenerationAgent> logger)
{
    private const string SystemPrompt = """
        You are CodeSage, an expert at writing clear, informative pull request descriptions.
        
        Generate a PR description in this exact Markdown format:
        
        ## Summary
        One-paragraph plain-English explanation of what this PR does and why.
        
        ## Changes
        - Bullet list of specific changes grouped by area (API, UI, DB, etc.)
        
        ## Motivation
        Why is this change needed? What problem does it solve?
        
        ## Testing
        - How was this tested?
        - What edge cases were considered?
        
        ## Risk / Notes
        Any deployment considerations, migration steps, or potential risks.
        
        Be specific. Reference actual file names and function names from the diff.
        """;

    [KernelFunction("generate_pr_description")]
    [Description("Generates a structured pull request description from a GitHub PR diff")]
    public async Task<AgentResponse> GenerateAsync(
        [Description("GitHub repo owner")] string owner,
        [Description("GitHub repo name")] string repo,
        [Description("Pull request number")] int prNumber,
        CancellationToken ct = default)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();

        var diff = await github.GetPrDiffAsync(owner, repo, prNumber, ct);

        // Retrieve context to give the LLM background on the codebase
        var queryVector = await embedding.EmbedAsync(diff[..Math.Min(diff.Length, 800)], ct);
        var sources = await weaviate.QueryAsync(queryVector, repoFilter: repo, limit: 4, ct: ct);

        var chat = kernel.GetRequiredService<IChatCompletionService>();
        var history = new ChatHistory(SystemPrompt);
        history.AddUserMessage($"""
            Generate a PR description for the following diff:

            {diff}
            """);

        var result = await chat.GetChatMessageContentAsync(history, cancellationToken: ct);
        sw.Stop();

        logger.LogInformation("PR description generated in {Ms}ms", sw.ElapsedMilliseconds);

        return new AgentResponse(
            Response: result.Content ?? string.Empty,
            AgentUsed: AgentType.PrGeneration,
            Sources: sources,
            TraceId: Guid.NewGuid().ToString(),
            LatencyMs: sw.ElapsedMilliseconds
        );
    }
}
