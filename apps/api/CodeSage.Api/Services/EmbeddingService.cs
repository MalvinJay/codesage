using Microsoft.SemanticKernel.Embeddings;

namespace CodeSage.Api.Services;

/// <summary>
/// Wraps SK's ITextEmbeddingGenerationService.
/// In free mode: Ollama nomic-embed-text (local, no cost).
/// In prod mode:  OpenAI text-embedding-3-small.
/// </summary>
public class EmbeddingService(
    ITextEmbeddingGenerationService embeddingGen,
    ILogger<EmbeddingService> logger)
{
    public async Task<float[]> EmbedAsync(string text, CancellationToken ct = default)
    {
        var result = await embeddingGen.GenerateEmbeddingAsync(text, cancellationToken: ct);
        return result.ToArray();
    }

    public async Task<List<float[]>> EmbedBatchAsync(
        IEnumerable<string> texts, CancellationToken ct = default)
    {
        var results = new List<float[]>();
        // Batch in groups of 20 to stay within rate limits
        foreach (var batch in texts.Chunk(20))
        {
            var embeddings = await embeddingGen.GenerateEmbeddingsAsync(
                batch.ToList(), cancellationToken: ct);
            results.AddRange(embeddings.Select(e => e.ToArray()));
        }
        return results;
    }

    /// <summary>
    /// Chunk source code by function/class boundaries (simple heuristic).
    /// Phase 2 replaces this with a proper tree-sitter parser.
    /// </summary>
    public static List<string> ChunkCode(string content, int maxTokens = 400)
    {
        var lines = content.Split('\n');
        var chunks = new List<string>();
        var current = new List<string>();
        var tokenEstimate = 0;

        foreach (var line in lines)
        {
            current.Add(line);
            tokenEstimate += line.Length / 4;  // rough token estimate

            // Flush on class/function boundaries or token limit
            var isBoundary = line.TrimStart().StartsWith("public ") ||
                             line.TrimStart().StartsWith("private ") ||
                             line.TrimStart().StartsWith("protected ") ||
                             line.TrimStart().StartsWith("class ") ||
                             line.TrimStart().StartsWith("interface ") ||
                             line.TrimStart().StartsWith("def ") ||
                             line.TrimStart().StartsWith("function ") ||
                             line.TrimStart().StartsWith("export ");

            if ((isBoundary && tokenEstimate > 100) || tokenEstimate >= maxTokens)
            {
                if (current.Count > 0)
                    chunks.Add(string.Join('\n', current));
                current.Clear();
                tokenEstimate = 0;
            }
        }

        if (current.Count > 0)
            chunks.Add(string.Join('\n', current));

        return chunks.Where(c => c.Trim().Length > 20).ToList();
    }
}
