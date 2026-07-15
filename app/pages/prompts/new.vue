<template>
  <div class="form-page">
    <h1 class="page-title">New Prompt</h1>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

    <form @submit.prevent="submit" class="form-card">
      <label class="field-label">
        <span>Name</span>
        <input v-model="name" type="text" required class="field-input" />
      </label>

      <label class="field-label">
        <span>Content</span>
        <textarea v-model="content" required rows="6" class="field-input field-textarea"></textarea>
      </label>

      <label class="field-label">
        <span>Description</span>
        <input v-model="description" type="text" class="field-input" />
      </label>

      <label class="field-label">
        <span>Tags (comma-separated)</span>
        <input v-model="tags" type="text" class="field-input" />
      </label>

      <label class="field-label">
        <span>Variables (comma-separated)</span>
        <input v-model="variables" type="text" class="field-input" />
      </label>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Create</button>
        <NuxtLink to="/prompts" class="btn btn-secondary">Cancel</NuxtLink>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'

definePageMeta({ layout: 'app' })

const name = ref('')
const content = ref('')
const description = ref('')
const tags = ref('')
const variables = ref('')
const errorMessage = ref('')

const splitList = (value) =>
  value.split(',').map((item) => item.trim()).filter((item) => item.length > 0)

const submit = async () => {
  errorMessage.value = ''
  const body = { name: name.value, content: content.value }
  if (description.value.trim()) body.description = description.value.trim()
  const tagList = splitList(tags.value)
  if (tagList.length > 0) body.tags = tagList
  const variableList = splitList(variables.value)
  if (variableList.length > 0) body.variables = variableList

  try {
    await $fetch('/api/prompts', { method: 'POST', body })
    await navigateTo('/prompts')
  } catch (err) {
    errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to create prompt'
  }
}
</script>

<style scoped>
.form-page {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--space-md) var(--space-sm);
}
@media (min-width: 768px) {
  .form-page {
    padding: var(--space-lg) var(--space-margin-desktop);
  }
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: var(--space-md);
}

.error-text {
  color: var(--color-error);
  margin-bottom: var(--space-sm);
}

.form-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-lg);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-lowest);
}

.field-label {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-on-background);
}

.field-input {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-container-low);
  font-family: var(--font-body);
  font-weight: 400;
}
.field-input:focus {
  outline: none;
  border-color: var(--color-primary-container);
  background-color: var(--color-surface-lowest);
}

.field-textarea {
  resize: vertical;
}

.form-actions {
  display: flex;
  gap: var(--space-sm);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 8px var(--space-md);
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
</style>
