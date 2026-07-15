<template>
  <div class="index-page">
    <header class="nav">
      <div class="nav-inner">
        <div class="logo">Simple AI OS</div>
        <nav class="nav-links">
          <span class="nav-link">Docs</span>
          <span class="nav-link">Features</span>
          <span class="nav-link">Pricing</span>
        </nav>
        <span class="get-started-btn">Get Started</span>
      </div>
    </header>

    <main class="main">
      <section class="hero">
        <div class="hero-inner">
          <div class="badge reveal">
            <Icon name="material-symbols:bolt" class="badge-icon" />
            <span>Next-Gen AI OS v2.0</span>
          </div>
          <h1 class="headline reveal" style="animation-delay: 0.05s">Simple AI OS</h1>
          <p class="subheading reveal" style="animation-delay: 0.1s">
            The simple AI operating system for creating and improving your AI prompts. Designed for
            developers and power users who value precision and speed.
          </p>
          <div class="hero-frame reveal" style="animation-delay: 0.2s">
            <div class="hero-frame-bar">
              <span class="dot dot-error"></span>
              <span class="dot dot-secondary"></span>
              <span class="dot dot-primary"></span>
            </div>
            <img src="/images/hero-mockup.jpg" alt="Prompt engineering dashboard mockup" class="hero-image" />
          </div>
        </div>
      </section>

      <section class="cta-grid-section">
        <div class="cta-grid">
          <div class="cta-card reveal" style="animation-delay: 0.3s">
            <div class="cta-icon cta-icon-primary">
              <Icon name="material-symbols:forum" />
            </div>
            <h3 class="cta-title">Chat Streaming</h3>
            <p class="cta-desc">
              Access a live streaming chat interface to interact with your AI in real-time. Experience
              zero-latency token delivery and professional-grade markdown rendering.
            </p>
            <NuxtLink to="/chat-streaming" class="cta-button">
              Open Chat
              <Icon name="material-symbols:arrow-forward" />
            </NuxtLink>
          </div>
          <div class="cta-card reveal" style="animation-delay: 0.4s">
            <div class="cta-icon cta-icon-secondary">
              <Icon name="material-symbols:terminal" />
            </div>
            <h3 class="cta-title">Prompts</h3>
            <p class="cta-desc">
              Manage your personal prompt library and discover optimized templates for any task. Version
              control your AI instructions with deep system integration.
            </p>
            <NuxtLink to="/prompts" class="cta-button">
              Manage Library
              <Icon name="material-symbols:folder-open" />
            </NuxtLink>
          </div>
        </div>
      </section>

      <section class="feature-section">
        <div class="feature-inner">
          <div class="feature-intro">
            <h2 class="feature-heading">Built for the modern stack.</h2>
            <p class="feature-copy">
              Simple AI OS integrates directly with your existing developer workflow, ensuring zero
              friction between ideation and deployment.
            </p>
          </div>
          <div class="feature-grid">
            <div class="feature-item">
              <Icon name="material-symbols:api" class="feature-icon" />
              <div>
                <h4 class="feature-item-title">Unified API</h4>
                <p class="feature-item-desc">One interface for all your LLM providers.</p>
              </div>
            </div>
            <div class="feature-item">
              <Icon name="material-symbols:security" class="feature-icon" />
              <div>
                <h4 class="feature-item-title">Secure by Design</h4>
                <p class="feature-item-desc">Encrypted prompts and local storage options.</p>
              </div>
            </div>
            <div class="feature-item">
              <Icon name="material-symbols:analytics" class="feature-icon" />
              <div>
                <h4 class="feature-item-title">Token Analytics</h4>
                <p class="feature-item-desc">Track usage and performance metrics instantly.</p>
              </div>
            </div>
            <div class="feature-item">
              <Icon name="material-symbols:sync-alt" class="feature-icon" />
              <div>
                <h4 class="feature-item-title">Live Sync</h4>
                <p class="feature-item-desc">Your library available across all devices.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="footer">
      <div class="footer-inner">
        <div class="footer-brand">
          <div class="logo">Simple AI OS</div>
          <p class="footer-copyright">© 2026 Simple AI OS. Built for developers.</p>
        </div>
        <div class="footer-links">
          <span class="footer-link">Changelog</span>
          <span class="footer-link">Status</span>
          <span class="footer-link">Privacy</span>
          <span class="footer-link">Terms</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
useHead({
  link: [
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400&display=swap',
    },
  ],
})
</script>

<style scoped>
.index-page {
  --color-background: #f9f9f9;
  --color-surface-lowest: #ffffff;
  --color-surface-container-low: #f3f3f3;
  --color-surface-container: #eeeeee;
  --color-on-background: #1a1c1c;
  --color-on-surface-variant: #464555;
  --color-outline-variant: #c7c4d8;
  --color-primary: #3525cd;
  --color-primary-container: #4f46e5;
  --color-on-primary: #ffffff;
  --color-secondary: #4648d4;
  --color-secondary-container: #6063ee;
  --color-secondary-fixed: #e1e0ff;
  --color-on-secondary-fixed: #07006c;
  --color-error: #ba1a1a;

  --space-xs: 8px;
  --space-sm: 16px;
  --space-md: 24px;
  --space-lg: 40px;
  --space-xl: 64px;
  --space-margin-mobile: 16px;
  --space-margin-desktop: 48px;
  --max-width: 1280px;

  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-full: 9999px;

  display: block;
  font-family: 'Inter', sans-serif;
  color: var(--color-on-background);
  background-color: var(--color-background);
}

.nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background-color: var(--color-background);
  border-bottom: 1px solid var(--color-outline-variant);
}
.nav-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 var(--space-margin-desktop);
  height: 80px;
}
.logo {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-primary);
}
.nav-links {
  display: none;
  gap: var(--space-lg);
}
@media (min-width: 768px) {
  .nav-links {
    display: flex;
    align-items: center;
  }
}
.nav-link {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-on-surface-variant);
  cursor: default;
}
.get-started-btn {
  display: inline-flex;
  align-items: center;
  background-color: var(--color-primary-container);
  color: var(--color-on-primary);
  padding: 8px 16px;
  border-radius: var(--radius-lg);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: default;
}

.hero {
  padding: var(--space-xl) var(--space-margin-mobile) var(--space-lg);
}
@media (min-width: 768px) {
  .hero {
    padding-left: var(--space-margin-desktop);
    padding-right: var(--space-margin-desktop);
  }
}
.hero-inner {
  max-width: var(--max-width);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 4px var(--space-sm);
  background-color: var(--color-secondary-fixed);
  color: var(--color-on-secondary-fixed);
  border-radius: var(--radius-full);
  margin-bottom: var(--space-md);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.badge-icon {
  font-size: 18px;
}
.headline {
  font-size: 48px;
  line-height: 56px;
  font-weight: 700;
  letter-spacing: -0.02em;
  max-width: 48rem;
  margin-bottom: var(--space-md);
}
.subheading {
  font-size: 18px;
  line-height: 28px;
  color: var(--color-on-surface-variant);
  max-width: 42rem;
  margin-bottom: var(--space-lg);
}
.hero-frame {
  width: 100%;
  max-width: 64rem;
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-outline-variant);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  background-color: var(--color-surface-lowest);
}
.hero-frame-bar {
  height: 32px;
  background-color: var(--color-surface-container-low);
  display: flex;
  align-items: center;
  padding: 0 var(--space-sm);
  gap: var(--space-xs);
  border-bottom: 1px solid var(--color-outline-variant);
}
.dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  opacity: 0.4;
}
.dot-error {
  background-color: var(--color-error);
}
.dot-secondary {
  background-color: var(--color-secondary);
}
.dot-primary {
  background-color: var(--color-primary);
}
.hero-image {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  display: block;
}

.cta-grid-section {
  padding: var(--space-xl) var(--space-margin-mobile);
  max-width: var(--max-width);
  margin: 0 auto;
}
@media (min-width: 768px) {
  .cta-grid-section {
    padding-left: var(--space-margin-desktop);
    padding-right: var(--space-margin-desktop);
  }
}
.cta-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-lg);
}
@media (min-width: 768px) {
  .cta-grid {
    grid-template-columns: 1fr 1fr;
  }
}
.cta-card {
  display: flex;
  flex-direction: column;
  padding: var(--space-lg);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-lowest);
  transition: border-color 0.3s, box-shadow 0.3s;
}
.cta-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08);
}
.cta-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-on-primary);
  margin-bottom: var(--space-md);
  font-size: 24px;
}
.cta-icon-primary {
  background-color: var(--color-primary-container);
}
.cta-icon-secondary {
  background-color: var(--color-secondary-container);
}
.cta-title {
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin-bottom: var(--space-sm);
}
.cta-desc {
  color: var(--color-on-surface-variant);
  margin-bottom: var(--space-lg);
  flex-grow: 1;
}
.cta-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  width: 100%;
  padding: var(--space-sm) 0;
  border: 2px solid var(--color-primary);
  color: var(--color-primary);
  font-weight: 700;
  border-radius: var(--radius-lg);
  text-decoration: none;
  transition: background-color 0.2s, color 0.2s;
}
.cta-button:hover {
  background-color: var(--color-primary);
  color: #ffffff;
}

.feature-section {
  padding: var(--space-xl) var(--space-margin-mobile);
  max-width: var(--max-width);
  margin: 0 auto;
}
@media (min-width: 768px) {
  .feature-section {
    padding-left: var(--space-margin-desktop);
    padding-right: var(--space-margin-desktop);
  }
}
.feature-inner {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}
@media (min-width: 768px) {
  .feature-inner {
    flex-direction: row;
  }
}
.feature-intro {
  flex: none;
}
@media (min-width: 768px) {
  .feature-intro {
    width: 33.3333%;
  }
}
.feature-heading {
  font-size: 32px;
  line-height: 40px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: var(--space-sm);
}
.feature-copy {
  color: var(--color-on-surface-variant);
}
.feature-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-md);
  flex: 1;
}
@media (min-width: 640px) {
  .feature-grid {
    grid-template-columns: 1fr 1fr;
  }
}
.feature-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: var(--space-md);
  border-radius: var(--radius-lg);
  background-color: var(--color-surface-container);
}
.feature-icon {
  color: var(--color-primary);
  font-size: 24px;
  flex-shrink: 0;
}
.feature-item-title {
  font-weight: 700;
  margin-bottom: 4px;
}
.feature-item-desc {
  font-size: 14px;
  color: var(--color-on-surface-variant);
}

.footer {
  background-color: var(--color-surface-container-low);
  border-top: 1px solid var(--color-outline-variant);
}
.footer-inner {
  width: 100%;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: var(--space-lg) var(--space-margin-desktop);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}
@media (min-width: 768px) {
  .footer-inner {
    flex-direction: row;
    align-items: center;
  }
}
.footer-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
}
@media (min-width: 768px) {
  .footer-brand {
    align-items: flex-start;
  }
}
.footer-copyright {
  font-size: 14px;
  color: var(--color-on-surface-variant);
}
.footer-links {
  display: flex;
  gap: var(--space-lg);
}
.footer-link {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-on-surface-variant);
  cursor: default;
}

.reveal {
  animation: revealUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  opacity: 0;
}
@keyframes revealUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
