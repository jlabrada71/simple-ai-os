# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## Docker

Make sure `ANTHROPIC_API_KEY` is set in `.env` at the project root before running either service — it's passed into the container via `env_file`.

Chat session history (`./data/sessions`) is bind-mounted from the host, so it persists across container restarts for both services.

### Development (hot reload)

```bash
docker compose up dev
```

Runs `npm run dev` inside the container with the repo bind-mounted, so file changes on the host are picked up live. Available at `http://localhost:3000`.

### Production

```bash
docker compose up prod
```

Builds the app (`npm run build`) in a build stage, then runs the compiled output (`node .output/server/index.mjs`) in a minimal runtime image. Available at `http://localhost:3000`.

### Building without compose

```bash
# dev image
docker build --target dev -t simple-ai-os:dev .

# production image
docker build --target prod -t simple-ai-os:prod .
```
