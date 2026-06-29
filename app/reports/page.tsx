'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Profile } from '@/lib/types'
import Sidebar from '@/components/Sidebar'
import toast from 'react-hot-toast'
import { CheckCircle, XCircle, Clock, Calendar, ChevronLeft, ChevronRight, Download } from 'lucide-react'

const AV = [['bg-purple-100','text-purple-700'],['bg-teal-100','text-teal-700'],['bg-amber-100','text-amber-700'],['bg-blue-100','text-blue-700'],['bg-rose-100','text-rose-700']]

function toDateStr(d: Date) { return d.toISOString().split('T')[0] }

export default function ReportsPage() {
  const router = useRouter()
  const [profile,   setProfile]   = useState<Profile | null>(null)
  const [members,   setMembers]   = useState<Profile[]>([])
  const [dailyTasks,setDailyTasks]= useState<any[]>([])
  const [closures,  setClosures]  = useState<any[]>([]) // task_closures rows
  const [pending2,  setPending2]  = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [selDate,   setSelDate]   = useState(toDateStr(new Date()))
  const [viewMode,  setViewMode]  = useState<'day'|'range'>('day')
  const [rangeStart,setRangeStart]= useState(toDateStr(new Date(Date.now() - 6*86400000)))
  const [rangeEnd,  setRangeEnd]  = useState(toDateStr(new Date()))

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

  // Check if a specific user closed a specific task on a specific date
  function userClosedOn(userId: string, taskId: string, dateStr: string): any | null {
    return closures.find(c => c.user_id === userId && c.task_id === taskId && c.date === dateStr) || null
  }

  // Check if user closed task in a date range
  function userClosedInRange(userId: string, taskId: string, start: string, end: string): any | null {
    return closures.find(c => c.user_id === userId && c.task_id === taskId && c.date >= start && c.date <= end) || null
  }

  // Tasks assigned to a member
  function memberDailyTasks(memberId: string) {
    return dailyTasks.filter(t => getAssigneeIds(t).includes(memberId))
  }

  function downloadCSV() {
    const rows = ['Member,Task,Status,Closed At']
    const isDay = viewMode === 'day'
    members.forEach(m => {
      memberDailyTasks(m.id).forEach(t => {
        const cl = isDay
          ? userClosedOn(m.id, t.id, selDate)
          : userClosedInRange(m.id, t.id, rangeStart, rangeEnd)
        rows.push(`"${m.full_name}","${t.title}","${cl?'Closed':'Open'}","${cl?.closed_at||'—'}"`)
      })
    })
    const blob = new Blob([rows.join('\n')], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `daily_report_${isDay?selDate:`${rangeStart}_to_${rangeEnd}`}.csv`
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

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} pendingCount={pending2} onBellClick={() => {}}/>

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

          {/* Summary strip (day mode) */}
          {viewMode === 'day' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {(() => {
                let totalTasks=0, closedTasks=0, fullDone=0
                reportMembers.forEach(m => {
                  const mt = memberDailyTasks(m.id)
                  totalTasks += mt.length
                  const c = mt.filter(t => userClosedOn(m.id, t.id, selDate)).length
                  closedTasks += c
                  if (mt.length > 0 && c === mt.length) fullDone++
                })
                return [
                  { label:'Total daily tasks', val:totalTasks,   color:'text-indigo-600', bg:'bg-indigo-50' },
                  { label:'Closed',            val:closedTasks,  color:'text-green-600',  bg:'bg-green-50'  },
                  { label:'Still open',        val:totalTasks-closedTasks, color:'text-red-600', bg:'bg-red-50' },
                  { label:'Members 100%',      val:`${fullDone}/${reportMembers.filter(m=>memberDailyTasks(m.id).length>0).length}`, color:'text-teal-600', bg:'bg-teal-50' },
                ].map(s => (
                  <div key={s.label} className="card p-4">
                    <div className={`text-2xl font-semibold ${s.color}`}>{s.val}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
                  </div>
                ))
              })()}
            </div>
          )}

          {/* Member cards */}
          <div className="space-y-4">
            {reportMembers.map((m, mi) => {
              const [bg, fc] = AV[mi % AV.length]
              const mt = memberDailyTasks(m.id)
              if (mt.length === 0) return null

              const closedList = mt.filter(t =>
                viewMode === 'day'
                  ? userClosedOn(m.id, t.id, selDate)
                  : userClosedInRange(m.id, t.id, rangeStart, rangeEnd)
              )
              const closed  = closedList.length
              const total   = mt.length
              const pct     = Math.round(closed/total*100)
              const allDone = closed === total
              const noneDone= closed === 0

              return (
                <div key={m.id} className={`card overflow-hidden border-l-4 ${allDone?'border-l-green-400':noneDone?'border-l-red-400':'border-l-amber-400'}`}>

                  {/* Member header */}
                  <div className="px-5 py-4 flex items-center gap-4 border-b border-gray-100">
                    <div className={`w-10 h-10 rounded-full ${bg} ${fc} flex items-center justify-center text-sm font-semibold flex-shrink-0`}>
                      {m.full_name.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-gray-900">{m.full_name}</span>
                        <span className="text-xs text-gray-400 capitalize">{m.role}</span>
                        {allDone  && <span className="badge bg-green-100 text-green-700 text-xs">✅ All done</span>}
                        {noneDone && <span className="badge bg-red-100 text-red-700 text-xs">⚠️ None closed</span>}
                        {!allDone && !noneDone && <span className="badge bg-amber-100 text-amber-700 text-xs">⏳ {closed}/{total} done</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">{closed} of {total} closed</span>
                        <div className="flex-1 max-w-40 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${allDone?'bg-green-500':noneDone?'bg-red-400':'bg-amber-400'}`}
                            style={{ width:`${pct}%` }}/>
                        </div>
                        <span className={`text-xs font-semibold ${allDone?'text-green-600':noneDone?'text-red-600':'text-amber-600'}`}>{pct}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Task rows */}
                  <div className="divide-y divide-gray-50">
                    {mt.map(t => {
                      const cl = viewMode === 'day'
                        ? userClosedOn(m.id, t.id, selDate)
                        : userClosedInRange(m.id, t.id, rangeStart, rangeEnd)
                      const closedAt = cl?.closed_at
                        ? new Date(cl.closed_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
                        : null
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
                            <span className={`badge text-xs ${cl?'bg-green-100 text-green-700':'bg-red-100 text-red-600'}`}>
                              {cl ? 'Closed' : 'Open'}
                            </span>
                            {closedAt && (
                              <span className="flex items-center gap-1 text-xs text-gray-400">
                                <Clock size={11}/> {closedAt}
                              </span>
                            )}
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
