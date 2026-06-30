'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Profile, Task } from '@/lib/types'
import Sidebar from '@/components/Sidebar'
import PendingPopup from '@/components/PendingPopup'
import {
  ClipboardList, CheckCircle, AlertTriangle, Clock,
  TrendingUp, Bell
} from 'lucide-react'

const AV = [['bg-purple-100','text-purple-700'],['bg-teal-100','text-teal-700'],['bg-amber-100','text-amber-700'],['bg-blue-100','text-blue-700'],['bg-rose-100','text-rose-700']]
const FREQ_LABEL: Record<string,string> = { daily:'Daily', weekly:'Weekly', monthly:'Monthly', quarterly:'Quarterly', yearly:'Yearly', once:'One-time' }
const FREQ_COLOR: Record<string,string> = { daily:'bg-green-100 text-green-700', weekly:'bg-blue-100 text-blue-700', monthly:'bg-teal-100 text-teal-700', quarterly:'bg-amber-100 text-amber-700', yearly:'bg-rose-100 text-rose-700', once:'bg-gray-100 text-gray-600' }

export default function DashboardPage() {
  const router = useRouter()
  const [profile,  setProfile]  = useState<Profile | null>(null)
  const [tasks,    setTasks]    = useState<Task[]>([])
  const [members,  setMembers]  = useState<Profile[]>([])
  const [popup,    setPopup]    = useState(false)
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async (uid: string) => {
    // Auto-reset stale daily tasks (closed on a previous day)
    const today = new Date().toISOString().split('T')[0]
    const { data: staleDailies } = await supabase
      .from('tasks').select('id, closed_at').eq('frequency', 'daily').eq('status', 'done')
    if (staleDailies) {
      const toReset = staleDailies.filter((t:any) => !t.closed_at || t.closed_at.split('T')[0] < today)
      if (toReset.length > 0) {
        await supabase.from('tasks').update({ status: 'pending', closed_by: null, closed_at: null }).in('id', toReset.map((t:any) => t.id))
      }
    }

    const [{ data: p }, { data: t }, { data: m }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
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

  useEffect(() => {
    if (profile && (profile.role === 'admin' || profile.role === 'manager')) {
      setTimeout(() => setPopup(true), 600)
    }
  }, [profile])

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const pending  = tasks.filter(t => t.status !== 'done')
  const overdue  = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date())
  const done     = tasks.filter(t => t.status === 'done')
  const canAlert = profile.role === 'admin' || profile.role === 'manager'

  const stats = [
    { label: 'Total tasks',  val: tasks.length,   icon: ClipboardList, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Pending',      val: pending.length,  icon: Clock,         color: 'text-red-600',    bg: 'bg-red-50', click: canAlert ? ()=>setPopup(true) : undefined },
    { label: 'Overdue',      val: overdue.length,  icon: AlertTriangle, color: 'text-amber-600',  bg: 'bg-amber-50', click: canAlert ? ()=>setPopup(true) : undefined },
    { label: 'Completed',    val: done.length,     icon: CheckCircle,   color: 'text-green-600',  bg: 'bg-green-50' },
  ]

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} pendingCount={pending.length} onBellClick={() => setPopup(true)} />

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Good day, {profile.full_name.split(' ')[0]} 👋</h1>
              <p className="text-sm text-gray-400 mt-0.5 capitalize">{profile.role} · {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</p>
            </div>
            {canAlert && pending.length > 0 && (
              <button onClick={() => setPopup(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors">
                <Bell size={15} />
                {pending.length} pending tasks
              </button>
            )}
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {stats.map(s => (
              <div key={s.label} onClick={s.click}
                className={`card p-4 ${s.click ? 'cursor-pointer hover:shadow-md' : ''} transition-shadow`}>
                <div className={`w-9 h-9 ${s.bg} ${s.color} rounded-lg flex items-center justify-center mb-3`}>
                  <s.icon size={18} />
                </div>
                <div className={`text-2xl font-semibold ${s.color}`}>{s.val}</div>
                <div className="text-xs text-gray-400 mt-0.5">{s.label}{s.click && pending.length>0 ? ' · click for breakdown' : ''}</div>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            {/* Member workload */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <TrendingUp size={15} className="text-indigo-500" /> Member workload
              </h3>
              <div className="space-y-3">
                {members.map((m, i) => {
                  const [bg, fc] = AV[i % AV.length]
                  const mt = tasks.filter(t => (t.assignees?.length ? t.assignees : t.assigned_to ? [t.assigned_to] : []).includes(m.id))
                  const mp = mt.filter(t => t.status !== 'done').length
                  const pct = mt.length ? Math.round(mp / mt.length * 100) : 0
                  return (
                    <div key={m.id} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full ${bg} ${fc} flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
                        {m.full_name.slice(0,2).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-gray-700">{m.full_name.split(' ')[0]}</span>
                          <span className="text-gray-400">{mp}/{mt.length} pending</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
                {members.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No members yet</p>}
              </div>
            </div>

            {/* By frequency */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Tasks by frequency</h3>
              <div className="space-y-2.5">
                {Object.keys(FREQ_LABEL).map(f => {
                  const cnt = tasks.filter(t => t.frequency === f).length
                  if (!cnt) return null
                  const pct = Math.round(cnt / tasks.length * 100)
                  return (
                    <div key={f} className="flex items-center gap-3">
                      <span className={`badge ${FREQ_COLOR[f]} text-xs w-20 justify-center`}>{FREQ_LABEL[f]}</span>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-400 w-6 text-right">{cnt}</span>
                    </div>
                  )
                })}
                {tasks.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No tasks yet</p>}
              </div>
            </div>
          </div>

          {/* Overdue */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-500" /> Overdue tasks
            </h3>
            {overdue.length === 0
              ? <p className="text-xs text-gray-400 text-center py-6 flex flex-col items-center gap-2"><CheckCircle size={20} className="text-green-400" />No overdue tasks — great work!</p>
              : overdue.map((t, i) => {
                  const m = members.find(m => m.id === t.assigned_to)
                  const idx = m ? members.indexOf(m) : 0
                  const [bg, fc] = AV[idx % AV.length]
                  const days = Math.round((Date.now() - new Date(t.due_date!).getTime()) / 86400000)
                  return (
                    <div key={t.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                      <div className={`w-8 h-8 rounded-full ${bg} ${fc} flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
                        {(t.assigned_to_name||'?').slice(0,2).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{t.title}</p>
                        <p className="text-xs text-gray-400">{t.assigned_to_name} · due {t.due_date}</p>
                      </div>
                      <span className="badge bg-red-100 text-red-700 text-xs">{days}d overdue</span>
                      <span className={`badge text-xs ${t.priority==='high'?'bg-red-100 text-red-700':t.priority==='medium'?'bg-amber-100 text-amber-700':'bg-green-100 text-green-700'}`}>{t.priority}</span>
                    </div>
                  )
                })
            }
          </div>
        </div>
      </main>

      <PendingPopup open={popup} onClose={() => setPopup(false)} tasks={tasks} members={members} />
    </div>
  )
}
