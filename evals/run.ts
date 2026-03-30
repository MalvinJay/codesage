import { Factuality } from 'autoevals'
import { writeFile } from 'node:fs/promises'
import { evalCases, type EvalCase } from './cases/eval-cases.js'

const API_BASE = process.env.CODESAGE_API_URL ?? 'http://localhost:5000'
const BRAINTRUST_API_KEY = process.env.BRAINTRUST_API_KEY?.trim() ?? ''
const IS_CI = process.argv.includes('--ci')
const HAS_BRAINTRUST_API_KEY =
  BRAINTRUST_API_KEY.length > 0
  && !BRAINTRUST_API_KEY.startsWith('YOUR_')
const JUDGE_PROVIDER = (process.env.EVAL_JUDGE_PROVIDER ?? 'openai').trim().toLowerCase()
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL?.trim()
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL?.trim()
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim()
const JUDGE_BASE_URL =
  process.env.EVAL_JUDGE_BASE_URL?.trim()
  ?? (JUDGE_PROVIDER === 'ollama' ? 'http://localhost:11434/v1' : OPENAI_BASE_URL)
const JUDGE_API_KEY =
  process.env.EVAL_JUDGE_API_KEY?.trim()
  ?? (JUDGE_PROVIDER === 'ollama' ? (OPENAI_API_KEY || 'ollama') : OPENAI_API_KEY)
const SUPPORTS_FACTUALITY_JUDGE = JUDGE_PROVIDER !== 'ollama'

// Quality gate threshold: what pass-rate blocks the deploy in CI
const PASS_RATE_THRESHOLD = 0.82   // 82% — raise as the system matures

// ── Call the CodeSage API ─────────────────────────────────────────────────────

async function callAgent(input: string, agent: EvalCase['agent']): Promise<string> {
  const response = await fetch(`${API_BASE}/api/agent/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: input, agent }),
  })

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${await response.text()}`)
  }

  const json = await response.json() as { response: string }
  return json.response
}

// ── Heuristic scorer — fast, cheap, no LLM call ───────────────────────────────

function heuristicScore(output: string, expected: EvalCase): {
  passed: boolean; reason: string
} {
  const lower = output.toLowerCase()

  // Must contain all expected terms
  const missing = expected.expectedContains.filter(term => !lower.includes(term.toLowerCase()))
  if (missing.length > 0) {
    return { passed: false, reason: `Missing expected terms: ${missing.join(', ')}` }
  }

  // Must not contain excluded terms
  const found = expected.expectedExcludes?.filter(term => lower.includes(term.toLowerCase())) ?? []
  if (found.length > 0) {
    return { passed: false, reason: `Contains excluded terms: ${found.join(', ')}` }
  }

  // Basic length sanity — reject empty or absurdly short responses
  if (output.trim().length < 40) {
    return { passed: false, reason: 'Response too short (< 40 chars)' }
  }

  return { passed: true, reason: 'All heuristic checks passed' }
}

// ── Main eval run ─────────────────────────────────────────────────────────────

async function runEvals() {
  console.log(`\n🔍 CodeSage eval run — ${evalCases.length} cases`)
  console.log(`   API: ${API_BASE}`)
  console.log(`   Braintrust scoring: ${HAS_BRAINTRUST_API_KEY ? 'enabled' : 'disabled'}`)
  console.log(`   Judge provider: ${JUDGE_PROVIDER}${JUDGE_MODEL ? ` (${JUDGE_MODEL})` : ''}`)
  console.log(`   CI mode: ${IS_CI}\n`)

  let passed = 0
  let failed = 0
  const failures: string[] = []
  let braintrustScoringEnabled = HAS_BRAINTRUST_API_KEY && SUPPORTS_FACTUALITY_JUDGE
  let hasWarnedAboutBraintrust = false

  if (HAS_BRAINTRUST_API_KEY && !SUPPORTS_FACTUALITY_JUDGE) {
    console.log('   Factuality judge skipped: Ollama is not supported by autoevals Factuality; using heuristic checks only.\n')
  }

  for (const evalCase of evalCases) {
    process.stdout.write(`  [${evalCase.id}] ${evalCase.input.slice(0, 60).replace(/\n/g, ' ')}… `)

    let output: string
    try {
      output = await callAgent(evalCase.input, evalCase.agent)
    } catch (err) {
      console.log('❌ API error')
      failed++
      failures.push(`${evalCase.id}: API error — ${err}`)
      continue
    }

    // Heuristic check (fast, always runs)
    const heuristic = heuristicScore(output, evalCase)

    // LLM-as-judge (Braintrust Factuality scorer) — only if Braintrust key set
    let factualityScore = 1.0
    if (braintrustScoringEnabled) {
      try {
        const factualityArgs: {
          input: string
          output: string
          expected: string
          model?: string
          openAiBaseUrl?: string
          openAiApiKey?: string
        } = {
          input: evalCase.input,
          output,
          expected: evalCase.expectedContains.join(', '),
        }

        if (JUDGE_MODEL) {
          factualityArgs.model = JUDGE_MODEL
        }

        if (JUDGE_BASE_URL) {
          factualityArgs.openAiBaseUrl = JUDGE_BASE_URL
        }

        if (JUDGE_API_KEY) {
          factualityArgs.openAiApiKey = JUDGE_API_KEY
        }

        const result = await Factuality(factualityArgs)
        factualityScore = result.score ?? 1.0
      } catch (error) {
        factualityScore = 0.5  // conservative on scorer failure
        braintrustScoringEnabled = false

        if (!hasWarnedAboutBraintrust) {
          const message = error instanceof Error ? error.message : String(error)
          console.warn(`\n   Braintrust scoring disabled after scorer error: ${message}`)
          hasWarnedAboutBraintrust = true
        }
      }
    }

    const combinedPass = heuristic.passed && factualityScore >= 0.5

    if (combinedPass) {
      passed++
      console.log('✅')
    } else {
      failed++
      const reason = !heuristic.passed
        ? heuristic.reason
        : `Factuality score ${factualityScore.toFixed(2)} < 0.5`
      console.log(`❌  (${reason})`)
      failures.push(`${evalCase.id}: ${reason}`)
    }
  }


  // ── Summary ────────────────────────────────────────────────────────────────

  const total = passed + failed
  const passRate = passed / total
  const pct = (passRate * 100).toFixed(1)

  console.log('\n' + '─'.repeat(60))
  console.log(`  Results: ${passed}/${total} passed (${pct}%)`)
  console.log(`  Threshold: ${(PASS_RATE_THRESHOLD * 100).toFixed(0)}%`)

  if (failures.length > 0) {
    console.log('\n  Failures:')
    failures.forEach(f => console.log(`    • ${f}`))
  }

  const gatePass = passRate >= PASS_RATE_THRESHOLD
  console.log(`\n  Quality gate: ${gatePass ? '✅ PASSED' : '❌ FAILED'}`)

  if (IS_CI) {
    // Write results for GitHub Actions summary
    const summary = {
      passRate,
      passed,
      failed,
      total,
      gatePass,
      threshold: PASS_RATE_THRESHOLD,
      failures,
      timestamp: new Date().toISOString(),
    }
    await writeFile('eval-results.json', JSON.stringify(summary, null, 2))

    if (!gatePass) {
      console.error('\n❌ Eval gate failed — blocking deploy')
      process.exit(1)
    }
  }

  console.log('─'.repeat(60) + '\n')
}

runEvals().catch(err => {
  console.error('Eval runner crashed:', err)
  process.exit(1)
})
