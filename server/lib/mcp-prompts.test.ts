import { describe, expect, it } from 'vitest'
import { interpolate } from './mcp-prompts'

describe('interpolate', () => {
  it('substitutes a provided value', () => {
    expect(interpolate('Hello, {{name}}!', { name: 'Ada' })).toBe('Hello, Ada!')
  })

  it('leaves an unmatched placeholder untouched', () => {
    expect(interpolate('Hello, {{name}}!', {})).toBe('Hello, {{name}}!')
  })

  it('handles multiple distinct placeholders', () => {
    expect(interpolate('{{greeting}}, {{name}}!', { greeting: 'Hi', name: 'Ada' })).toBe('Hi, Ada!')
  })

  it('handles a placeholder appearing more than once', () => {
    expect(interpolate('{{name}} and {{name}} again', { name: 'Ada' })).toBe('Ada and Ada again')
  })
})
