<template>
  <div class="api-keys-page">
    <div class="api-keys-header">
      <h1 class="page-title">API Keys</h1>
    </div>

    <div v-if="newToken" class="new-token-banner">
      <p class="new-token-warning">
        Copy this key now — it won't be shown again.
      </p>
      <div class="new-token-row">
        <code class="new-token-value">{{ newToken }}</code>
        <button type="button" class="btn btn-secondary" @click="copyToken">
          {{ copied ? 'Copied!' : 'Copy' }}
        </button>
      </div>
      <button type="button" class="btn btn-primary" @click="dismissNewToken">Done</button>
    </div>

    <form @submit.prevent="createKey" class="create-form">
      <input v-model="newKeyName" type="text" placeholder="Key name (optional)" class="filter-input" />
      <button type="submit" class="btn btn-primary">
        <Icon name="material-symbols:add" />
        Create Key
      </button>
    </form>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

    <div class="table-card">
      <table class="keys-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Created</th>
            <th>Last used</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="key in apiKeys" :key="key.id">
            <td>{{ key.name || 'Unnamed key' }}</td>
            <td>{{ new Date(key.createdAt).toLocaleString() }}</td>
            <td>{{ key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never' }}</td>
            <td>
              <button type="button" @click="revokeKey(key)" class="icon-btn icon-btn-delete" aria-label="Revoke">
                <Icon name="material-symbols:delete-outline" />
              </button>
            </td>
          </tr>
          <tr v-if="apiKeys.length === 0">
            <td class="empty-cell" colspan="4">No API keys yet.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

definePageMeta({ layout: 'app', middleware: 'auth' })

const apiKeys = ref([])
const newKeyName = ref('')
const newToken = ref('')
const copied = ref(false)
const errorMessage = ref('')

const fetchApiKeys = async () => {
  errorMessage.value = ''
  try {
    const response = await $fetch('/api/api-keys')
    apiKeys.value = response.apiKeys
  } catch (err) {
    errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to load API keys'
  }
}

const createKey = async () => {
  errorMessage.value = ''
  try {
    const created = await $fetch('/api/api-keys', {
      method: 'POST',
      body: newKeyName.value.trim() ? { name: newKeyName.value.trim() } : {},
    })
    newToken.value = created.token
    copied.value = false
    newKeyName.value = ''
    fetchApiKeys()
  } catch (err) {
    errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to create API key'
  }
}

const copyToken = async () => {
  await navigator.clipboard.writeText(newToken.value)
  copied.value = true
}

const dismissNewToken = () => {
  newToken.value = ''
  copied.value = false
}

const revokeKey = async (key) => {
  if (!confirm(`Revoke API key "${key.name || 'Unnamed key'}"? This cannot be undone.`)) return
  errorMessage.value = ''
  try {
    await $fetch(`/api/api-keys/${key.id}`, { method: 'DELETE' })
    fetchApiKeys()
  } catch (err) {
    errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to revoke API key'
  }
}

fetchApiKeys()
</script>

<style scoped>
.api-keys-page {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: var(--space-md) var(--space-sm);
}
@media (min-width: 768px) {
  .api-keys-page {
    padding: var(--space-lg) var(--space-margin-desktop);
  }
}

.api-keys-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.page-title {
  font-size: 28px;
  font-weight: 700;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 8px var(--space-sm);
  border-radius: var(--radius-lg);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  text-decoration: none;
}
.btn-primary {
  background-color: var(--color-primary-container);
  color: var(--color-on-primary);
}
.btn-primary:hover {
  background-color: var(--color-primary);
}
.btn-secondary {
  background-color: var(--color-surface-lowest);
  color: var(--color-on-background);
  border: 1px solid var(--color-outline-variant);
}
.btn-secondary:hover {
  border-color: var(--color-primary-container);
}

.new-token-banner {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm);
  margin-bottom: var(--space-md);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-primary-container);
  background-color: var(--color-secondary-fixed);
}

.new-token-warning {
  font-weight: 600;
}

.new-token-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.new-token-value {
  flex: 1;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-lg);
  background-color: var(--color-surface-lowest);
  font-family: var(--font-mono, monospace);
  overflow-x: auto;
  white-space: nowrap;
}

.create-form {
  display: flex;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
}

.filter-input {
  flex: 1;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-container-low);
}
.filter-input:focus {
  outline: none;
  border-color: var(--color-primary-container);
  background-color: var(--color-surface-lowest);
}

.error-text {
  color: var(--color-error);
  margin-bottom: var(--space-sm);
}

.table-card {
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-lowest);
  overflow: hidden;
}

.keys-table {
  width: 100%;
  border-collapse: collapse;
}
.keys-table th {
  text-align: left;
  padding: var(--space-sm);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-on-surface-variant);
  border-bottom: 1px solid var(--color-outline-variant);
}
.keys-table td {
  padding: var(--space-sm);
  border-bottom: 1px solid var(--color-outline-variant);
}
.keys-table tbody tr:hover {
  background-color: var(--color-surface-container-low);
}
.keys-table tbody tr:last-child td {
  border-bottom: none;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-lg);
  border: none;
  background: none;
  cursor: pointer;
  font-size: 18px;
}
.icon-btn-delete {
  color: var(--color-error);
}
.icon-btn-delete:hover {
  background-color: #ffdad6;
}

.empty-cell {
  text-align: center;
  padding: var(--space-lg);
  color: var(--color-on-surface-variant);
}
</style>
