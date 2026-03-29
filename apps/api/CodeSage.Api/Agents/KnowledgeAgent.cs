using CodeSage.Api.Models;
using CodeSage.Api.Services;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using System.ComponentModel;

namespace CodeSage.Api.Agents;

/// <summary>
/// Answers natural language questions about the codebase using RAG retrieval.
/// "Where is auth handled?" → retrieves relevant chunks → answers grounded in real code.
/// </summary>
public class KnowledgeAgent(
    Kernel kernel,
    WeaviateService weaviate,
    EmbeddingService embedding,
    ILogger<KnowledgeAgent> logger)
{
    private const string SystemPrompt = """
        You are CodeSage, an expert assistant with deep knowledge of this codebase.
        Answer questions about the code clearly and precisely.

        Rules:
        - Ground every answer in the provided code context
        - Quote specific file paths and function names
        - If the context doesn't contain enough info, say so clearly
        - For "how do I" questions, provide a concrete code example
        - Never hallucinate code that isn't in the context
        """;

    [KernelFunction("answer_codebase_question")]
    [Description("Answers questions about the codebase using semantic search over indexed code")]
    public async Task<AgentResponse> AnswerAsync(
        [Description("The question about the codebase")] string question,
        [Description("Optional repo filter")] string? repoName = null,
        CancellationToken ct = default)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();

        // Embed the question and retrieve relevant code chunks
        var queryVector = await embedding.EmbedAsync(question, ct);
        var sources = await weaviate.QueryAsync(queryVector, repoFilter: repoName, limit: 8, ct: ct);

        if (sources.Count == 0)
        {
            return new AgentResponse(
                Response: "I don't have any indexed code for this repository yet. " +
                          "Please trigger a `/ingest` run first.",
                AgentUsed: AgentType.Knowledge,
                Sources: [],
                TraceId: Guid.NewGuid().ToString(),
                LatencyMs: sw.ElapsedMilliseconds
            );
        }

        var contextBlock = string.Join("\n---\n",
            sources.Select(s => $"File: {s.FilePath}\n```\n{s.Content}\n```"));

        var chat = kernel.GetRequiredService<IChatCompletionService>();
        var history = new ChatHistory(SystemPrompt);
        history.AddUserMessage($"""
            CODEBASE CONTEXT:
            {contextBlock}

            QUESTION: {question}
            """);

        var result = await chat.GetChatMessageContentAsync(history, cancellationToken: ct);
        sw.Stop();

        logger.LogInformation(
            "Knowledge query answered in {Ms}ms with {N} sources", 
            sw.ElapsedMilliseconds, sources.Count);

        return new AgentResponse(
            Response: result.Content ?? string.Empty,
            AgentUsed: AgentType.Knowledge,
            Sources: sources,
            TraceId: Guid.NewGuid().ToString(),
            LatencyMs: sw.ElapsedMilliseconds
        );
    }
}
