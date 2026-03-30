using CodeSage.Api.Models;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace CodeSage.Api.Services;

/// <summary>
/// Thin wrapper over Weaviate REST API for storing and retrieving code/doc chunks.
/// Uses the v4 REST API directly to avoid heavy SDK dependencies.
/// </summary>
public class WeaviateService
{
    private readonly HttpClient _http;
    private readonly string _baseUrl;
    private readonly ILogger<WeaviateService> _logger;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public WeaviateService(IHttpClientFactory factory, IConfiguration config, 
        ILogger<WeaviateService> logger)
    {
        _logger = logger;
        _baseUrl = config["Weaviate:Endpoint"]!.TrimEnd('/');
        _http = factory.CreateClient();

        var apiKey = config["Weaviate:ApiKey"];
        if (!string.IsNullOrEmpty(apiKey))
            _http.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");
    }

    // ── Schema bootstrap ──────────────────────────────────────────────────────

    public async Task EnsureSchemaAsync(CancellationToken ct = default)
    {
        await EnsureClassAsync("CodeChunk", new[]
        {
            ("filePath", "text"),
            ("repoOwner", "text"),
            ("repoName", "text"),
            ("branch", "text"),
            ("language", "text"),
            ("content", "text"),
            ("chunkIndex", "int"),
            ("commitSha", "text")
        }, ct);

        await EnsureClassAsync("DocChunk", new[]
        {
            ("filePath", "text"),
            ("title", "text"),
            ("content", "text"),
            ("chunkIndex", "int")
        }, ct);
    }

    private async Task EnsureClassAsync(string className, 
        (string name, string dataType)[] properties, CancellationToken ct)
    {
        var response = await _http.GetAsync($"{_baseUrl}/v1/schema/{className}", ct);
        if (response.IsSuccessStatusCode) return;

        var schema = new
        {
            @class = className,
            vectorizer = "none",  // we supply vectors ourselves
            properties = properties.Select(p => new
            {
                name = p.name,
                dataType = new[] { p.dataType }
            })
        };

        var result = await _http.PostAsJsonAsync($"{_baseUrl}/v1/schema", schema, JsonOpts, ct);
        result.EnsureSuccessStatusCode();
        _logger.LogInformation("Created Weaviate class {Class}", className);
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    public async Task UpsertCodeChunkAsync(
        string filePath, string repoOwner, string repoName, string branch,
        string content, string language, int chunkIndex, float[] vector,
        string commitSha, CancellationToken ct = default)
    {
        var obj = new
        {
            @class = "CodeChunk",
            properties = new
            {
                filePath, repoOwner, repoName, branch, 
                content, language, chunkIndex, commitSha
            },
            vector
        };

        await _http.PostAsJsonAsync($"{_baseUrl}/v1/objects", obj, JsonOpts, ct);
    }

    // ── Query ─────────────────────────────────────────────────────────────────

    public async Task<List<SourceChunk>> QueryAsync(
        float[] queryVector, string? repoFilter = null, 
        int limit = 5, CancellationToken ct = default)
    {
        var whereClause = repoFilter is not null
            ? $$"""
              ,
              where: {
                path: ["repoName"],
                operator: Equal,
                valueText: "{{repoFilter}}"
              }
              """
            : "";

        var gql = $$"""
            {
              Get {
                CodeChunk(
                  nearVector: { vector: [{{string.Join(",", queryVector)}}] }
                  limit: {{limit}}
                  {{whereClause}}
                ) {
                  filePath content _additional { distance }
                }
              }
            }
            """;

        var payload = new { query = gql };
        var response = await _http.PostAsJsonAsync($"{_baseUrl}/v1/graphql", payload, JsonOpts, ct);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            throw new HttpRequestException(
                $"Weaviate query failed with {(int)response.StatusCode} ({response.ReasonPhrase}). Body: {body}");
        }

        var json = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
        var chunks = new List<SourceChunk>();

        foreach (var item in json
            .GetProperty("data").GetProperty("Get").GetProperty("CodeChunk")
            .EnumerateArray())
        {
            chunks.Add(new SourceChunk(
                FilePath: item.GetProperty("filePath").GetString()!,
                Content: item.GetProperty("content").GetString()!,
                Score: item.GetProperty("_additional").GetProperty("distance").GetDouble()
            ));
        }

        return chunks;
    }
}
