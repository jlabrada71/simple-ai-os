export default defineNuxtRouteMiddleware(async (to) => {
  const { isAuthenticated, refresh } = useAuth()
  await refresh()

  if (!isAuthenticated.value) {
    return navigateTo('/login', { query: { redirect: to.fullPath } })
  }
})
