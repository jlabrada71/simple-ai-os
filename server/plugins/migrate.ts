import { defineNitroPlugin } from 'nitropack/runtime/plugin'
import { getHeader, createError } from 'h3'
import { runPublicMigrations } from '../utils/migrate'

export default defineNitroPlugin((nitroApp) => {
  let migrationPromise: Promise<void> | null = null

  nitroApp.hooks.hook('request', async (event) => {
    // Nitro tags its own build-time prerender crawl requests with this
    // header - those happen inside `nuxt build` itself, not on the real
    // deployed server, and must not trigger a live DB connection during
    // the build.
    if (getHeader(event, 'x-nitro-prerender')) return

    if (!migrationPromise) {
      migrationPromise = runPublicMigrations(useStorage('assets:migrationsPublic'))
        .then(() => console.log('Public schema migrations applied'))
        .catch((error) => {
          console.error('Public schema migration failed:', error)
          // Reset so the next request retries rather than staying wedged
          // forever if the database recovers before a redeploy happens.
          migrationPromise = null
          throw error
        })
    }

    try {
      await migrationPromise
    } catch {
      // A DB outage must fail this one request, not take down the whole
      // process - see docs/learnings/learnings.md for what happens when a
      // per-request hook calls process.exit() instead.
      throw createError({
        statusCode: 503,
        statusMessage: 'Service temporarily unavailable: database migration failed',
      })
    }
  })
})
