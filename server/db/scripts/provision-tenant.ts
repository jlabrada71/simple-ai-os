import { provisionTenant } from '../../lib/provisionTenant'

function parseArgs(): { slug: string; name: string } {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const index = args.indexOf(flag)
    return index === -1 ? undefined : args[index + 1]
  }

  const slug = get('--slug')
  const name = get('--name')

  if (!slug || !name) {
    console.error('Usage: npm run db:provision-tenant -- --slug <slug> --name "<Company Name>"')
    process.exit(1)
  }

  return { slug, name }
}

async function main() {
  const { slug, name } = parseArgs()
  const result = await provisionTenant({ slug, name })

  if (result.alreadyExisted) {
    console.log(`Tenant "${slug}" was already provisioned (schema "${result.schemaName}")`)
    return
  }

  console.log(`Tenant "${slug}" provisioned with schema "${result.schemaName}"`)
  console.log('No owner user was seeded - the first person to complete SSO login becomes the tenant owner (role: member; promote to admin manually - see docs/backlog.md).')
}

main().catch((error) => {
  console.error('Tenant provisioning failed:', error)
  process.exit(1)
})
