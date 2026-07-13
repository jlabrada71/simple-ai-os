<template>
  <div class="max-w-5xl mx-auto p-4">
    <div class="flex items-center justify-between py-4">
      <h1 class="text-2xl font-bold">Prompts</h1>
      <NuxtLink to="/prompts/new" class="bg-blue-300 hover:bg-blue-400 text-white font-bold py-2 px-4 rounded">
        New Prompt
      </NuxtLink>
    </div>

    <form @submit.prevent="applyFilter" class="flex gap-2 mb-4">
      <input v-model="tagFilter" type="text" placeholder="Filter by tag..." class="border rounded p-2 flex-1" />
      <button type="submit" class="bg-gray-200 hover:bg-gray-300 font-bold py-2 px-4 rounded">Filter</button>
    </form>

    <p v-if="errorMessage" class="text-red-600 mb-4">{{ errorMessage }}</p>

    <table class="w-full bg-white rounded-lg shadow-md">
      <thead>
        <tr class="text-left border-b">
          <th class="p-2">Name</th>
          <th class="p-2">Description</th>
          <th class="p-2">Tags</th>
          <th class="p-2">Version</th>
          <th class="p-2">Updated</th>
          <th class="p-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="prompt in prompts" :key="prompt.id" class="border-b">
          <td class="p-2">{{ prompt.name }}</td>
          <td class="p-2">{{ prompt.description }}</td>
          <td class="p-2">{{ prompt.tags.join(', ') }}</td>
          <td class="p-2">{{ prompt.version }}</td>
          <td class="p-2">{{ new Date(prompt.updatedAt).toLocaleString() }}</td>
          <td class="p-2 flex gap-2">
            <NuxtLink :to="`/prompts/${prompt.id}`" class="text-blue-600 hover:underline">Edit</NuxtLink>
            <button @click="removePrompt(prompt)" class="text-red-600 hover:underline">Delete</button>
          </td>
        </tr>
        <tr v-if="prompts.length === 0">
          <td class="p-4 text-center text-gray-500" colspan="6">No prompts found.</td>
        </tr>
      </tbody>
    </table>

    <div class="flex justify-between mt-4">
      <button
        @click="previousPage"
        :disabled="offset === 0"
        class="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 font-bold py-2 px-4 rounded"
      >
        Previous
      </button>
      <button
        @click="nextPage"
        :disabled="!hasNextPage"
        class="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 font-bold py-2 px-4 rounded"
      >
        Next
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

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
