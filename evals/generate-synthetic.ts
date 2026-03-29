/**
 * Generates synthetic eval cases by prompting an LLM to create paraphrases
 * and edge-case variants of real thumbs-down examples.
 *
 * Usage:
 *   GROQ_API_KEY=xxx npm run generate-synthetic
 *
 * Output: appends to cases/synthetic-cases.json (commit this file)
 */

import { evalCases } from './cases/eval-cases.js'
import { writeFileSync, existsSync, readFileSync } from 'fs'

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
const OUTPUT_FILE = './cases/synthetic-cases.json'

const GENERATOR_PROMPT = `You are an eval dataset generator for an AI code assistant.
Given a real eval case, generate 3 paraphrase/variant versions that test the same capability.
Each variant should:
- Rephrase the question naturally
- Test the same underlying concept
- Be realistic (something a developer would actually ask)

Return ONLY valid JSON — an array of objects with fields: input, expectedContains (array of strings), tags (array).
No markdown fences, no explanation.`

async function generateVariants(input: string, expectedContains: string[], agent: string) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 800,
      messages: [
        { role: 'system', content: GENERATOR_PROMPT },
        {
          role: 'user',
          content: `Original case:\nInput: "${input}"\nExpected to contain: ${expectedContains.join(', ')}\nAgent: ${agent}\n\nGenerate 3 variants:`,
        },
      ],
    }),
  })

  const json = await response.json() as { choices: Array<{ message: { content: string } }> }
  const raw = json.choices[0].message.content.trim()

  try {
    return JSON.parse(raw) as Array<{ input: string; expectedContains: string[]; tags: string[] }>
  } catch {
    console.warn('  Failed to parse LLM response, skipping')
    return []
  }
}

async function main() {
  if (!GROQ_API_KEY) {
    console.error('Set GROQ_API_KEY to generate synthetic cases')
    process.exit(1)
  }

  const existing = existsSync(OUTPUT_FILE)
    ? JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8')) as unknown[]
    : []

  const humanCases = evalCases.filter(c => c.source === 'human')
  console.log(`Generating variants for ${humanCases.length} human cases…\n`)

  const synthetic: unknown[] = [...existing]
  let counter = existing.length + 1

  for (const evalCase of humanCases) {
    process.stdout.write(`  ${evalCase.id}… `)
    const variants = await generateVariants(
      evalCase.input,
      evalCase.expectedContains,
      evalCase.agent
    )

    for (const v of variants) {
      synthetic.push({
        id: `synthetic-${String(counter).padStart(3, '0')}`,
        input: v.input,
        expectedContains: v.expectedContains,
        agent: evalCase.agent,
        source: 'synthetic',
        tags: [...evalCase.tags, ...(v.tags ?? [])],
        derivedFrom: evalCase.id,
      })
      counter++
    }

    console.log(`✅ +${variants.length} variants`)
    await new Promise(r => setTimeout(r, 500))  // rate limit
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(synthetic, null, 2))
  console.log(`\nWrote ${synthetic.length} cases to ${OUTPUT_FILE}`)
}

main().catch(console.error)
