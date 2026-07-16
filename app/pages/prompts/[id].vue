<template>
  <div class="form-page">
    <h1 class="page-title">Edit Prompt</h1>

    <p v-if="notFound" class="error-text">
      Prompt not found. <NuxtLink to="/prompts" class="link-inline">Back to prompts</NuxtLink>
    </p>

    <template v-else>
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
      <p class="version-text">Version {{ version }}</p>

      <form @submit.prevent="submit" class="form-card">
        <label class="field-label">
          <span>Name</span>
          <input v-model="name" type="text" required class="field-input" />
        </label>

        <div class="field-label">
          <div class="field-label-row">
            <label for="prompt-content">Content</label>
            <button
              type="button"
              class="btn-improve"
              :disabled="isImproving || !content.trim()"
              @click="improve"
            >
              <Icon name="material-symbols:auto-fix-high" />
              {{ isImproving ? 'Improving…' : 'Improve' }}
            </button>
          </div>
          <textarea
            id="prompt-content"
            v-model="content"
            required
            rows="6"
            class="field-input field-textarea"
          ></textarea>
        </div>

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
          <button type="submit" class="btn btn-primary">Save</button>
          <button type="button" @click="remove" class="btn btn-danger">Delete</button>
          <NuxtLink to="/prompts" class="btn btn-secondary">Cancel</NuxtLink>
        </div>
        <section>
        <p>Tips on how to create a good prompt</p>
          <ul>
            <li>
              <h2>* Be clear</h2>
               <ul>
                <li>- Use simple language</li>
                <li>- state what you want</li>
                <li>- lead your prompt with a simple statement of the task</li>
               </ul>
               <p>Instead of: "I need to know about those things people put on their roofs"</p>
               <p>Use: "Write three paragraphs about how solar panels work."</p>
            </li>
            <li>
               <h2>* Be direct</h2>
               <ul>
                <li>- Use instructions, no questionse</li>
                <li>- Use direct action verbs (Write, create, generate)</li>                
               </ul>
               <p>Instead of: "I was reading about renewable energy. What countries use it? "</p>
               <p>Use: "Identify three countries that use renewable energy."</p>
            </li>
            <li><h2>* Be especific</h2>
               <p>Provide a list of guidelines (qualities, this is preferred) or steps to direct the model</p>
               <div><h2>Example 1</h2>
                <p>Write a short story about a character</p>
                <p>Guidelines:</p>
               <ul>
                <li>- Keep the story under 1000 words.</li>
                <li>- Include a clear action that reveals the character</li>   
                <li>- Include at least one supporting character</li>             
               </ul>
               <p>Instead of: "I was reading about renewable energy. What countries use it? "</p>
               <p>Use: "Identify three countries that use renewable energy."</p>
               </div>
               <div><h2>Example 2</h2>
                <p>Write a short story about a character</p>
                <p>Follow these steps:</p>
               <ul>
                <li>1- Brainstorm 3 talents that create dramatic tension</li>
                <li>2- Pick the most interesting talent</li>   
                <li>3- Outline a scene that reveals the talent.</li>             
               </ul>               
               </div>
              </li>
            <li>
              <h2>* Structure with XML tags</h2>
               <p>This separate distinct portions of the prompt.</p>
               <p>It's important for including a lot of content for example</p>
               <div><h2>Example 1</h2>
               <ul>
                <li>&lt;my_data&gt;{ { sales_record } }&lt;/my_data&gt;</li>
                <li>- &lt;my_code&gt;{ { code } }&lt;/my_code&gt; &lt;code_docs&gt;{ { docs } }&lt;/code_docs&gt;</li>
               </ul>
               
               </div>
            </li>
            <li><h2>* Provide examples</h2></li>
          </ul>

        </section>
      </form>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'

definePageMeta({ layout: 'app' })

const route = useRoute()
const id = route.params.id

const name = ref('')
const content = ref('')
const description = ref('')
const tags = ref('')
const variables = ref('')
const version = ref(1)
const errorMessage = ref('')
const notFound = ref(false)
const isImproving = ref(false)

const splitList = (value) =>
  value.split(',').map((item) => item.trim()).filter((item) => item.length > 0)

const load = async () => {
  try {
    const prompt = await $fetch(`/api/prompts/${id}`)
    name.value = prompt.name
    content.value = prompt.content
    description.value = prompt.description || ''
    tags.value = prompt.tags.join(', ')
    variables.value = prompt.variables.join(', ')
    version.value = prompt.version
  } catch (err) {
    if (err.statusCode === 404) {
      notFound.value = true
    } else {
      errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to load prompt'
    }
  }
}

const submit = async () => {
  errorMessage.value = ''
  const body = {
    name: name.value,
    content: content.value,
    description: description.value.trim() || undefined,
    tags: splitList(tags.value),
    variables: splitList(variables.value),
  }

  try {
    const prompt = await $fetch(`/api/prompts/${id}`, { method: 'PUT', body })
    version.value = prompt.version
    await navigateTo('/prompts')
  } catch (err) {
    errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to save prompt'
  }
}

const improve = async () => {
  errorMessage.value = ''
  isImproving.value = true
  try {
    const body = {
      name: name.value,
      content: content.value,
      description: description.value.trim() || undefined,
      tags: splitList(tags.value),
      variables: splitList(variables.value),
    }
    const improved = await $fetch('/api/prompts/improve', { method: 'POST', body })
    content.value = improved.content
  } catch (err) {
    errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to improve prompt'
  } finally {
    isImproving.value = false
  }
}

const remove = async () => {
  if (!confirm(`Delete prompt "${name.value}"? This cannot be undone.`)) return
  errorMessage.value = ''
  try {
    await $fetch(`/api/prompts/${id}`, { method: 'DELETE' })
    await navigateTo('/prompts')
  } catch (err) {
    errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to delete prompt'
  }
}

load()
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
  margin-bottom: var(--space-sm);
}

.version-text {
  color: var(--color-on-surface-variant);
  margin-bottom: var(--space-sm);
}

.error-text {
  color: var(--color-error);
  margin-bottom: var(--space-sm);
}

.link-inline {
  color: var(--color-primary-container);
  text-decoration: underline;
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

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.btn-improve {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px var(--space-xs);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-lowest);
  color: var(--color-primary-container);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.btn-improve:hover:not(:disabled) {
  border-color: var(--color-primary-container);
}
.btn-improve:disabled {
  opacity: 0.5;
  cursor: default;
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
.btn-danger {
  background-color: var(--color-error);
  color: #ffffff;
}
.btn-danger:hover {
  opacity: 0.9;
}
</style>
