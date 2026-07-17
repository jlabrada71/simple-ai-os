<template>
  <div class="form-page" :class="{ 'form-page-wide': showCompare }">
    <h1 class="page-title">Edit Prompt</h1>

    <p v-if="notFound" class="error-text">
      Prompt not found. <NuxtLink to="/prompts" class="link-inline">Back to prompts</NuxtLink>
    </p>

    <template v-else>
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
      <p class="version-text">Version {{ version }}</p>

      <label class="compare-toggle">
        <input type="checkbox" v-model="showCompare" />
        Compare with a previous version
      </label>

      <div class="edit-layout" :class="{ 'edit-layout-compare': showCompare }">
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
          <NuxtLink to="/prompts" class="btn btn-secondary">Cancel</NuxtLink>
        </div>
      </form>

      <div v-if="showCompare" class="compare-card">
        <label class="field-label">
          <span>Compare version</span>
          <select v-model="selectedHistoryId" class="field-input">
            <option value="" disabled>Select a version…</option>
            <option v-for="entry in historyEntries" :key="entry.id" :value="entry.id">
              Version {{ entry.version }} — {{ entry.action }} — {{ formatDate(entry.archivedAt) }}
            </option>
          </select>
        </label>

        <p v-if="historyError" class="error-text">{{ historyError }}</p>
        <p v-else-if="!historyEntries.length && historyLoaded" class="version-text">
          No previous versions yet.
        </p>

        <template v-if="selectedEntry">
          <label class="field-label">
            <span>Content</span>
            <textarea readonly rows="6" class="field-input field-textarea" :value="selectedEntry.content"></textarea>
          </label>

          <label class="field-label">
            <span>Description</span>
            <input readonly type="text" class="field-input" :value="selectedEntry.description || ''" />
          </label>

          <label class="field-label">
            <span>Variables</span>
            <input readonly type="text" class="field-input" :value="selectedEntry.variables.join(', ')" />
          </label>

          <div class="diff-section">
            <h3 class="diff-title">Content diff</h3>
            <p class="diff-text">
              <span
                v-for="(token, index) in contentDiff"
                :key="index"
                class="diff-token"
                :class="`diff-token-${token.status}`"
                >{{ token.value + ' ' }}</span
              >
            </p>

            <h3 class="diff-title">Description diff</h3>
            <p class="diff-text">
              <span
                v-for="(token, index) in descriptionDiff"
                :key="index"
                class="diff-token"
                :class="`diff-token-${token.status}`"
                >{{ token.value + ' ' }}</span
              >
            </p>

            <h3 class="diff-title">Variables diff</h3>
            <p class="diff-text">
              <span
                v-for="(item, index) in variablesDiff"
                :key="index"
                class="diff-chip"
                :class="`diff-token-${item.status}`"
                >{{ item.value }}</span
              >
              <span v-if="!variablesDiff.length" class="version-text">No variables.</span>
            </p>
          </div>
        </template>
      </div>
      </div>

      <section class="tips-section">
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
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { getListDiff, getTextDiff } from '@donedeal0/superdiff'

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

const showCompare = ref(false)
const historyEntries = ref([])
const historyLoaded = ref(false)
const historyError = ref('')
const selectedHistoryId = ref('')

const selectedEntry = computed(
  () => historyEntries.value.find((entry) => entry.id === selectedHistoryId.value) || null,
)

const contentDiff = computed(() =>
  selectedEntry.value
    ? getTextDiff(selectedEntry.value.content, content.value, { separation: 'word' }).diff
    : [],
)

const descriptionDiff = computed(() =>
  selectedEntry.value
    ? getTextDiff(selectedEntry.value.description || '', description.value, { separation: 'word' }).diff
    : [],
)

const variablesDiff = computed(() =>
  selectedEntry.value
    ? getListDiff(selectedEntry.value.variables, splitList(variables.value)).diff
    : [],
)

const formatDate = (value) => new Date(value).toLocaleString()

const loadHistory = async () => {
  if (historyLoaded.value) return
  historyError.value = ''
  try {
    const { history } = await $fetch(`/api/prompts/${id}/history`)
    historyEntries.value = history
    historyLoaded.value = true
  } catch (err) {
    historyError.value = err.data?.statusMessage || err.data?.message || 'Failed to load history'
  }
}

watch(showCompare, (enabled) => {
  if (enabled) loadHistory()
})

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
.form-page-wide {
  max-width: 1100px;
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

.compare-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.edit-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-md);
}
.edit-layout-compare {
  grid-template-columns: 1fr;
}
@media (min-width: 900px) {
  .edit-layout-compare {
    grid-template-columns: 1fr 1fr;
  }
}

.compare-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-lg);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-container-low);
}

.diff-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  border-top: 1px solid var(--color-outline-variant);
  padding-top: var(--space-sm);
}

.diff-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-on-surface-variant);
}

.diff-text {
  line-height: 1.6;
  word-wrap: break-word;
}

.diff-token-equal {
  color: var(--color-on-background);
}
.diff-token-added {
  background-color: #d4f4dd;
  color: #1a6b31;
  border-radius: 3px;
}
.diff-token-deleted {
  background-color: #ffdad6;
  color: #93000a;
  text-decoration: line-through;
  border-radius: 3px;
}
.diff-token-updated,
.diff-token-moved {
  background-color: #fff3cd;
  color: #7a5b00;
  border-radius: 3px;
}

.diff-chip {
  display: inline-block;
  padding: 2px var(--space-xs);
  margin: 2px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  background-color: var(--color-surface-lowest);
  border: 1px solid var(--color-outline-variant);
}
</style>
