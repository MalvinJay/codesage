namespace CodeSage.Api.Middleware;

/// <summary>
/// Simple API key check — disabled in dev (Features:RequireApiKey = false).
/// In prod, set CODESAGE_API_KEY env var and pass X-Api-Key header.
/// </summary>
public class ApiKeyMiddleware(RequestDelegate next, IConfiguration config)
{
    private const string ApiKeyHeader = "X-Api-Key";

    public async Task InvokeAsync(HttpContext context)
    {
        // Always allow health checks and OpenAPI spec
        if (context.Request.Path.StartsWithSegments("/health") ||
            context.Request.Path.StartsWithSegments("/openapi"))
        {
            await next(context);
            return;
        }

        var requireApiKey = config.GetValue<bool>("Features:RequireApiKey");
        if (!requireApiKey)
        {
            await next(context);
            return;
        }

        var expectedKey = config["ApiKey"];
        if (string.IsNullOrEmpty(expectedKey))
        {
            await next(context);
            return;
        }

        if (!context.Request.Headers.TryGetValue(ApiKeyHeader, out var providedKey) ||
            providedKey != expectedKey)
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new { error = "Invalid or missing API key." });
            return;
        }

        await next(context);
    }
}
