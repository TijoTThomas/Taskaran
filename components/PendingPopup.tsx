'use client'
import { Profile } from '@/lib/types'
import { X, AlertCircle, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  open: boolean
  onClose: () => void
  tasks: any[]
  members: Profile[]
  closures?: any[]   // task_closures rows for today (optional — falls back to status)
}

const AV_COLORS = [
  ['bg-purple-100','text-purple-700'],
  ['bg-teal-100','text-teal-700'],
  ['bg-amber-100','text-amber-700'],
  ['bg-blue-100','text-blue-700'],
  ['bg-rose-100','text-rose-700'],
]

export default function PendingPopup({ open, onClose, tasks, members, closures = [] }: Props) {
  const router = useRouter()
  if (!open) return null

  const today = new Date().toISOString().split('T')[0]

  function getAssigneeIds(task: any): string[] {
    if (task.assignees && task.assignees.length > 0) return task.assignees
    if (task.assigned_to) return [task.assigned_to]
    return []
  }

  // A task is truly pending for a member:
  // - non-daily: status !== 'done'
  // - daily: no entry in task_closures for this user+task today
  function isTaskPendingForMember(task: any, memberId: string): boolean {
    if (!getAssigneeIds(task).includes(memberId)) return false
    if (task.frequency === 'daily') {
      return !closures.some(c => c.user_id === memberId && c.task_id === task.id && c.date === today)
    }
    return task.status !== 'done'
  }

  function isTaskOverdueForMember(task: any, memberId: string): boolean {
    if (!isTaskPendingForMember(task, memberId)) return false
    return !!task.due_date && new Date(task.due_date) < new Date()
  }

  // Overall counts — unique tasks
  const allPending = tasks.filter(t => {
    if (t.frequency === 'daily') {
      return !closures.some(c => c.task_id === t.id && c.date === today)
    }
    return t.status !== 'done'
  })
  const allOverdue = allPending.filter(t => t.due_date && new Date(t.due_date) < new Date())
  const allDone    = tasks.filter(t => {
    if (t.frequency === 'daily') {
      return closures.some(c => c.task_id === t.id && c.date === today)
    }
    return t.status === 'done'
  })

  function countClass(n: number) {
    if (n === 0) return 'bg-gray-100 text-gray-500'
    if (n >= 3)  return 'bg-red-100 text-red-700'
    if (n >= 2)  return 'bg-amber-100 text-amber-700'
    return 'bg-green-100 text-green-700'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-red-500" />
            <h2 className="font-semibold text-gray-900">Pending tasks — member breakdown</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-3 px-6 py-4 border-b border-gray-100">
          {[
            { label: 'Pending',   val: allPending.length, color: 'text-red-600' },
            { label: 'Overdue',   val: allOverdue.length, color: 'text-amber-600' },
            { label: 'Completed', val: allDone.length,    color: 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
              <div className={`text-2xl font-semibold ${s.color}`}>{s.val}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Member rows */}
        <div className="px-6 py-3 max-h-72 overflow-y-auto">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Member-wise pending</p>
          {members.map((m, i) => {
            const [bg, fc] = AV_COLORS[i % AV_COLORS.length]
            const memberTasks = tasks.filter(t => getAssigneeIds(t).includes(m.id))
            const mp = memberTasks.filter(t => isTaskPendingForMember(t, m.id))
            const mo = memberTasks.filter(t => isTaskOverdueForMember(t, m.id))
            const total = memberTasks.length
            const pct = total ? Math.round(mp.length / total * 100) : 0
            return (
              <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                <div className={`w-9 h-9 rounded-full ${bg} ${fc} flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
                  {m.full_name.slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{m.full_name}</span>
                    <span className="badge bg-gray-100 text-gray-500 capitalize text-xs">{m.role}</span>
                    {mo.length > 0 && (
                      <span className="badge bg-red-100 text-red-700 text-xs">{mo.length} overdue</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">{m.department || 'No dept'} · {total} total tasks</div>
                  <div className="w-full h-1 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold ${countClass(mp.length)}`}>
                  {mp.length}
                </div>
              </div>
            )
          })}
          {members.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-4">No team members yet</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Dismiss</button>
          <button onClick={() => { onClose(); router.push('/tasks') }} className="btn-primary">
            View task board <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
