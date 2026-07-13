<template>
  <div class="max-w-2xl mx-auto p-4">
    <h1 class="text-2xl font-bold py-4">Edit Prompt</h1>

    <p v-if="notFound" class="text-red-600">
      Prompt not found. <NuxtLink to="/prompts" class="underline">Back to prompts</NuxtLink>
    </p>

    <template v-else>
      <p v-if="errorMessage" class="text-red-600 mb-4">{{ errorMessage }}</p>
      <p class="text-gray-500 mb-2">Version {{ version }}</p>

      <form @submit.prevent="submit" class="flex flex-col gap-4 bg-white rounded-lg shadow-md p-4">
        <label class="flex flex-col gap-1">
          <span class="font-bold">Name</span>
          <input v-model="name" type="text" required class="border rounded p-2" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="font-bold">Content</span>
          <textarea v-model="content" required rows="6" class="border rounded p-2"></textarea>
        </label>

        <label class="flex flex-col gap-1">
          <span class="font-bold">Description</span>
          <input v-model="description" type="text" class="border rounded p-2" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="font-bold">Tags (comma-separated)</span>
          <input v-model="tags" type="text" class="border rounded p-2" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="font-bold">Variables (comma-separated)</span>
          <input v-model="variables" type="text" class="border rounded p-2" />
        </label>

        <div class="flex gap-2">
          <button type="submit" class="bg-blue-300 hover:bg-blue-400 text-white font-bold py-2 px-4 rounded">
            Save
          </button>
          <button
            type="button"
            @click="remove"
            class="bg-red-300 hover:bg-red-400 text-white font-bold py-2 px-4 rounded"
          >
            Delete
          </button>
          <NuxtLink to="/prompts" class="bg-gray-200 hover:bg-gray-300 font-bold py-2 px-4 rounded">
            Cancel
          </NuxtLink>
        </div>
      </form>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'

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
