'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Profile } from '@/lib/types'
import Sidebar from '@/components/Sidebar'
import toast from 'react-hot-toast'
import { CheckCircle, XCircle, Clock, Calendar, ChevronLeft, ChevronRight, Download, X, List } from 'lucide-react'

const AV = [['bg-purple-100','text-purple-700'],['bg-teal-100','text-teal-700'],['bg-amber-100','text-amber-700'],['bg-blue-100','text-blue-700'],['bg-rose-100','text-rose-700']]

function toDateStr(d: Date) { return d.toISOString().split('T')[0] }

export default function ReportsPage() {
  const router = useRouter()
  const [profile,    setProfile]    = useState<Profile | null>(null)
  const [members,    setMembers]    = useState<Profile[]>([])
  const [dailyTasks, setDailyTasks] = useState<any[]>([])
  const [closures,   setClosures]   = useState<any[]>([])
  const [pending2,   setPending2]   = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [selDate,    setSelDate]    = useState(toDateStr(new Date()))
  const [viewMode,   setViewMode]   = useState<'day'|'range'>('day')
  const [rangeStart, setRangeStart] = useState(toDateStr(new Date(Date.now() - 6*86400000)))
  const [rangeEnd,   setRangeEnd]   = useState(toDateStr(new Date()))

  // Popup state
  const [detailPopup, setDetailPopup] = useState<'closed'|'open'|null>(null)

  const today = toDateStr(new Date())

  const load = useCallback(async (uid: string) => {
    const [{ data: p }, { data: m }, { data: t }, { data: all }, { data: cl }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('tasks').select('*').eq('frequency', 'daily').order('title'),
      supabase.from('tasks').select('status'),
      supabase.from('task_closures').select('*'),
    ])
    if (p) setProfile(p)
    if (m) setMembers(m)
    if (t) setDailyTasks(t)
    if (cl) setClosures(cl)
    setPending2((all||[]).filter((x:any) => x.status !== 'done').length)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace('/login'); return }
      await load(data.session.user.id)
      setLoading(false)
    })
  }, [router, load])

  function getAssigneeIds(task: any): string[] {
    if (task.assignees?.length) return task.assignees
    if (task.assigned_to) return [task.assigned_to]
    return []
  }

  function userClosedOn(userId: string, taskId: string, dateStr: string): any | null {
    return closures.find(c => c.user_id === userId && c.task_id === taskId && c.date === dateStr) || null
  }

  function userClosedInRange(userId: string, taskId: string, start: string, end: string): any | null {
    return closures.find(c => c.user_id === userId && c.task_id === taskId && c.date >= start && c.date <= end) || null
  }

  function memberDailyTasks(memberId: string) {
    return dailyTasks.filter(t => getAssigneeIds(t).includes(memberId))
  }

  // Unique task stats for day mode
  function getUniqueStats() {
    const isDay = viewMode === 'day'
    const closedTasks = dailyTasks.filter(t =>
      isDay
        ? reportMembers.some(m => userClosedOn(m.id, t.id, selDate))
        : reportMembers.some(m => userClosedInRange(m.id, t.id, rangeStart, rangeEnd))
    )
    const openTasks = dailyTasks.filter(t =>
      !(isDay
        ? reportMembers.some(m => userClosedOn(m.id, t.id, selDate))
        : reportMembers.some(m => userClosedInRange(m.id, t.id, rangeStart, rangeEnd)))
    )
    return { total: dailyTasks.length, closed: closedTasks, open: openTasks }
  }

  // For popup: who closed a task and when
  function getClosureDetails(taskId: string) {
    const isDay = viewMode === 'day'
    return members.map(m => {
      const cl = isDay
        ? userClosedOn(m.id, taskId, selDate)
        : userClosedInRange(m.id, taskId, rangeStart, rangeEnd)
      return { member: m, closure: cl }
    }).filter(x => getAssigneeIds(dailyTasks.find(t => t.id === taskId)||{}).includes(x.member.id))
  }

  function downloadCSV() {
    const rows = ['Member,Task,Status,Closed At']
    const isDay = viewMode === 'day'
    members.forEach(m => {
      memberDailyTasks(m.id).forEach(t => {
        const cl = isDay ? userClosedOn(m.id, t.id, selDate) : userClosedInRange(m.id, t.id, rangeStart, rangeEnd)
        rows.push(`"${m.full_name}","${t.title}","${cl?'Closed':'Open'}","${cl?.closed_at||'—'}"`)
      })
    })
    const blob = new Blob([rows.join('\n')], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `daily_report_${viewMode==='day'?selDate:`${rangeStart}_to_${rangeEnd}`}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Report downloaded!')
  }

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  const isMgr = profile.role === 'admin' || profile.role === 'manager'
  const reportMembers = isMgr ? members : members.filter(m => m.id === profile.id)
  const isToday = selDate === today
  const stats = getUniqueStats()

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} pendingCount={pending2} onBellClick={() => {}}/>

      {/* ── DETAIL POPUP ── */}
      {detailPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetailPopup(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className={`px-6 py-4 flex items-center justify-between ${detailPopup==='closed'?'bg-green-500':'bg-red-500'}`}>
              <div className="flex items-center gap-3">
                {detailPopup==='closed'
                  ? <CheckCircle size={20} className="text-white"/>
                  : <XCircle size={20} className="text-white"/>
                }
                <div>
                  <h3 className="font-semibold text-white text-base">
                    {detailPopup==='closed' ? `✅ Closed tasks (${stats.closed.length})` : `❌ Open tasks (${stats.open.length})`}
                  </h3>
                  <p className="text-xs text-white/80 mt-0.5">
                    {viewMode==='day' ? selDate : `${rangeStart} to ${rangeEnd}`}
                  </p>
                </div>
              </div>
              <button onClick={() => setDetailPopup(null)} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white">
                <X size={16}/>
              </button>
            </div>

            {/* Task list */}
            <div className="max-h-[65vh] overflow-y-auto divide-y divide-gray-50">
              {(detailPopup === 'closed' ? stats.closed : stats.open).map(task => {
                const details = getClosureDetails(task.id)
                const assignedMembers = details
                return (
                  <div key={task.id} className={`px-5 py-4 ${detailPopup==='closed'?'bg-green-50/20':'bg-red-50/20'}`}>
                    <div className="flex items-start gap-3">
                      {detailPopup==='closed'
                        ? <CheckCircle size={16} className="text-green-500 mt-0.5 flex-shrink-0"/>
                        : <XCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0"/>
                      }
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{task.title}</p>
                        {task.description && <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>}

                        {/* Who closed / who didn't */}
                        <div className="mt-2 space-y-1">
                          {assignedMembers.map(({ member, closure }, i) => {
                            const [bg, fc] = AV[i % AV.length]
                            const closedAt = closure?.closed_at
                              ? new Date(closure.closed_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
                              : null
                            return (
                              <div key={member.id} className="flex items-center gap-2">
                                <div className={`w-5 h-5 rounded-full ${bg} ${fc} flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
                                  {member.full_name.slice(0,2).toUpperCase()}
                                </div>
                                <span className="text-xs text-gray-600">{member.full_name}</span>
                                {closure ? (
                                  <span className="flex items-center gap-1 text-xs text-green-600 ml-auto">
                                    <CheckCircle size={11}/> {closedAt}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-xs text-red-500 ml-auto">
                                    <XCircle size={11}/> Not closed
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {(detailPopup === 'closed' ? stats.closed : stats.open).length === 0 && (
                <div className="px-6 py-12 text-center">
                  <p className="text-gray-400 text-sm">
                    {detailPopup==='closed' ? 'No tasks closed yet' : '🎉 All tasks are closed!'}
                  </p>
                </div>
              )}
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
              <h1 className="text-xl font-semibold text-gray-900">Daily task report</h1>
              <p className="text-sm text-gray-400">Individual user-wise daily task completion</p>
            </div>
            <button onClick={downloadCSV} className="btn-secondary"><Download size={14}/> Export CSV</button>
          </div>

          {/* Date picker */}
          <div className="card p-4 mb-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button onClick={() => setViewMode('day')}
                  className={`px-4 py-2 text-xs font-medium transition-colors ${viewMode==='day'?'bg-indigo-600 text-white':'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  Single day
                </button>
                <button onClick={() => setViewMode('range')}
                  className={`px-4 py-2 text-xs font-medium transition-colors ${viewMode==='range'?'bg-indigo-600 text-white':'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  Date range
                </button>
              </div>
              {viewMode === 'day' ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => { const d=new Date(selDate); d.setDate(d.getDate()-1); setSelDate(toDateStr(d)) }}
                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronLeft size={14}/></button>
                  <div className="flex items-center gap-2 border border-indigo-200 bg-indigo-50 rounded-lg px-3 py-1.5">
                    <Calendar size={14} className="text-indigo-600"/>
                    <input type="date" value={selDate} max={today} onChange={e=>setSelDate(e.target.value)}
                      className="text-sm font-medium text-indigo-700 bg-transparent focus:outline-none"/>
                  </div>
                  <button onClick={() => { const d=new Date(selDate); d.setDate(d.getDate()+1); if(toDateStr(d)<=today) setSelDate(toDateStr(d)) }}
                    disabled={isToday} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"><ChevronRight size={14}/></button>
                  <button onClick={() => setSelDate(today)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${isToday?'bg-indigo-600 text-white border-indigo-600':'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    Today
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-gray-400">From</span>
                    <input type="date" value={rangeStart} max={rangeEnd} onChange={e=>setRangeStart(e.target.value)}
                      className="text-sm text-gray-700 bg-transparent focus:outline-none"/>
                  </div>
                  <span className="text-gray-400 text-xs">to</span>
                  <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-gray-400">To</span>
                    <input type="date" value={rangeEnd} min={rangeStart} max={today} onChange={e=>setRangeEnd(e.target.value)}
                      className="text-sm text-gray-700 bg-transparent focus:outline-none"/>
                  </div>
                  {[{label:'Last 7 days',days:7},{label:'Last 30 days',days:30}].map(p => (
                    <button key={p.label} onClick={() => { setRangeEnd(today); setRangeStart(toDateStr(new Date(Date.now()-(p.days-1)*86400000))) }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">{p.label}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── UNIQUE TASK SUMMARY CARDS (clickable) ── */}
          <div className="grid grid-cols-3 gap-4 mb-6">

            {/* Total */}
            <div className="card p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <List size={22} className="text-indigo-600"/>
              </div>
              <div>
                <div className="text-3xl font-bold text-indigo-600">{stats.total}</div>
                <div className="text-xs text-gray-400 mt-0.5">Total unique daily tasks</div>
              </div>
            </div>

            {/* Closed — clickable */}
            <button onClick={() => setDetailPopup('closed')}
              className="card p-5 flex items-center gap-4 hover:shadow-md hover:border-green-200 transition-all text-left w-full cursor-pointer">
              <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle size={22} className="text-green-600"/>
              </div>
              <div>
                <div className="text-3xl font-bold text-green-600">{stats.closed.length}</div>
                <div className="text-xs text-gray-400 mt-0.5">Closed</div>
                <div className="text-xs text-green-600 font-medium mt-1">Click for details →</div>
              </div>
            </button>

            {/* Open — clickable */}
            <button onClick={() => setDetailPopup('open')}
              className="card p-5 flex items-center gap-4 hover:shadow-md hover:border-red-200 transition-all text-left w-full cursor-pointer">
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <XCircle size={22} className="text-red-500"/>
              </div>
              <div>
                <div className="text-3xl font-bold text-red-600">{stats.open.length}</div>
                <div className="text-xs text-gray-400 mt-0.5">Still open</div>
                <div className="text-xs text-red-500 font-medium mt-1">Click for details →</div>
              </div>
            </button>
          </div>

          {/* Progress bar */}
          {stats.total > 0 && (
            <div className="card p-4 mb-6">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                <span className="font-medium">Overall completion</span>
                <span className="font-semibold text-gray-700">{Math.round(stats.closed.length/stats.total*100)}%</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width:`${Math.round(stats.closed.length/stats.total*100)}%` }}/>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                <span>{stats.closed.length} closed</span>
                <span>{stats.open.length} remaining</span>
              </div>
            </div>
          )}

          {/* Member cards */}
          <div className="space-y-4">
            {reportMembers.map((m, mi) => {
              const [bg, fc] = AV[mi % AV.length]
              const mt = memberDailyTasks(m.id)
              if (mt.length === 0) return null
              const closedCount = mt.filter(t =>
                viewMode==='day' ? userClosedOn(m.id, t.id, selDate) : userClosedInRange(m.id, t.id, rangeStart, rangeEnd)
              ).length
              const total   = mt.length
              const pct     = Math.round(closedCount/total*100)
              const allDone = closedCount === total
              const noneDone= closedCount === 0
              return (
                <div key={m.id} className={`card overflow-hidden border-l-4 ${allDone?'border-l-green-400':noneDone?'border-l-red-400':'border-l-amber-400'}`}>
                  <div className="px-5 py-4 flex items-center gap-4 border-b border-gray-100">
                    <div className={`w-10 h-10 rounded-full ${bg} ${fc} flex items-center justify-center text-sm font-semibold flex-shrink-0`}>
                      {m.full_name.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-gray-900">{m.full_name}</span>
                        <span className="text-xs text-gray-400 capitalize">{m.role}</span>
                        {allDone   && <span className="badge bg-green-100 text-green-700 text-xs">✅ All done</span>}
                        {noneDone  && <span className="badge bg-red-100 text-red-700 text-xs">⚠️ None closed</span>}
                        {!allDone && !noneDone && <span className="badge bg-amber-100 text-amber-700 text-xs">⏳ {closedCount}/{total} done</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">{closedCount} of {total} closed</span>
                        <div className="flex-1 max-w-40 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${allDone?'bg-green-500':noneDone?'bg-red-400':'bg-amber-400'}`} style={{ width:`${pct}%` }}/>
                        </div>
                        <span className={`text-xs font-semibold ${allDone?'text-green-600':noneDone?'text-red-600':'text-amber-600'}`}>{pct}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {mt.map(t => {
                      const cl = viewMode==='day' ? userClosedOn(m.id, t.id, selDate) : userClosedInRange(m.id, t.id, rangeStart, rangeEnd)
                      const closedAt = cl?.closed_at ? new Date(cl.closed_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : null
                      return (
                        <div key={t.id} className={`flex items-center gap-4 px-5 py-3 ${cl?'bg-green-50/30':'bg-red-50/20'}`}>
                          <div className="flex-shrink-0">
                            {cl ? <CheckCircle size={18} className="text-green-500"/> : <XCircle size={18} className="text-red-400"/>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                            {t.description && <p className="text-xs text-gray-400 truncate mt-0.5">{t.description}</p>}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className={`badge text-xs ${cl?'bg-green-100 text-green-700':'bg-red-100 text-red-600'}`}>{cl?'Closed':'Open'}</span>
                            {closedAt && <span className="flex items-center gap-1 text-xs text-gray-400"><Clock size={11}/> {closedAt}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {reportMembers.every(m => memberDailyTasks(m.id).length === 0) && (
              <div className="card p-12 text-center">
                <Calendar size={32} className="text-gray-300 mx-auto mb-3"/>
                <p className="text-gray-500 font-medium">No daily tasks found</p>
                <p className="text-gray-400 text-sm mt-1">Add tasks with frequency "Daily" to see reports here</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
