'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Profile } from '@/lib/types'
import Sidebar from '@/components/Sidebar'
import PendingPopup from '@/components/PendingPopup'
import {
  ClipboardList, CheckCircle, AlertTriangle, Clock,
  Bell, CheckCircle2, XCircle, ChevronDown, ChevronUp
} from 'lucide-react'

const AV = [['bg-purple-100','text-purple-700'],['bg-teal-100','text-teal-700'],['bg-amber-100','text-amber-700'],['bg-blue-100','text-blue-700'],['bg-rose-100','text-rose-700']]
const FREQ_COLOR: Record<string,string> = { daily:'bg-green-100 text-green-700', weekly:'bg-blue-100 text-blue-700', monthly:'bg-teal-100 text-teal-700', quarterly:'bg-amber-100 text-amber-700', yearly:'bg-rose-100 text-rose-700', once:'bg-gray-100 text-gray-600' }

function toDateStr(d: Date) { return d.toISOString().split('T')[0] }

export default function DashboardPage() {
  const router = useRouter()
  const [profile,     setProfile]     = useState<Profile | null>(null)
  const [tasks,       setTasks]       = useState<any[]>([])
  const [members,     setMembers]     = useState<Profile[]>([])
  const [closures,    setClosures]    = useState<any[]>([])
  const [popup,       setPopup]       = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [detailPopup, setDetailPopup] = useState<{freq:string, type:'closed'|'open', tasks:any[]} | null>(null)
  const [expandedFreq,setExpandedFreq]= useState<string|null>(null)

  const today     = toDateStr(new Date())
  const thisMonth = today.slice(0,7)
  const thisYear  = today.slice(0,4)

  const load = useCallback(async (uid: string) => {
    // Auto-reset stale daily tasks
    const { data: staleDailies } = await supabase
      .from('tasks').select('id, closed_at').eq('frequency', 'daily').eq('status', 'done')
    if (staleDailies) {
      const toReset = staleDailies.filter((t:any) => !t.closed_at || t.closed_at.split('T')[0] < today)
      if (toReset.length > 0) {
        await supabase.from('tasks').update({ status: 'pending', closed_by: null, closed_at: null })
          .in('id', toReset.map((t:any) => t.id))
      }
    }
    const [{ data: p }, { data: t }, { data: m }, { data: cl }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('task_closures').select('*'),
    ])
    if (p) setProfile(p)
    if (t) setTasks(t)
    if (m) setMembers(m)
    if (cl) setClosures(cl)
  }, [today])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace('/login'); return }
      await load(data.session.user.id)
      setLoading(false)
    })
  }, [router, load])

  useEffect(() => {
    if (profile && (profile.role === 'admin' || profile.role === 'manager')) {
      setTimeout(() => setPopup(true), 600)
    }
  }, [profile])

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  function getAssigneeIds(task: any): string[] {
    if (task.assignees?.length) return task.assignees
    if (task.assigned_to) return [task.assigned_to]
    return []
  }

  // ── Unified "is this task pending?" logic ────────────────────────────────
  // Daily tasks: check task_closures (status resets daily so status alone is wrong)
  // Other tasks: use status field
  function isTaskPending(task: any): boolean {
    if (task.frequency === 'daily') {
      return !closures.some(c => c.task_id === task.id && c.date === today)
    }
    return task.status !== 'done'
  }

  function isTaskDone(task: any): boolean {
    if (task.frequency === 'daily') {
      return closures.some(c => c.task_id === task.id && c.date === today)
    }
    return task.status === 'done'
  }

  // ── Per-user closure checks (for frequency breakdown) ────────────────────
  function closedByUserOn(userId: string, taskId: string, dateStr: string) {
    return closures.some(c => c.user_id === userId && c.task_id === taskId && c.date === dateStr)
  }
  function closedByUserInMonth(userId: string, taskId: string, month: string) {
    return closures.some(c => c.user_id === userId && c.task_id === taskId && c.date.startsWith(month))
  }
  function closedByUserInYear(userId: string, taskId: string, year: string) {
    return closures.some(c => c.user_id === userId && c.task_id === taskId && c.date.startsWith(year))
  }

  function memberTasksByFreq(memberId: string, freq: string) {
    return tasks.filter(t => t.frequency === freq && getAssigneeIds(t).includes(memberId))
  }

  function getMemberFreqStats(memberId: string, freq: string) {
    const mt = memberTasksByFreq(memberId, freq)
    let closed: any[] = [], open: any[] = []
    if (freq === 'daily') {
      closed = mt.filter(t => closedByUserOn(memberId, t.id, today))
      open   = mt.filter(t => !closedByUserOn(memberId, t.id, today))
    } else if (freq === 'monthly' || freq === 'quarterly') {
      closed = mt.filter(t => closedByUserInMonth(memberId, t.id, thisMonth) || t.status === 'done')
      open   = mt.filter(t => !(closedByUserInMonth(memberId, t.id, thisMonth) || t.status === 'done'))
    } else if (freq === 'yearly') {
      closed = mt.filter(t => closedByUserInYear(memberId, t.id, thisYear) || t.status === 'done')
      open   = mt.filter(t => !(closedByUserInYear(memberId, t.id, thisYear) || t.status === 'done'))
    } else {
      closed = mt.filter(t => t.status === 'done')
      open   = mt.filter(t => t.status !== 'done')
    }
    return { total: mt.length, closed, open }
  }

  const FREQ_SECTIONS = [
    { key:'daily',     label:'Daily',     period:'Today' },
    { key:'weekly',    label:'Weekly',    period:'This week' },
    { key:'monthly',   label:'Monthly',   period:'This month' },
    { key:'quarterly', label:'Quarterly', period:'This quarter' },
    { key:'yearly',    label:'Yearly',    period:'This year' },
    { key:'once',      label:'One-time',  period:'All time' },
  ]

  // ── Stat counts — consistent across all three places ─────────────────────
  const pending  = tasks.filter(t => isTaskPending(t))
  const overdue  = tasks.filter(t => isTaskPending(t) && t.due_date && new Date(t.due_date) < new Date())
  const done     = tasks.filter(t => isTaskDone(t))
  const canAlert = profile.role === 'admin' || profile.role === 'manager'
  const isMgr    = profile.role === 'admin' || profile.role === 'manager'
  const reportMembers = isMgr ? members : members.filter(m => m.id === profile.id)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} pendingCount={pending.length} onBellClick={() => setPopup(true)}/>

      {/* Detail popup */}
      {detailPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetailPopup(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className={`px-6 py-4 flex items-center justify-between ${detailPopup.type==='closed'?'bg-green-500':'bg-red-500'}`}>
              <div className="flex items-center gap-3">
                {detailPopup.type==='closed'
                  ? <CheckCircle2 size={20} className="text-white"/>
                  : <XCircle size={20} className="text-white"/>}
                <div>
                  <h3 className="font-semibold text-white">
                    {detailPopup.type==='closed'?'✅ Closed':'❌ Open'} — {detailPopup.freq} tasks ({detailPopup.tasks.length})
                  </h3>
                  <p className="text-xs text-white/80 mt-0.5">Click a task to view full details</p>
                </div>
              </div>
              <button onClick={() => setDetailPopup(null)} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold">✕</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-50">
              {detailPopup.tasks.length === 0
                ? <div className="py-12 text-center text-gray-400 text-sm">
                    {detailPopup.type==='closed' ? 'No tasks closed yet' : '🎉 All tasks closed!'}
                  </div>
                : detailPopup.tasks.map(task => {
                    const ids = getAssigneeIds(task)
                    const assignees = ids.map(id => members.find(m => m.id === id)).filter(Boolean) as Profile[]
                    return (
                      <div key={task.id} className={`px-5 py-3.5 ${detailPopup.type==='closed'?'bg-green-50/20':'bg-red-50/10'}`}>
                        <div className="flex items-start gap-3">
                          {detailPopup.type==='closed'
                            ? <CheckCircle2 size={15} className="text-green-500 mt-0.5 flex-shrink-0"/>
                            : <XCircle size={15} className="text-red-400 mt-0.5 flex-shrink-0"/>}
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{task.title}</p>
                            {task.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{task.description}</p>}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {assignees.map((m, i) => {
                                const [bg, fc] = AV[i % AV.length]
                                return (
                                  <div key={m.id} className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${bg}`}>
                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold ${fc}`}>
                                      {m.full_name.slice(0,1).toUpperCase()}
                                    </div>
                                    <span className={`text-xs font-medium ${fc}`}>{m.full_name.split(' ')[0]}</span>
                                  </div>
                                )
                              })}
                              {task.due_date && <span className="text-xs text-gray-400">Due: {task.due_date}</span>}
                              {task.closed_at && (
                                <span className="text-xs text-green-600">
                                  Closed: {new Date(task.closed_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
              }
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button onClick={() => setDetailPopup(null)} className="btn-secondary text-xs">Close</button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Good day, {profile.full_name.split(' ')[0]} 👋</h1>
              <p className="text-sm text-gray-400 mt-0.5 capitalize">
                {profile.role} · {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
              </p>
            </div>
            {canAlert && pending.length > 0 && (
              <button onClick={() => setPopup(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-100">
                <Bell size={15}/> {pending.length} pending tasks
              </button>
            )}
          </div>

          {/* Stat cards — all use the same isTaskPending/isTaskDone logic */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label:'Total tasks', val: tasks.length,  icon: ClipboardList, color:'text-indigo-600', bg:'bg-indigo-50' },
              { label:'Pending',     val: pending.length, icon: Clock,         color:'text-red-600',    bg:'bg-red-50',   click: canAlert?()=>setPopup(true):undefined },
              { label:'Overdue',     val: overdue.length, icon: AlertTriangle, color:'text-amber-600',  bg:'bg-amber-50', click: canAlert?()=>setPopup(true):undefined },
              { label:'Completed',   val: done.length,    icon: CheckCircle,   color:'text-green-600',  bg:'bg-green-50' },
            ].map(s => (
              <div key={s.label} onClick={s.click}
                className={`card p-4 ${s.click?'cursor-pointer hover:shadow-md':''} transition-shadow`}>
                <div className={`w-9 h-9 ${s.bg} ${s.color} rounded-lg flex items-center justify-center mb-3`}>
                  <s.icon size={18}/>
                </div>
                <div className={`text-2xl font-semibold ${s.color}`}>{s.val}</div>
                <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Task completion by frequency — member wise */}
          <div className="card overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">Task completion by frequency — member wise</h3>
              <p className="text-xs text-gray-400 mt-0.5">Click Closed / Open numbers to see full task list</p>
            </div>

            {FREQ_SECTIONS.map(({ key, label, period }) => {
              const hasTasks = reportMembers.some(m => memberTasksByFreq(m.id, key).length > 0)
              if (!hasTasks) return null

              const isExpanded = expandedFreq === key
              let totalClosed = 0, totalOpen = 0, totalAll = 0
              reportMembers.forEach(m => {
                const s = getMemberFreqStats(m.id, key)
                totalClosed += s.closed.length
                totalOpen   += s.open.length
                totalAll    += s.total
              })
              const pct = totalAll ? Math.round(totalClosed/totalAll*100) : 0

              return (
                <div key={key} className="border-b border-gray-50 last:border-0">
                  <button
                    onClick={() => setExpandedFreq(isExpanded ? null : key)}
                    className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left">
                    <span className={`badge text-xs w-20 justify-center flex-shrink-0 ${FREQ_COLOR[key]}`}>{label}</span>
                    <span className="text-xs text-gray-400 w-20 flex-shrink-0">{period}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct===100?'bg-green-500':pct===0?'bg-red-300':'bg-amber-400'}`}
                          style={{ width:`${pct}%` }}/>
                      </div>
                      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-green-600 font-semibold w-16 text-right">{totalClosed} closed</span>
                      <span className="text-xs text-red-500 font-semibold w-14 text-right">{totalOpen} open</span>
                      {isExpanded ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="bg-gray-50/60 border-t border-gray-100 divide-y divide-gray-100">
                      {reportMembers.map((m, mi) => {
                        const s = getMemberFreqStats(m.id, key)
                        if (s.total === 0) return null
                        const [bg, fc] = AV[mi % AV.length]
                        const mpct = Math.round(s.closed.length/s.total*100)
                        return (
                          <div key={m.id} className="flex items-center gap-4 px-6 py-3">
                            <div className={`w-7 h-7 rounded-full ${bg} ${fc} flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
                              {m.full_name.slice(0,2).toUpperCase()}
                            </div>
                            <span className="text-xs font-medium text-gray-700 w-28 flex-shrink-0 truncate">{m.full_name.split(' ')[0]}</span>
                            <div className="flex-1 flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${mpct===100?'bg-green-500':mpct===0?'bg-red-300':'bg-amber-400'}`}
                                  style={{ width:`${mpct}%` }}/>
                              </div>
                              <span className="text-xs text-gray-400 w-8 text-right">{mpct}%</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => setDetailPopup({ freq: `${label} — ${m.full_name.split(' ')[0]}`, type:'closed', tasks: s.closed })}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs font-semibold hover:bg-green-100 transition-colors">
                                <CheckCircle2 size={11}/> {s.closed.length}
                              </button>
                              <button
                                onClick={() => setDetailPopup({ freq: `${label} — ${m.full_name.split(' ')[0]}`, type:'open', tasks: s.open })}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors">
                                <XCircle size={11}/> {s.open.length}
                              </button>
                              <span className="text-xs text-gray-400 w-12 text-right">{s.total} total</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Overdue tasks */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-500"/> Overdue tasks
            </h3>
            {overdue.length === 0
              ? <p className="text-xs text-gray-400 text-center py-6 flex flex-col items-center gap-2">
                  <CheckCircle size={20} className="text-green-400"/>No overdue tasks — great work!
                </p>
              : overdue.map(t => {
                  const ids = getAssigneeIds(t)
                  const assignees = ids.map(id => members.find(m => m.id === id)).filter(Boolean) as Profile[]
                  const days = Math.round((Date.now() - new Date(t.due_date!).getTime()) / 86400000)
                  return (
                    <div key={t.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                      <div className="flex items-center flex-shrink-0">
                        {assignees.length === 0
                          ? <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">?</div>
                          : assignees.slice(0,2).map((m, i) => {
                              const [bg, fc] = AV[i % AV.length]
                              return (
                                <div key={m.id} title={m.full_name}
                                  className={`w-8 h-8 rounded-full ${bg} ${fc} flex items-center justify-center text-xs font-semibold border-2 border-white ${i>0?'-ml-2':''}`}>
                                  {m.full_name.slice(0,2).toUpperCase()}
                                </div>
                              )
                            })
                        }
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{t.title}</p>
                        <p className="text-xs text-gray-400">
                          {assignees.length > 0 ? assignees.map(m=>m.full_name).join(', ') : 'Unassigned'} · due {t.due_date}
                        </p>
                      </div>
                      <span className="badge bg-red-100 text-red-700 text-xs">{days}d overdue</span>
                      <span className={`badge text-xs ${t.priority==='high'?'bg-red-100 text-red-700':t.priority==='medium'?'bg-amber-100 text-amber-700':'bg-green-100 text-green-700'}`}>
                        {t.priority}
                      </span>
                    </div>
                  )
                })
            }
          </div>

        </div>
      </main>

      {/* Pass closures to PendingPopup so it uses the same logic */}
      <PendingPopup open={popup} onClose={() => setPopup(false)} tasks={tasks} members={members} closures={closures}/>
    </div>
  )
}
