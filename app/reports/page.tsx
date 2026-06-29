
'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Profile } from '@/lib/types'
import Sidebar from '@/components/Sidebar'
import toast from 'react-hot-toast'
import { CheckCircle, XCircle, Clock, Calendar, ChevronLeft, ChevronRight, Download } from 'lucide-react'

const AV = [['bg-purple-100','text-purple-700'],['bg-teal-100','text-teal-700'],['bg-amber-100','text-amber-700'],['bg-blue-100','text-blue-700'],['bg-rose-100','text-rose-700']]

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
}

export default function ReportsPage() {
  const router = useRouter()
  const [profile,  setProfile]  = useState<Profile | null>(null)
  const [members,  setMembers]  = useState<Profile[]>([])
  const [tasks,    setTasks]    = useState<any[]>([])
  const [pending2, setPending2] = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [selDate,  setSelDate]  = useState(toDateStr(new Date()))
  const [viewMode, setViewMode] = useState<'day'|'range'>('day')
  const [rangeStart, setRangeStart] = useState(toDateStr(new Date(Date.now() - 6 * 86400000)))
  const [rangeEnd,   setRangeEnd]   = useState(toDateStr(new Date()))

  const load = useCallback(async (uid: string) => {
    const [{ data: p }, { data: m }, { data: t }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('profiles').select('*').order('full_name'),
      // Load all daily tasks with closed_at info
      supabase.from('tasks').select('*').eq('frequency', 'daily').order('title'),
    ])
    if (p) setProfile(p)
    if (m) setMembers(m)
    if (t) setTasks(t)
    // pending count for bell
    const { data: all } = await supabase.from('tasks').select('status')
    setPending2((all||[]).filter((t:any) => t.status !== 'done').length)
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

  // Was this task closed ON a specific date?
  function wasClosedOn(task: any, dateStr: string): boolean {
    if (task.status !== 'done' || !task.closed_at) return false
    return task.closed_at.startsWith(dateStr)
  }

  // Was this task closed within a date range?
  function wasClosedInRange(task: any, start: string, end: string): boolean {
    if (task.status !== 'done' || !task.closed_at) return false
    const d = task.closed_at.split('T')[0]
    return d >= start && d <= end
  }

  // Get tasks assigned to a member
  function memberTasks(memberId: string) {
    return tasks.filter(t => getAssigneeIds(t).includes(memberId))
  }

  // Build day report for a member
  function dayReport(memberId: string, dateStr: string) {
    const mt = memberTasks(memberId)
    return mt.map(t => ({
      ...t,
      closedOnDate: wasClosedOn(t, dateStr),
    }))
  }

  // Build range report for a member — how many days they closed each task
  function rangeReport(memberId: string, start: string, end: string) {
    const mt = memberTasks(memberId)
    // Count days in range
    const days: string[] = []
    const cur = new Date(start)
    const endD = new Date(end)
    while (cur <= endD) { days.push(toDateStr(cur)); cur.setDate(cur.getDate()+1) }
    return mt.map(t => ({
      ...t,
      closedInRange: wasClosedInRange(t, start, end),
    }))
  }

  // Summary for a member on a day
  function daySummary(memberId: string, dateStr: string) {
    const report = dayReport(memberId, dateStr)
    const closed = report.filter(t => t.closedOnDate).length
    const total  = report.length
    return { closed, total, open: total - closed, pct: total ? Math.round(closed/total*100) : 0 }
  }

  function downloadCSV() {
    const date = viewMode === 'day' ? selDate : `${rangeStart}_to_${rangeEnd}`
    const rows: string[] = ['Member,Task,Status,Closed At']
    members.forEach(m => {
      const mt = memberTasks(m.id)
      mt.forEach(t => {
        const closed = viewMode === 'day' ? wasClosedOn(t, selDate) : wasClosedInRange(t, rangeStart, rangeEnd)
        rows.push(`"${m.full_name}","${t.title}","${closed?'Closed':'Open'}","${closed&&t.closed_at?t.closed_at:'—'}"`)
      })
    })
    const blob = new Blob([rows.join('\n')], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=`daily_report_${date}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('Report downloaded!')
  }

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  const isAdmin  = profile.role === 'admin'
  const isMgr    = profile.role === 'manager' || isAdmin
  const today    = toDateStr(new Date())
  const isToday  = selDate === today

  // For members: only show their own data
  const reportMembers = isMgr ? members : members.filter(m => m.id === profile.id)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} pendingCount={pending2} onBellClick={() => {}}/>

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Daily task report</h1>
              <p className="text-sm text-gray-400">Track daily task completion user-wise</p>
            </div>
            <button onClick={downloadCSV} className="btn-secondary">
              <Download size={14}/> Export CSV
            </button>
          </div>

          {/* Mode toggle + date picker */}
          <div className="card p-4 mb-6">
            <div className="flex items-center gap-4 flex-wrap">

              {/* Day / Range toggle */}
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
                  <button onClick={() => {
                    const d = new Date(selDate); d.setDate(d.getDate()-1); setSelDate(toDateStr(d))
                  }} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronLeft size={14}/></button>
                  <div className="flex items-center gap-2 border border-indigo-200 bg-indigo-50 rounded-lg px-3 py-1.5">
                    <Calendar size={14} className="text-indigo-600"/>
                    <input type="date" value={selDate} onChange={e=>setSelDate(e.target.value)}
                      max={today}
                      className="text-sm font-medium text-indigo-700 bg-transparent focus:outline-none"/>
                  </div>
                  <button onClick={() => {
                    const d = new Date(selDate); d.setDate(d.getDate()+1)
                    if (toDateStr(d) <= today) setSelDate(toDateStr(d))
                  }} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50" disabled={isToday}><ChevronRight size={14}/></button>
                  <button onClick={() => setSelDate(today)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${isToday?'bg-indigo-600 text-white border-indigo-600':'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    Today
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-gray-400">From</span>
                    <input type="date" value={rangeStart} max={rangeEnd}
                      onChange={e=>setRangeStart(e.target.value)}
                      className="text-sm text-gray-700 bg-transparent focus:outline-none"/>
                  </div>
                  <span className="text-gray-400 text-xs">to</span>
                  <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-gray-400">To</span>
                    <input type="date" value={rangeEnd} min={rangeStart} max={today}
                      onChange={e=>setRangeEnd(e.target.value)}
                      className="text-sm text-gray-700 bg-transparent focus:outline-none"/>
                  </div>
                  {/* Quick presets */}
                  {[
                    { label:'Last 7 days', days:7 },
                    { label:'Last 30 days', days:30 },
                  ].map(p => (
                    <button key={p.label} onClick={() => {
                      setRangeEnd(today)
                      setRangeStart(toDateStr(new Date(Date.now() - (p.days-1)*86400000)))
                    }} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Summary cards */}
          {viewMode === 'day' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {(() => {
                const allMt = reportMembers.flatMap(m => dayReport(m.id, selDate))
                const closed = allMt.filter(t => t.closedOnDate).length
                const total  = allMt.length
                const open   = total - closed
                const fullyClosed = reportMembers.filter(m => {
                  const s = daySummary(m.id, selDate)
                  return s.total > 0 && s.closed === s.total
                }).length
                return [
                  { label:'Total daily tasks', val:total, color:'text-indigo-600', bg:'bg-indigo-50' },
                  { label:'Closed today',       val:closed, color:'text-green-600', bg:'bg-green-50' },
                  { label:'Still open',         val:open,   color:'text-red-600',   bg:'bg-red-50' },
                  { label:'Members 100% done',  val:`${fullyClosed}/${reportMembers.length}`, color:'text-teal-600', bg:'bg-teal-50' },
                ].map(s => (
                  <div key={s.label} className="card p-4">
                    <div className={`w-8 h-8 ${s.bg} ${s.color} rounded-lg flex items-center justify-center mb-2 text-sm font-semibold`}>
                      {typeof s.val === 'number' ? s.val : ''}
                    </div>
                    <div className={`text-2xl font-semibold ${s.color}`}>{s.val}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
                  </div>
                ))
              })()}
            </div>
          )}

          {/* Member-wise report */}
          <div className="space-y-4">
            {reportMembers.map((m, mi) => {
              const [bg, fc] = AV[mi % AV.length]
              const report = viewMode === 'day' ? dayReport(m.id, selDate) : rangeReport(m.id, rangeStart, rangeEnd)
              const closed = report.filter(t => viewMode==='day' ? t.closedOnDate : t.closedInRange).length
              const total  = report.length
              const pct    = total ? Math.round(closed/total*100) : 0
              const allDone = total > 0 && closed === total
              const noneDone = closed === 0

              if (total === 0) return null

              return (
                <div key={m.id} className={`card overflow-hidden border-l-4 ${allDone?'border-l-green-400':noneDone?'border-l-red-400':'border-l-amber-400'}`}>

                  {/* Member header */}
                  <div className="px-5 py-4 flex items-center gap-4 border-b border-gray-100">
                    <div className={`w-10 h-10 rounded-full ${bg} ${fc} flex items-center justify-center text-sm font-semibold flex-shrink-0`}>
                      {m.full_name.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-gray-900">{m.full_name}</span>
                        <span className="text-xs text-gray-400 capitalize">{m.role}</span>
                        {allDone && <span className="badge bg-green-100 text-green-700 text-xs">✅ All done</span>}
                        {noneDone && total > 0 && <span className="badge bg-red-100 text-red-700 text-xs">⚠️ None closed</span>}
                        {!allDone && !noneDone && <span className="badge bg-amber-100 text-amber-700 text-xs">⏳ Partial</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">{closed}/{total} tasks closed</span>
                        <div className="flex-1 max-w-32 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${allDone?'bg-green-500':noneDone?'bg-red-400':'bg-amber-400'}`}
                            style={{ width:`${pct}%` }}/>
                        </div>
                        <span className={`text-xs font-semibold ${allDone?'text-green-600':noneDone?'text-red-600':'text-amber-600'}`}>{pct}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Task rows */}
                  <div className="divide-y divide-gray-50">
                    {report.map(t => {
                      const isClosed = viewMode === 'day' ? t.closedOnDate : t.closedInRange
                      const closedAt = isClosed && t.closed_at
                        ? new Date(t.closed_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
                        : null
                      return (
                        <div key={t.id} className={`flex items-center gap-4 px-5 py-3 ${isClosed?'bg-green-50/30':'bg-red-50/20'}`}>
                          <div className="flex-shrink-0">
                            {isClosed
                              ? <CheckCircle size={18} className="text-green-500"/>
                              : <XCircle size={18} className="text-red-400"/>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${isClosed?'text-gray-700':'text-gray-800'}`}>{t.title}</p>
                            {t.description && <p className="text-xs text-gray-400 truncate mt-0.5">{t.description}</p>}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className={`badge text-xs ${isClosed?'bg-green-100 text-green-700':'bg-red-100 text-red-600'}`}>
                              {isClosed ? 'Closed' : 'Open'}
                            </span>
                            {closedAt && (
                              <span className="flex items-center gap-1 text-xs text-gray-400">
                                <Clock size={11}/> {closedAt}
                              </span>
                            )}
                            {!isClosed && (
                              <span className="text-xs text-red-500 font-medium">Pending</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {reportMembers.every(m => memberTasks(m.id).length === 0) && (
              <div className="card p-12 text-center">
                <Calendar size={32} className="text-gray-300 mx-auto mb-3"/>
                <p className="text-gray-500 font-medium">No daily tasks found</p>
                <p className="text-gray-400 text-sm mt-1">Add tasks with frequency set to "Daily" to see reports here</p>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
