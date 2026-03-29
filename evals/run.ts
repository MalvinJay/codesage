import * as braintrust from 'braintrust'
import { Factuality, Levenshtein } from 'autoevals'
import { writeFile } from 'node:fs/promises'
import { evalCases, type EvalCase } from './cases/eval-cases.js'

const API_BASE = process.env.CODESAGE_API_URL ?? 'http://localhost:5000'
const BRAINTRUST_API_KEY = process.env.BRAINTRUST_API_KEY ?? ''
const IS_CI = process.argv.includes('--ci')

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
  console.log(`   CI mode: ${IS_CI}\n`)

  const experiment = braintrust.init('codesage', {
    apiKey: BRAINTRUST_API_KEY || undefined,
  })

  let passed = 0
  let failed = 0
  const failures: string[] = []

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
    if (BRAINTRUST_API_KEY) {
      try {
        const result = await Factuality({
          input: evalCase.input,
          output,
          expected: evalCase.expectedContains.join(', '),
        })
        factualityScore = result.score ?? 1.0
      } catch {
        factualityScore = 0.5  // conservative on scorer failure
      }
    }

    const combinedPass = heuristic.passed && factualityScore >= 0.5

    // Log to Braintrust experiment
    experiment.log({
      input: evalCase.input,
      output,
      expected: evalCase.expectedContains.join(' | '),
      scores: {
        heuristic: heuristic.passed ? 1 : 0,
        factuality: factualityScore,
        combined: combinedPass ? 1 : 0,
      },
      metadata: {
        caseId: evalCase.id,
        agent: evalCase.agent,
        source: evalCase.source,
        tags: evalCase.tags,
        heuristicReason: heuristic.reason,
      },
    })

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

  await experiment.flush()

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
