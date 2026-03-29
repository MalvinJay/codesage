using CodeSage.Api.Models;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;

namespace CodeSage.Api.Agents;

/// <summary>
/// Routes incoming queries to the correct agent using a lightweight classifier prompt.
/// Phase 3 replaces this with a full SK FunctionCallingStepwisePlanner.
/// </summary>
public class AgentOrchestrator(
    Kernel kernel,
    CodeReviewAgent reviewAgent,
    KnowledgeAgent knowledgeAgent,
    PrGenerationAgent prAgent,
    ILogger<AgentOrchestrator> logger)
{
    private const string RouterPrompt = """
        You are a routing agent. Classify the user's request into one of these categories:
        - code_review: reviewing a PR or specific code for issues
        - knowledge: asking a question about a codebase ("where is X", "how does Y work")  
        - pr_generation: generating or drafting a PR description
        
        Reply with ONLY the category name, nothing else.
        """;

    public async Task<AgentResponse> RouteAsync(
        AgentRequest request, CancellationToken ct = default)
    {
        var agentType = request.Agent == AgentType.Auto
            ? await ClassifyAsync(request.Query, ct)
            : request.Agent;

        logger.LogInformation("Routing query to {Agent}", agentType);

        return agentType switch
        {
            AgentType.CodeReview when request.Context?.PrNumber is int prNum =>
                await reviewAgent.ReviewPullRequestAsync(
                    request.Context.RepoOwner!, 
                    request.Context.RepoName!, 
                    prNum, ct),

            AgentType.CodeReview =>
                await reviewAgent.ReviewSnippetAsync(request.Query, ct: ct),

            AgentType.PrGeneration when request.Context?.PrNumber is int prNum =>
                await prAgent.GenerateAsync(
                    request.Context.RepoOwner!, 
                    request.Context.RepoName!, 
                    prNum, ct),

            _ =>
                await knowledgeAgent.AnswerAsync(
                    request.Query, 
                    request.Context?.RepoName, ct)
        };
    }

    private async Task<AgentType> ClassifyAsync(string query, CancellationToken ct)
    {
        var chat = kernel.GetRequiredService<IChatCompletionService>();
        var history = new ChatHistory(RouterPrompt);
        history.AddUserMessage(query);

        var result = await chat.GetChatMessageContentAsync(history, cancellationToken: ct);
        var raw = result.Content?.Trim().ToLower() ?? "knowledge";

        return raw switch
        {
            "code_review" => AgentType.CodeReview,
            "pr_generation" => AgentType.PrGeneration,
            _ => AgentType.Knowledge
        };
    }
}
