// ─────────────────────────────────────────────────────────────────────────
// Shared task-completion logic.
//
// WHY THIS FILE EXISTS:
// Every recurring task (weekly/monthly/quarterly/yearly) can have MULTIPLE
// assignees. The `tasks.status` column is a single global field on the task
// row — when ANY one assignee marks it done, `status` becomes 'done' for
// the row, and every other co-assignee gets silently credited with having
// closed it too, even though they didn't. This caused dashboard stats
// (PendingPopup, dashboard cards, frequency breakdown) to disagree with
// each other and to misattribute completion between team members.
//
// THE FIX: every closure — for every frequency, not just daily — is now
// recorded per-user in `task_closures` (task_id, user_id, date). "Pending"
// and "closed" are always computed per assignee from that table, scoped to
// the current period for the task's frequency. `tasks.status`/`closed_by`/
// `closed_at` are kept for display/back-compat (e.g. "closed by X on Y" in
// the Closed tab) but are no longer the source of truth for multi-assignee
// completion state.
// ─────────────────────────────────────────────────────────────────────────

export type ClosureRow = { task_id: string; user_id: string; date: string; closed_at?: string }
export type AnyTask = {
  id: string
  frequency: string
  status: string
  due_date?: string | null
  assignees?: string[] | null
  assigned_to?: string | null
}

export function getAssigneeIds(task: AnyTask): string[] {
  if (task.assignees && task.assignees.length > 0) return task.assignees
  if (task.assigned_to) return [task.assigned_to]
  return []
}

function pad(n: number) { return n < 10 ? `0${n}` : `${n}` }

/** ISO-ish week key, e.g. "2026-W31", stable across the same Mon–Sun window. */
export function weekKey(d: Date): string {
  const date = new Date(d.getTime())
  date.setHours(0, 0, 0, 0)
  // Shift to Monday-start week
  const day = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - day)
  const year = date.getFullYear()
  const jan1 = new Date(year, 0, 1)
  const week = Math.ceil(((date.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  return `${year}-W${pad(week)}`
}

export function monthKey(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}` }
export function quarterKey(d: Date): string { return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}` }
export function yearKey(d: Date): string { return `${d.getFullYear()}` }
export function dayKey(d: Date): string { return d.toISOString().split('T')[0] }

/**
 * The "period key" that scopes a closure for a given frequency and date.
 * 'once' tasks use a fixed sentinel — they have exactly one period, ever.
 */
export function periodKeyFor(frequency: string, d: Date = new Date()): string {
  switch (frequency) {
    case 'daily':     return dayKey(d)
    case 'weekly':    return weekKey(d)
    case 'monthly':   return monthKey(d)
    case 'quarterly': return quarterKey(d)
    case 'yearly':    return yearKey(d)
    default:          return 'once' // one-time tasks: single evergreen period
  }
}

/** Has this specific member closed this task in the given period? */
export function closedByMemberInPeriod(
  closures: ClosureRow[], memberId: string, taskId: string, periodKey: string
): boolean {
  return closures.some(c => c.user_id === memberId && c.task_id === taskId && c.date === periodKey)
}

/**
 * Is this task pending for a specific member right now?
 * - Member must actually be assigned to the task.
 * - "Pending" means: this member has not recorded a closure for the
 *   task's current period (day/week/month/quarter/year/once).
 * This treats every frequency the same way daily tasks already worked,
 * so a shared task doesn't silently close for a co-assignee who never
 * touched it.
 */
export function isTaskPendingForMember(task: AnyTask, memberId: string, closures: ClosureRow[], now: Date = new Date()): boolean {
  if (!getAssigneeIds(task).includes(memberId)) return false
  const key = periodKeyFor(task.frequency, now)
  return !closedByMemberInPeriod(closures, memberId, task.id, key)
}

export function isTaskOverdueForMember(task: AnyTask, memberId: string, closures: ClosureRow[], now: Date = new Date()): boolean {
  if (!isTaskPendingForMember(task, memberId, closures, now)) return false
  return !!task.due_date && new Date(task.due_date) < now
}

/** Task-level "pending" = pending for at least one of its assignees (or, if unassigned, by itself). */
export function isTaskPending(task: AnyTask, closures: ClosureRow[], now: Date = new Date()): boolean {
  const ids = getAssigneeIds(task)
  if (ids.length === 0) {
    const key = periodKeyFor(task.frequency, now)
    return !closures.some(c => c.task_id === task.id && c.date === key)
  }
  return ids.some(id => isTaskPendingForMember(task, id, closures, now))
}

export function isTaskDone(task: AnyTask, closures: ClosureRow[], now: Date = new Date()): boolean {
  return !isTaskPending(task, closures, now)
}

export function isTaskOverdue(task: AnyTask, closures: ClosureRow[], now: Date = new Date()): boolean {
  if (!isTaskPending(task, closures, now)) return false
  return !!task.due_date && new Date(task.due_date) < now
}
