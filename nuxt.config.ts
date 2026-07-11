// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['./app/assets/css/main.css'],
  vite: {
    plugins: [
      tailwindcss(),
    ],
    optimizeDeps: {
      include: [
        '@vue/devtools-core',
        '@vue/devtools-kit',
      ]
    }
  }, 
  modules: [
    '@nuxt/a11y',
    '@nuxt/eslint',
    '@nuxt/icon',
    '@nuxt/image',
    '@nuxt/test-utils',
    '@nuxtjs/i18n',
    '@nuxtjs/mdc',
  ],
  mdc: {
    components: {
      prose: true, // Enable predefined prose components
    }
  },
  components: [{
    global: true,
    path: './components/prose'
  }
  ],  
  nitro: {
    storage: {
      // Mount a filesystem driver to /data/db
      session: {
        driver: 'fs',
        base: './data/sessions' 
      }
    }
  },
  i18n: {
    strategy: 'prefix_except_default', // 'prefix' can force redirects
    defaultLocale: 'en',
    langDir: 'locales',    
    locales: [
      { code: 'en', iso: 'en-US', file: 'en.json', name: 'English' },
      { code: 'es', iso: 'es-ES', file: 'es.json', name: 'Español' },
      { code: 'pt', iso: 'pt-BR', file: 'pt.json', name: 'Português' }
    ],
  }
})