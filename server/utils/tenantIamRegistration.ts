export interface RegisterTenantIamAppInput {
  appName: string
  slug: string
}

export interface RegisteredTenantIamApp {
  appId: string
  clientSecret: string
  authenticatedUrl: string
  notAuthenticatedUrl: string
}

function tenantOrigin(slug: string): string {
  const isDev = process.env.NODE_ENV !== 'production'
  return isDev ? `http://${slug}.localhost:3000` : `https://${slug}.simple-ai-os.tryyourideas.com`
}

export async function registerTenantIamApp(input: RegisterTenantIamAppInput): Promise<RegisteredTenantIamApp> {
  const iamUrl = (process.env.NUXT_IAM_URL || '').replace(/\/+$/, '')
  const clientId = process.env.NUXT_IAM_CLIENT_ID || ''
  const clientApiSecret = process.env.NUXT_IAM_CLIENT_API_SECRET || ''

  const origin = tenantOrigin(input.slug)
  const authenticatedUrl = `${origin}/authenticated`
  const notAuthenticatedUrl = `${origin}/not-authenticated`

  const response = await fetch(`${iamUrl}/api/clients/${clientId}/apps`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${clientApiSecret}`,
    },
    body: JSON.stringify({ appName: input.appName, authenticatedUrl, notAuthenticatedUrl }),
  })

  if (!response.ok) {
    const error = (await response.json()) as { message?: string }
    throw new Error(error.message || `iam app registration failed with status ${response.status}`)
  }

  const data = (await response.json()) as {
    appId: string
    authenticatedUrl: string
    notAuthenticatedUrl: string
    clientSecret: string
  }

  return {
    appId: data.appId,
    clientSecret: data.clientSecret,
    authenticatedUrl: data.authenticatedUrl,
    notAuthenticatedUrl: data.notAuthenticatedUrl,
  }
}
