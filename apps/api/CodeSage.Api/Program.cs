using CodeSage.Api.Agents;
using CodeSage.Api.Data;
using CodeSage.Api.Middleware;
using CodeSage.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.SemanticKernel;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using OpenAI;
using System.ClientModel;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// ── Controllers & OpenAPI ────────────────────────────────────────────────────
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });
builder.Services.AddEndpointsApiExplorer();

// ── CORS (allow React dev server) ────────────────────────────────────────────
builder.Services.AddCors(options =>
{
    options.AddPolicy("DevCors", policy =>
        policy.WithOrigins("http://localhost:5173", "https://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod());
});

// ── Database (PostgreSQL via EF Core) ────────────────────────────────────────
builder.Services.AddDbContext<FeedbackDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Feedback")));

// ── Semantic Kernel ──────────────────────────────────────────────────────────
// Swap Groq (free) ↔ OpenAI (prod) via config flag
var useProdLlm = builder.Configuration.GetValue<bool>("Features:UseProdLlm");
var openAiApiKey = builder.Configuration["OpenAI:ApiKey"];
var groqApiKey = builder.Configuration["Groq:ApiKey"];
var hasOpenAiApiKey = !string.IsNullOrWhiteSpace(openAiApiKey);
builder.Services.AddKernel();

if (useProdLlm)
{
    builder.Services.AddOpenAIChatCompletion(
        modelId: "gpt-4o",
        apiKey: openAiApiKey!);

    builder.Services.AddOpenAITextEmbeddingGeneration(
        modelId: "text-embedding-3-small",
        apiKey: openAiApiKey!);
}
else
{
    // Groq is OpenAI-compatible — point at their endpoint
    builder.Services.AddOpenAIChatCompletion(
        modelId: "llama-3.3-70b-versatile",
        apiKey: groqApiKey!,
        endpoint: new Uri("https://api.groq.com/openai/v1"));

    // Local Ollama for embeddings (nomic-embed-text — free, no API key)
    builder.Services.AddOpenAITextEmbeddingGeneration(
        modelId: "nomic-embed-text",
        openAIClient: new OpenAIClient(
            new ApiKeyCredential("ollama"),
            new OpenAIClientOptions
            {
                Endpoint = new Uri("http://localhost:11434/v1")
            }));    
    // if (hasOpenAiApiKey)
    // {
    //     builder.Services.AddOpenAITextEmbeddingGeneration(
    //         modelId: "text-embedding-3-small",
    //         apiKey: openAiApiKey!);
    // }
    // else
    // {

    // }
}

// ── Application services ─────────────────────────────────────────────────────
builder.Services.AddSingleton<WeaviateService>();
builder.Services.AddScoped<EmbeddingService>();
builder.Services.AddScoped<FeedbackService>();
builder.Services.AddScoped<GitHubService>();

// ── Agents (SK plugins) ──────────────────────────────────────────────────────
builder.Services.AddScoped<CodeReviewAgent>();
builder.Services.AddScoped<KnowledgeAgent>();
builder.Services.AddScoped<PrGenerationAgent>();
builder.Services.AddScoped<AgentOrchestrator>();

// ── OpenTelemetry (Traceloop-compatible OTLP) ────────────────────────────────
var otlpEndpoint = builder.Configuration["Traceloop:OtlpEndpoint"] 
    ?? "https://api.traceloop.com/v1/traces";

builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService("codesage-api"))
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddOtlpExporter(otlp =>
        {
            otlp.Endpoint = new Uri(otlpEndpoint);
            otlp.Headers = $"Authorization=Bearer {builder.Configuration["Traceloop:ApiKey"]}";
        }));

// ── HttpClient (for GitHub, Groq, etc.) ─────────────────────────────────────
builder.Services.AddHttpClient();

var app = builder.Build();

// ── Middleware pipeline ───────────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
{
    app.UseCors("DevCors");
}

app.UseMiddleware<ApiKeyMiddleware>();
app.UseAuthorization();
app.MapControllers();

// ── Health check endpoint ────────────────────────────────────────────────────
app.MapGet("/health", () => Results.Ok(new { status = "healthy", ts = DateTime.UtcNow }))
   .AllowAnonymous();

// ── Auto-apply EF migrations on startup ──────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    try
    {
        var db = scope.ServiceProvider.GetRequiredService<FeedbackDbContext>();
        db.Database.Migrate();
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine(
            $"Skipping feedback database migration during startup. The API will still run, but feedback endpoints may fail until PostgreSQL is configured correctly. {ex.GetType().Name}: {ex.Message}");
    }
}

app.Run();
