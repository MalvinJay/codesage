using CodeSage.Api.Models;
using CodeSage.Api.Services;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using System.ComponentModel;

namespace CodeSage.Api.Agents;

/// <summary>
/// Reviews pull request diffs with context retrieved from the codebase.
/// SK Plugin pattern: methods decorated with [KernelFunction] are callable by the planner.
/// </summary>
public class CodeReviewAgent(
    Kernel kernel,
    WeaviateService weaviate,
    EmbeddingService embedding,
    GitHubService github,
    ILogger<CodeReviewAgent> logger)
{
    private const string SystemPrompt = """
        You are CodeSage, an expert code reviewer with deep knowledge of the codebase.
        You review pull request diffs and provide actionable, specific feedback.

        For each issue you identify:
        1. State the file and line range
        2. Explain WHY it's a problem (not just what)
        3. Suggest a concrete fix

        Focus on: correctness, security, performance, maintainability.
        Skip: style nitpicks already covered by linters.
        Use the retrieved codebase context to understand patterns and conventions.
        """;

    [KernelFunction("review_pull_request")]
    [Description("Reviews a GitHub pull request and returns detailed code review feedback")]
    public async Task<AgentResponse> ReviewPullRequestAsync(
        [Description("GitHub repo owner")] string owner,
        [Description("GitHub repo name")] string repo,
        [Description("Pull request number")] int prNumber,
        CancellationToken ct = default)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();

        // 1. Fetch the PR diff
        logger.LogInformation("Fetching PR #{PrNumber} from {Owner}/{Repo}", prNumber, owner, repo);
        var diff = await github.GetPrDiffAsync(owner, repo, prNumber, ct);

        // 2. Embed the diff summary and retrieve relevant codebase context
        var queryVector = await embedding.EmbedAsync(diff[..Math.Min(diff.Length, 1000)], ct);
        var sources = await weaviate.QueryAsync(queryVector, repoFilter: repo, limit: 6, ct: ct);

        // 3. Build the prompt with retrieved context
        var contextBlock = sources.Count > 0
            ? "CODEBASE CONTEXT:\n" + string.Join("\n---\n", 
                sources.Select(s => $"File: {s.FilePath}\n{s.Content}"))
            : "No codebase context available — reviewing diff in isolation.";

        var userMessage = $"""
            {contextBlock}

            PULL REQUEST DIFF:
            {diff}

            Please review this pull request and provide detailed feedback.
            """;

        // 4. Call the LLM
        var chat = kernel.GetRequiredService<IChatCompletionService>();
        var history = new ChatHistory(SystemPrompt);
        history.AddUserMessage(userMessage);

        var result = await chat.GetChatMessageContentAsync(history, cancellationToken: ct);

        sw.Stop();
        logger.LogInformation("Code review completed in {Ms}ms", sw.ElapsedMilliseconds);

        return new AgentResponse(
            Response: result.Content ?? "No review generated.",
            AgentUsed: AgentType.CodeReview,
            Sources: sources,
            TraceId: Guid.NewGuid().ToString(),
            LatencyMs: sw.ElapsedMilliseconds
        );
    }

    [KernelFunction("review_code_snippet")]
    [Description("Reviews a code snippet or file content inline")]
    public async Task<AgentResponse> ReviewSnippetAsync(
        [Description("The code to review")] string code,
        [Description("The programming language")] string language = "csharp",
        CancellationToken ct = default)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();

        var queryVector = await embedding.EmbedAsync(code[..Math.Min(code.Length, 500)], ct);
        var sources = await weaviate.QueryAsync(queryVector, limit: 4, ct: ct);

        var chat = kernel.GetRequiredService<IChatCompletionService>();
        var history = new ChatHistory(SystemPrompt);
        history.AddUserMessage($"""
            Review this {language} code snippet:
            ```{language}
            {code}
            ```
            """);

        var result = await chat.GetChatMessageContentAsync(history, cancellationToken: ct);
        sw.Stop();

        return new AgentResponse(
            Response: result.Content ?? string.Empty,
            AgentUsed: AgentType.CodeReview,
            Sources: sources,
            TraceId: Guid.NewGuid().ToString(),
            LatencyMs: sw.ElapsedMilliseconds
        );
    }
}
