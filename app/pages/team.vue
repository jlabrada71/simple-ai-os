<template>
  <div class="team-page">
    <div class="team-header">
      <h1 class="page-title">Team</h1>
    </div>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

    <div v-if="!forbidden" class="table-card">
      <table class="keys-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Joined</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="member in team" :key="member.id">
            <td>{{ member.email }}</td>
            <td>{{ member.role }}</td>
            <td>{{ new Date(member.createdAt).toLocaleString() }}</td>
            <td>
              <button
                type="button"
                class="btn btn-secondary"
                :disabled="isLastAdmin(member)"
                :title="isLastAdmin(member) ? 'Cannot demote the last admin' : ''"
                @click="toggleRole(member)"
              >
                {{ member.role === 'admin' ? 'Demote to member' : 'Promote to admin' }}
              </button>
            </td>
          </tr>
          <tr v-if="team.length === 0">
            <td class="empty-cell" colspan="4">No team members yet.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

definePageMeta({ layout: 'app', middleware: 'auth' })

const team = ref([])
const errorMessage = ref('')
const forbidden = ref(false)

const adminCount = computed(() => team.value.filter((m) => m.role === 'admin').length)
const isLastAdmin = (member) => member.role === 'admin' && adminCount.value <= 1

const fetchTeam = async () => {
  errorMessage.value = ''
  forbidden.value = false
  try {
    const response = await $fetch('/api/team')
    team.value = response.team
  } catch (err) {
    if (err.statusCode === 403) {
      forbidden.value = true
      errorMessage.value = 'Admins only.'
    } else {
      errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to load team'
    }
  }
}

const toggleRole = async (member) => {
  const nextRole = member.role === 'admin' ? 'member' : 'admin'
  errorMessage.value = ''
  try {
    await $fetch(`/api/team/${member.id}`, { method: 'PATCH', body: { role: nextRole } })
    fetchTeam()
  } catch (err) {
    errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to update role'
  }
}

fetchTeam()
</script>

<style scoped>
.team-page {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: var(--space-md) var(--space-sm);
}
@media (min-width: 768px) {
  .team-page {
    padding: var(--space-lg) var(--space-margin-desktop);
  }
}

.team-header {
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
.btn-secondary {
  background-color: var(--color-surface-lowest);
  color: var(--color-on-background);
  border: 1px solid var(--color-outline-variant);
}
.btn-secondary:hover {
  border-color: var(--color-primary-container);
}
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.empty-cell {
  text-align: center;
  padding: var(--space-lg);
  color: var(--color-on-surface-variant);
}
</style>
