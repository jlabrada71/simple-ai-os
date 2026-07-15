<template>
  <div class="prompts-page">
    <div class="prompts-header">
      <h1 class="page-title">Prompts</h1>
      <NuxtLink to="/prompts/new" class="btn btn-primary">
        <Icon name="material-symbols:add" />
        New Prompt
      </NuxtLink>
    </div>

    <form @submit.prevent="applyFilter" class="filter-form">
      <input v-model="tagFilter" type="text" placeholder="Filter by tag..." class="filter-input" />
      <button type="submit" class="btn btn-secondary">Filter</button>
    </form>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

    <div class="table-card">
      <table class="prompts-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Tags</th>
            <th>Version</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="prompt in prompts" :key="prompt.id">
            <td>{{ prompt.name }}</td>
            <td>{{ prompt.description }}</td>
            <td>
              <span v-for="tag in prompt.tags" :key="tag" class="tag-chip">{{ tag }}</span>
            </td>
            <td>{{ prompt.version }}</td>
            <td>{{ new Date(prompt.updatedAt).toLocaleString() }}</td>
            <td>
              <div class="actions-cell">
                <NuxtLink :to="`/prompts/${prompt.id}`" class="link-edit">Edit</NuxtLink>
                <button type="button" @click="removePrompt(prompt)" class="link-delete">Delete</button>
              </div>
            </td>
          </tr>
          <tr v-if="prompts.length === 0">
            <td class="empty-cell" colspan="6">No prompts found.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="pagination">
      <button @click="previousPage" :disabled="offset === 0" class="btn btn-secondary">Previous</button>
      <button @click="nextPage" :disabled="!hasNextPage" class="btn btn-secondary">Next</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

definePageMeta({ layout: 'app' })

const limit = 20
const offset = ref(0)
const tagFilter = ref('')
const prompts = ref([])
const hasNextPage = ref(false)
const errorMessage = ref('')

const fetchPrompts = async () => {
  errorMessage.value = ''
  try {
    const query = { limit, offset: offset.value }
    if (tagFilter.value.trim()) {
      query.tag = tagFilter.value.trim()
    }
    const response = await $fetch('/api/prompts', { query })
    prompts.value = response.prompts
    hasNextPage.value = response.prompts.length === limit
  } catch (err) {
    errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to load prompts'
  }
}

const applyFilter = () => {
  offset.value = 0
  fetchPrompts()
}

const previousPage = () => {
  offset.value = Math.max(0, offset.value - limit)
  fetchPrompts()
}

const nextPage = () => {
  offset.value += limit
  fetchPrompts()
}

const removePrompt = async (prompt) => {
  if (!confirm(`Delete prompt "${prompt.name}"? This cannot be undone.`)) return
  errorMessage.value = ''
  try {
    await $fetch(`/api/prompts/${prompt.id}`, { method: 'DELETE' })
    fetchPrompts()
  } catch (err) {
    errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to delete prompt'
  }
}

fetchPrompts()
</script>

<style scoped>
.prompts-page {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: var(--space-md) var(--space-sm);
}
@media (min-width: 768px) {
  .prompts-page {
    padding: var(--space-lg) var(--space-margin-desktop);
  }
}

.prompts-header {
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
.btn-secondary:hover:not(:disabled) {
  border-color: var(--color-primary-container);
}
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: default;
}

.filter-form {
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

.prompts-table {
  width: 100%;
  border-collapse: collapse;
}
.prompts-table th {
  text-align: left;
  padding: var(--space-sm);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-on-surface-variant);
  border-bottom: 1px solid var(--color-outline-variant);
}
.prompts-table td {
  padding: var(--space-sm);
  border-bottom: 1px solid var(--color-outline-variant);
}
.prompts-table tbody tr:hover {
  background-color: var(--color-surface-container-low);
}
.prompts-table tbody tr:last-child td {
  border-bottom: none;
}

.tag-chip {
  display: inline-block;
  padding: 2px var(--space-xs);
  margin: 2px;
  border-radius: var(--radius-full);
  background-color: var(--color-secondary-fixed);
  color: var(--color-on-secondary-fixed);
  font-size: 12px;
  font-weight: 600;
}

.actions-cell {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.link-edit {
  color: var(--color-primary-container);
  font-weight: 600;
  text-decoration: none;
}
.link-edit:hover {
  text-decoration: underline;
}

.link-delete {
  color: var(--color-error);
  font-weight: 600;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.link-delete:hover {
  text-decoration: underline;
}

.empty-cell {
  text-align: center;
  padding: var(--space-lg);
  color: var(--color-on-surface-variant);
}

.pagination {
  display: flex;
  justify-content: space-between;
  margin-top: var(--space-md);
}
</style>
