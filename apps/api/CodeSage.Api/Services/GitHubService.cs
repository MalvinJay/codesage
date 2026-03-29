using Octokit;

namespace CodeSage.Api.Services;

public class GitHubService
{
    private readonly GitHubClient _client;
    private readonly ILogger<GitHubService> _logger;

    public GitHubService(IConfiguration config, ILogger<GitHubService> logger)
    {
        _logger = logger;
        _client = new GitHubClient(new ProductHeaderValue("codesage"));

        var token = config["GitHub:Token"];
        if (!string.IsNullOrEmpty(token))
            _client.Credentials = new Credentials(token);
    }

    public async Task<string> GetPrDiffAsync(
        string owner, string repo, int prNumber, CancellationToken ct = default)
    {
        var pr = await _client.PullRequest.Get(owner, repo, prNumber);
        var files = await _client.PullRequest.Files(owner, repo, prNumber);

        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"PR #{prNumber}: {pr.Title}");
        sb.AppendLine($"Author: {pr.User.Login}");
        sb.AppendLine($"Base: {pr.Base.Ref} ← Head: {pr.Head.Ref}");
        sb.AppendLine($"Description: {pr.Body ?? "(none)"}");
        sb.AppendLine();

        foreach (var file in files.Take(20))  // cap at 20 files
        {
            sb.AppendLine($"--- {file.FileName} ({file.Status}, +{file.Additions}/-{file.Deletions})");
            if (!string.IsNullOrEmpty(file.Patch))
                sb.AppendLine(file.Patch);
            sb.AppendLine();
        }

        return sb.ToString();
    }

    public async Task<IReadOnlyList<RepositoryContent>> GetRepoFilesAsync(
        string owner, string repo, string path = "", string branch = "main",
        CancellationToken ct = default)
    {
        return await _client.Repository.Content.GetAllContentsByRef(
            owner, repo, path, branch);
    }

    public async Task<string> GetFileContentAsync(
        string owner, string repo, string filePath, string branch = "main",
        CancellationToken ct = default)
    {
        var contents = await _client.Repository.Content.GetAllContentsByRef(
            owner, repo, filePath, branch);
        return contents.FirstOrDefault()?.Content ?? string.Empty;
    }
}
