interface ThreadSummary {
  id: string
  title: string | null
  updatedAt: string
}

interface ThreadMessage {
  role: 'user' | 'assistant'
  content: string
}

export function useThreads() {
  const threads = useState<ThreadSummary[]>('threads-list', () => [])
  const activeThreadId = useState<string | null>('threads-active-id', () => null)

  async function refreshThreads() {
    const data = await $fetch<{ threads: ThreadSummary[] }>('/api/threads')
    threads.value = data.threads
  }

  async function ensureActiveThread(): Promise<string> {
    if (activeThreadId.value) return activeThreadId.value
    const created = await $fetch<{ id: string }>('/api/threads', { method: 'POST' })
    activeThreadId.value = created.id
    await refreshThreads()
    return created.id
  }

  async function selectThread(id: string): Promise<ThreadMessage[]> {
    const data = await $fetch<{ messages: ThreadMessage[] }>(`/api/threads/${id}/messages`)
    activeThreadId.value = id
    return data.messages
  }

  function startNewThread() {
    activeThreadId.value = null
  }

  return { threads, activeThreadId, refreshThreads, ensureActiveThread, selectThread, startNewThread }
}
