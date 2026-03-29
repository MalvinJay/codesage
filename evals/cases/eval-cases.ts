// Eval dataset: mix of human-curated and synthetic cases
// Add real thumbs-down cases here as you collect them from production.
// Run `npm run generate-synthetic` to expand this with LLM-authored variants.

export interface EvalCase {
  id: string
  input: string
  expectedContains: string[]   // response must contain ALL of these
  expectedExcludes?: string[]  // response must NOT contain any of these
  agent: 'Knowledge' | 'CodeReview' | 'PrGeneration'
  source: 'human' | 'synthetic'
  tags: string[]
}

export const evalCases: EvalCase[] = [
  // ── Knowledge agent ──────────────────────────────────────────────────────
  {
    id: 'know-001',
    input: 'Where is authentication handled?',
    expectedContains: ['middleware', 'auth'],
    expectedExcludes: ['I don\'t know'],
    agent: 'Knowledge',
    source: 'human',
    tags: ['auth', 'architecture'],
  },
  {
    id: 'know-002',
    input: 'How does the rate limiter work?',
    expectedContains: ['rate', 'limit'],
    agent: 'Knowledge',
    source: 'human',
    tags: ['rate-limit', 'middleware'],
  },
  {
    id: 'know-003',
    input: 'What database is used for storing feedback?',
    expectedContains: ['postgres', 'postgresql', 'feedback'],
    agent: 'Knowledge',
    source: 'human',
    tags: ['database', 'feedback'],
  },
  {
    id: 'know-004',
    input: 'Where are the Semantic Kernel agents defined?',
    expectedContains: ['agent', 'kernel'],
    agent: 'Knowledge',
    source: 'synthetic',
    tags: ['sk', 'architecture'],
  },
  {
    id: 'know-005',
    input: 'How are embeddings generated in this codebase?',
    expectedContains: ['embedding', 'vector'],
    agent: 'Knowledge',
    source: 'synthetic',
    tags: ['embeddings', 'rag'],
  },

  // ── Code review agent ────────────────────────────────────────────────────
  {
    id: 'review-001',
    input: `Review this code:
\`\`\`csharp
public string GetUser(string id) {
    var sql = "SELECT * FROM users WHERE id = " + id;
    return db.Execute(sql);
}
\`\`\``,
    expectedContains: ['sql injection', 'parameterized', 'security'],
    agent: 'CodeReview',
    source: 'human',
    tags: ['security', 'sql-injection'],
  },
  {
    id: 'review-002',
    input: `Review this TypeScript:
\`\`\`typescript
async function fetchData() {
    const res = await fetch('/api/data')
    const json = await res.json()
    return json
}
\`\`\``,
    expectedContains: ['error', 'catch', 'status'],
    agent: 'CodeReview',
    source: 'human',
    tags: ['error-handling', 'typescript'],
  },
  {
    id: 'review-003',
    input: `Review this C#:
\`\`\`csharp
public async Task<List<User>> GetAllUsers() {
    return await _db.Users.ToListAsync();
}
\`\`\``,
    expectedContains: ['pagination', 'performance', 'large'],
    agent: 'CodeReview',
    source: 'synthetic',
    tags: ['performance', 'database'],
  },
]
