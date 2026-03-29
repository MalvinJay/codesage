using CodeSage.Api.Models;
using CodeSage.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Octokit;

namespace CodeSage.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class IngestController(
    GitHubService github,
    WeaviateService weaviate,
    EmbeddingService embedding,
    ILogger<IngestController> logger) : ControllerBase
{
    private static readonly HashSet<string> SupportedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".cs", ".ts", ".tsx", ".js", ".jsx", ".py", ".go",
        ".java", ".md", ".yaml", ".yml", ".json"
    };

    /// <summary>
    /// Ingests a GitHub repo into Weaviate — chunks files and stores embeddings.
    /// POST /api/ingest
    /// This is Phase 1 of CodeSage. Swap the GitHub traversal with a webhook in Phase 2.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<IngestResult>> IngestAsync(
        [FromBody] IngestRequest request, CancellationToken ct)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        await weaviate.EnsureSchemaAsync(ct);

        int filesProcessed = 0, chunksCreated = 0;

        logger.LogInformation(
            "Starting ingestion of {Owner}/{Repo}@{Branch}",
            request.RepoOwner, request.RepoName, request.Branch);

        var files = await TraverseRepoAsync(
            request.RepoOwner, request.RepoName, "", request.Branch, ct);

        foreach (var file in files)
        {
            var ext = Path.GetExtension(file.Name);
            if (!SupportedExtensions.Contains(ext)) continue;
            if (request.PathFilter?.Length > 0 &&
                !request.PathFilter.Any(f => file.Path.StartsWith(f))) continue;

            string content;
            try
            {
                content = await github.GetFileContentAsync(
                    request.RepoOwner, request.RepoName, file.Path, request.Branch, ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Skipping {Path}", file.Path);
                continue;
            }

            // Decode base64 content from GitHub API
            if (!string.IsNullOrEmpty(content))
            {
                try { content = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(content)); }
                catch { /* already plain text */ }
            }

            var chunks = EmbeddingService.ChunkCode(content);
            var vectors = await embedding.EmbedBatchAsync(chunks, ct);

            for (int i = 0; i < chunks.Count; i++)
            {
                await weaviate.UpsertCodeChunkAsync(
                    filePath: file.Path,
                    repoOwner: request.RepoOwner,
                    repoName: request.RepoName,
                    branch: request.Branch,
                    content: chunks[i],
                    language: ext.TrimStart('.'),
                    chunkIndex: i,
                    vector: vectors[i],
                    commitSha: "manual",
                    ct: ct);
                chunksCreated++;
            }

            filesProcessed++;
            logger.LogDebug("Ingested {Path} → {N} chunks", file.Path, chunks.Count);
        }

        sw.Stop();
        logger.LogInformation(
            "Ingestion complete: {Files} files, {Chunks} chunks in {Elapsed}",
            filesProcessed, chunksCreated, sw.Elapsed);

        return Ok(new IngestResult(filesProcessed, chunksCreated, 0, sw.Elapsed));
    }

    private async Task<List<RepositoryContent>> TraverseRepoAsync(
        string owner, string repo, string path, string branch, CancellationToken ct)
    {
        var all = new List<RepositoryContent>();
        var items = await github.GetRepoFilesAsync(owner, repo, path, branch, ct);

        foreach (var item in items)
        {
            if (item.Type.Value == ContentType.File)
                all.Add(item);
            else if (item.Type.Value == ContentType.Dir)
            {
                // Skip heavy dirs
                if (item.Name is "node_modules" or "bin" or "obj" or ".git" or "dist") continue;
                var children = await TraverseRepoAsync(owner, repo, item.Path, branch, ct);
                all.AddRange(children);
            }
        }

        return all;
    }
}
