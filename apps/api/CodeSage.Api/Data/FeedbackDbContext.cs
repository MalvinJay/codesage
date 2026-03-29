using CodeSage.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CodeSage.Api.Data;

public class FeedbackRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string TraceId { get; set; } = string.Empty;
    public string Query { get; set; } = string.Empty;
    public string Response { get; set; } = string.Empty;
    public string AgentUsed { get; set; } = string.Empty;
    public FeedbackSignal Signal { get; set; }
    public string? Comment { get; set; }
    public string? RetrievedContext { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Populated after eval scoring
    public double? CorrectnessScore { get; set; }
    public double? RelevanceScore { get; set; }
    public bool? EvalPassed { get; set; }
}

public class FeedbackDbContext(DbContextOptions<FeedbackDbContext> options) 
    : DbContext(options)
{
    public DbSet<FeedbackRecord> FeedbackRecords => Set<FeedbackRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<FeedbackRecord>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.TraceId);
            e.HasIndex(x => x.Signal);
            e.HasIndex(x => x.CreatedAt);
            e.Property(x => x.Signal).HasConversion<string>();
        });
    }
}
