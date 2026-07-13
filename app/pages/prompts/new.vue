<template>
  <div class="max-w-2xl mx-auto p-4">
    <h1 class="text-2xl font-bold py-4">New Prompt</h1>

    <p v-if="errorMessage" class="text-red-600 mb-4">{{ errorMessage }}</p>

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
          Create
        </button>
        <NuxtLink to="/prompts" class="bg-gray-200 hover:bg-gray-300 font-bold py-2 px-4 rounded">
          Cancel
        </NuxtLink>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'

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
