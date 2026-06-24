'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Profile, Task } from '@/lib/types'
import Sidebar from '@/components/Sidebar'
import PendingPopup from '@/components/PendingPopup'
import { Bell, ChevronLeft, ChevronRight, RefreshCw, Calendar, Clock } from 'lucide-react'

const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const FREQ_LABEL: Record<string,string> = { daily:'Daily', weekly:'Weekly', monthly:'Monthly', quarterly:'Quarterly', yearly:'Yearly', once:'One-time' }
const FREQ_COLOR: Record<string,string> = { daily:'bg-green-100 text-green-700', weekly:'bg-blue-100 text-blue-700', monthly:'bg-teal-100 text-teal-700', quarterly:'bg-amber-100 text-amber-700', yearly:'bg-rose-100 text-rose-700', once:'bg-gray-100 text-gray-600' }
const AV = [['bg-purple-100','text-purple-700'],['bg-teal-100','text-teal-700'],['bg-amber-100','text-amber-700'],['bg-blue-100','text-blue-700'],['bg-rose-100','text-rose-700']]

export default function SchedulePage() {
  const router = useRouter()
  const [profile,  setProfile]  = useState<Profile | null>(null)
  const [tasks,    setTasks]    = useState<Task[]>([])
  const [members,  setMembers]  = useState<Profile[]>([])
  const [popup,    setPopup]    = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [calYear,  setCalYear]  = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [freqFilter, setFreqFilter] = useState('all')

  const load = useCallback(async (uid: string) => {
    const [{ data: p }, { data: t }, { data: m }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('tasks').select('*, profiles!tasks_assigned_to_fkey(full_name)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('full_name'),
    ])
    if (p) setProfile(p)
    if (t) setTasks(t.map((x: any) => ({ ...x, assigned_to_name: x.profiles?.full_name })))
    if (m) setMembers(m)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace('/login'); return }
      await load(data.session.user.id)
      setLoading(false)
    })
  }, [router, load])

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const pending = tasks.filter(t => t.status !== 'done')
  const canAlert = profile.role === 'admin' || profile.role === 'manager'

  // Calendar logic
  const firstDay = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const today = new Date()

  const filteredTasks = freqFilter === 'all' ? tasks : tasks.filter(t => t.frequency === freqFilter)

  function taskDaysInMonth(): Set<number> {
    const s = new Set<number>()
    filteredTasks.forEach(t => {
      if (t.due_date) {
        const d = new Date(t.due_date)
        if (d.getFullYear() === calYear && d.getMonth() === calMonth) s.add(d.getDate())
      }
      if (t.frequency === 'daily') { for (let i=1; i<=daysInMonth; i++) s.add(i) }
      if (t.frequency === 'weekly' && t.due_date) {
        const dow = new Date(t.due_date).getDay()
        for (let i=1; i<=daysInMonth; i++) { if (new Date(calYear,calMonth,i).getDay()===dow) s.add(i) }
      }
    })
    return s
  }
  const taskDays = taskDaysInMonth()

  // Group tasks by frequency for list
  const groups = Object.keys(FREQ_LABEL).reduce((acc,f) => {
    acc[f] = filteredTasks.filter(t => t.frequency === f)
    return acc
  }, {} as Record<string, Task[]>)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} pendingCount={pending.length} onBellClick={() => setPopup(true)} />

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">

          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Schedule</h1>
              <p className="text-sm text-gray-400">Activity frequency calendar</p>
            </div>
            {canAlert && pending.length > 0 && (
              <button onClick={() => setPopup(true)}
                className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100">
                <Bell size={14}/> {pending.length} pending
              </button>
            )}
          </div>

          {/* Frequency filter pills */}
          <div className="flex gap-2 mb-5 flex-wrap">
            {['all', ...Object.keys(FREQ_LABEL)].map(f => (
              <button key={f} onClick={() => setFreqFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${freqFilter===f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                {f === 'all' ? 'All' : FREQ_LABEL[f]}
              </button>
            ))}
          </div>

          <div className="grid md:grid-cols-5 gap-4 mb-4">
            {/* Calendar */}
            <div className="md:col-span-3 card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">{MONTHS[calMonth]} {calYear}</h3>
                <div className="flex gap-1">
                  <button onClick={() => { if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1)}else setCalMonth(m=>m-1) }}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><ChevronLeft size={15}/></button>
                  <button onClick={() => { if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1)}else setCalMonth(m=>m+1) }}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><ChevronRight size={15}/></button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAYS.map(d => <div key={d} className="text-center text-xs font-medium text-gray-300 py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({length: firstDay}).map((_,i) => <div key={`e${i}`} />)}
                {Array.from({length: daysInMonth}).map((_,i) => {
                  const day = i+1
                  const isToday = today.getDate()===day && today.getMonth()===calMonth && today.getFullYear()===calYear
                  const hasTask = taskDays.has(day)
                  return (
                    <div key={day} className={`aspect-square flex items-center justify-center text-xs rounded-lg transition-colors
                      ${isToday ? 'ring-2 ring-indigo-500' : ''}
                      ${hasTask ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'text-gray-400 hover:bg-gray-50'}`}>
                      {day}
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-1.5 text-xs text-gray-400"><div className="w-3 h-3 rounded bg-indigo-100" /> Has task</div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400"><div className="w-3 h-3 rounded ring-2 ring-indigo-400" /> Today</div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="md:col-span-2 flex flex-col gap-4">
              {Object.entries(FREQ_LABEL).map(([f, label]) => {
                const cnt = tasks.filter(t => t.frequency === f).length
                const pct = tasks.length ? Math.round(cnt/tasks.length*100) : 0
                return (
                  <div key={f} className="card p-3 flex items-center gap-3">
                    <div className={`badge text-xs ${FREQ_COLOR[f]} w-20 justify-center flex-shrink-0`}>{label}</div>
                    <div className="flex-1">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 w-6 text-right">{cnt}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Frequency grouped list */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Activities by frequency</h3>
            {Object.entries(groups).filter(([,t])=>t.length>0).map(([freq, ftasks]) => (
              <div key={freq} className="mb-5 last:mb-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`badge text-xs ${FREQ_COLOR[freq]}`}>{FREQ_LABEL[freq]}</span>
                  <span className="text-xs text-gray-400">{ftasks.length} task{ftasks.length!==1?'s':''}</span>
                </div>
                <div className="space-y-1.5">
                  {ftasks.map(t => {
                    const mIdx = members.findIndex(m => m.id === t.assigned_to)
                    const [bg,fc] = AV[Math.max(0,mIdx)%AV.length]
                    return (
                      <div key={t.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                        <div className={`w-6 h-6 rounded-full ${bg} ${fc} flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
                          {(t.assigned_to_name||'?').slice(0,2).toUpperCase()}
                        </div>
                        <span className="text-sm text-gray-700 flex-1">{t.title}</span>
                        <span className="text-xs text-gray-400">{t.assigned_to_name?.split(' ')[0]}</span>
                        {t.due_date && <span className="text-xs text-gray-400">{t.due_date}</span>}
                        <span className={`badge text-xs ${t.priority==='high'?'bg-red-100 text-red-700':t.priority==='medium'?'bg-amber-100 text-amber-700':'bg-green-100 text-green-700'}`}>{t.priority}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            {filteredTasks.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No scheduled tasks</p>
            )}
          </div>

        </div>
      </main>

      <PendingPopup open={popup} onClose={() => setPopup(false)} tasks={tasks} members={members} />
    </div>
  )
}
