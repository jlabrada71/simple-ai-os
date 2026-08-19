interface SessionResponse {
  authenticated: boolean
  user: { id: string; email: string; role: 'member' | 'admin' } | null
}

export function useAuth() {
  const isAuthenticated = useState<boolean>('tenant-authenticated', () => false)
  const user = useState<SessionResponse['user']>('tenant-user', () => null)
  const requestFetch = useRequestFetch()

  async function refresh() {
    const data = await requestFetch<SessionResponse>('/api/auth/session')
    isAuthenticated.value = data.authenticated
    user.value = data.user
  }

  return {
    isAuthenticated,
    user,
    refresh,
    logout: async () => {
      await $fetch('/api/auth/iam/logout', { method: 'POST' })
      isAuthenticated.value = false
      user.value = null
      await navigateTo('/')
    },
  }
}
