'use client'
import { Profile, Task } from '@/lib/types'
import { X, AlertCircle, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  open: boolean
  onClose: () => void
  tasks: Task[]
  members: Profile[]
}

const AV_COLORS = [
  ['bg-purple-100','text-purple-700'],
  ['bg-teal-100','text-teal-700'],
  ['bg-amber-100','text-amber-700'],
  ['bg-blue-100','text-blue-700'],
  ['bg-rose-100','text-rose-700'],
]

export default function PendingPopup({ open, onClose, tasks, members }: Props) {
  const router = useRouter()
  if (!open) return null

  const pending  = tasks.filter(t => t.status !== 'done')
  const overdue  = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date())
  const done     = tasks.filter(t => t.status === 'done')

  function memberPending(memberId: string) {
    return pending.filter(t => t.assigned_to === memberId)
  }
  function memberOverdue(memberId: string) {
    return overdue.filter(t => t.assigned_to === memberId)
  }

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
            { label: 'Pending',   val: pending.length, color: 'text-red-600' },
            { label: 'Overdue',   val: overdue.length, color: 'text-amber-600' },
            { label: 'Completed', val: done.length,    color: 'text-green-600' },
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
            const mp = memberPending(m.id)
            const mo = memberOverdue(m.id)
            const total = tasks.filter(t => t.assigned_to === m.id).length
            const pct = total ? Math.round(mp.length / total * 100) : 0
            return (
              <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                <div className={`w-9 h-9 rounded-full ${bg} ${fc} flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
                  {m.full_name.slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
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
