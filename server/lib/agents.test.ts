import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getAgent, loadAgents } from './agents'

describe('loadAgents', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('reads each subdirectory as an agent keyed by directory name, with agent.md as its system prompt', () => {
    dir = mkdtempSync(join(tmpdir(), 'agents-test-'))
    mkdirSync(join(dir, 'orchestrator'))
    writeFileSync(join(dir, 'orchestrator', 'agent.md'), 'You are the orchestrator.\n')
    mkdirSync(join(dir, 'math-tutor'))
    writeFileSync(join(dir, 'math-tutor', 'agent.md'), 'You are a patient math tutor.\n')

    const agents = loadAgents(dir)

    expect(agents).toEqual({
      orchestrator: { systemPrompt: 'You are the orchestrator.' },
      'math-tutor': { systemPrompt: 'You are a patient math tutor.' },
    })
  })

  it('ignores non-directory entries in the agents directory', () => {
    dir = mkdtempSync(join(tmpdir(), 'agents-test-'))
    mkdirSync(join(dir, 'orchestrator'))
    writeFileSync(join(dir, 'orchestrator', 'agent.md'), 'You are the orchestrator.')
    writeFileSync(join(dir, 'README.md'), 'not an agent')

    const agents = loadAgents(dir)

    expect(Object.keys(agents)).toEqual(['orchestrator'])
  })
})

describe('getAgent', () => {
  it('returns the agent for a known name', () => {
    const agent = getAgent({ orchestrator: { systemPrompt: 'You are the orchestrator.' } }, 'orchestrator')

    expect(agent).toEqual({ systemPrompt: 'You are the orchestrator.' })
  })

  it('throws a clear error for an unknown agent name', () => {
    expect(() => getAgent({}, 'missing-agent')).toThrow('Unknown agent: missing-agent')
  })
})
