export function interpolate(content: string, args: Record<string, string | undefined>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => args[key] ?? match)
}
