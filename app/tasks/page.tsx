'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Profile, Task, TaskStatus, Priority, Frequency, Category } from '@/lib/types'
import Sidebar from '@/components/Sidebar'
import PendingPopup from '@/components/PendingPopup'
import toast from 'react-hot-toast'
import { Plus, RefreshCw, Trash2, X, Filter, Bell } from 'lucide-react'

const FREQ_LABEL: Record<string,string> = { daily:'Daily', weekly:'Weekly', monthly:'Monthly', quarterly:'Quarterly', yearly:'Yearly', once:'One-time' }
const STATUS_ORDER: TaskStatus[] = ['pending','in-progress','review','done']
const STATUS_COLOR: Record<string,string> = { pending:'bg-red-100 text-red-700', 'in-progress':'bg-blue-100 text-blue-700', review:'bg-amber-100 text-amber-700', done:'bg-green-100 text-green-700' }
const PRI_COLOR: Record<string,string> = { high:'bg-red-100 text-red-700', medium:'bg-amber-100 text-amber-700', low:'bg-green-100 text-green-700' }
const FREQ_COLOR: Record<string,string> = { daily:'bg-green-100 text-green-700', weekly:'bg-blue-100 text-blue-700', monthly:'bg-teal-100 text-teal-700', quarterly:'bg-amber-100 text-amber-700', yearly:'bg-rose-100 text-rose-700', once:'bg-gray-100 text-gray-600' }
const AV = [['bg-purple-100','text-purple-700'],['bg-teal-100','text-teal-700'],['bg-amber-100','text-amber-700'],['bg-blue-100','text-blue-700'],['bg-rose-100','text-rose-700']]

const EMPTY_FORM = { title:'', description:'', assigned_to:'', category:'other' as Category, priority:'medium' as Priority, frequency:'once' as Frequency, status:'pending' as TaskStatus, due_date:'' }

export default function TasksPage() {
  const router = useRouter()
  const [profile, setProfile]  = useState<Profile | null>(null)
  const [tasks,   setTasks]    = useState<Task[]>([])
  const [members, setMembers]  = useState<Profile[]>([])
  const [popup,   setPopup]    = useState(false)
  const [loading, setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]        = useState(EMPTY_FORM)
  const [saving, setSaving]    = useState(false)
  const [fMember, setFMember]  = useState('')
  const [fStatus, setFStatus]  = useState('')
  const [fFreq,   setFFreq]    = useState('')
  const [fPri,    setFPri]     = useState('')

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

  const canEdit = profile?.role === 'admin' || profile?.role === 'manager'

  async function saveTask() {
    if (!form.title || !form.assigned_to || !profile) return
    setSaving(true)
    const { error } = await supabase.from('tasks').insert({ ...form, created_by: profile.id })
    if (error) toast.error(error.message)
    else { toast.success('Task assigned!'); setShowForm(false); setForm(EMPTY_FORM); load(profile.id) }
    setSaving(false)
  }

  async function cycleStatus(task: Task) {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length]
    const { error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    if (error) toast.error(error.message)
    else { toast.success(`→ ${next}`); if(profile) load(profile.id) }
  }

  async function deleteTask(id: string) {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Task removed'); if(profile) load(profile.id) }
  }

  const filtered = tasks.filter(t =>
    (!fMember || t.assigned_to === fMember) &&
    (!fStatus || t.status === fStatus) &&
    (!fFreq   || t.frequency === fFreq) &&
    (!fPri    || t.priority === fPri)
  )

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const pending = tasks.filter(t => t.status !== 'done')

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} pendingCount={pending.length} onBellClick={() => setPopup(true)} />

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Task board</h1>
              <p className="text-sm text-gray-400">{filtered.length} of {tasks.length} tasks</p>
            </div>
            <div className="flex gap-2">
              {canEdit && pending.length > 0 && (
                <button onClick={() => setPopup(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100">
                  <Bell size={14} /> {pending.length} pending
                </button>
              )}
              {canEdit && (
                <button onClick={() => setShowForm(!showForm)} className="btn-primary">
                  {showForm ? <><X size={14}/> Cancel</> : <><Plus size={14}/> Add task</>}
                </button>
              )}
            </div>
          </div>

          {/* Add task form */}
          {showForm && canEdit && (
            <div className="card p-5 mb-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">New task assignment</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Task title *</label>
                  <input className="input" placeholder="Enter task name" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Assign to *</label>
                  <select className="input" value={form.assigned_to} onChange={e => setForm({...form, assigned_to: e.target.value})}>
                    <option value="">Select member</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                  <select className="input" value={form.category} onChange={e => setForm({...form, category: e.target.value as Category})}>
                    {['maintenance','review','report','meeting','audit','other'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                  <select className="input" value={form.priority} onChange={e => setForm({...form, priority: e.target.value as Priority})}>
                    <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Frequency</label>
                  <select className="input" value={form.frequency} onChange={e => setForm({...form, frequency: e.target.value as Frequency})}>
                    {Object.entries(FREQ_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Due date</label>
                  <input className="input" type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                  <select className="input" value={form.status} onChange={e => setForm({...form, status: e.target.value as TaskStatus})}>
                    <option value="pending">Pending</option><option value="in-progress">In progress</option><option value="review">In review</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                  <textarea className="input resize-none h-16" placeholder="Task objectives, steps, notes…" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
                </div>
              </div>
              <button className="btn-primary" onClick={saveTask} disabled={saving}>
                {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus size={14}/>}
                Assign task
              </button>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-1 text-xs text-gray-400"><Filter size={13}/> Filter:</div>
            <select className="input py-1 text-xs w-auto" value={fMember} onChange={e => setFMember(e.target.value)}>
              <option value="">All members</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
            <select className="input py-1 text-xs w-auto" value={fStatus} onChange={e => setFStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUS_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="input py-1 text-xs w-auto" value={fFreq} onChange={e => setFFreq(e.target.value)}>
              <option value="">All frequencies</option>
              {Object.entries(FREQ_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="input py-1 text-xs w-auto" value={fPri} onChange={e => setFPri(e.target.value)}>
              <option value="">All priorities</option>
              {['high','medium','low'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {(fMember||fStatus||fFreq||fPri) && (
              <button className="btn-secondary py-1 text-xs" onClick={() => { setFMember(''); setFStatus(''); setFFreq(''); setFPri('') }}>
                <X size={12}/> Clear
              </button>
            )}
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Task','Assigned to','Category','Frequency','Priority','Due','Status','Description', canEdit?'Actions':''].filter(Boolean).map(h => (
                      <th key={h} className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9} className="text-center text-gray-400 text-sm py-12">No tasks found</td></tr>
                  ) : filtered.map(t => {
                    const mIdx = members.findIndex(m => m.id === t.assigned_to)
                    const [bg, fc] = AV[Math.max(0, mIdx) % AV.length]
                    return (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800 max-w-[180px]">
                          <p className="truncate">{t.title}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full ${bg} ${fc} flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
                              {(t.assigned_to_name||'?').slice(0,2).toUpperCase()}
                            </div>
                            <span className="text-xs text-gray-600 truncate max-w-[80px]">{(t.assigned_to_name||'').split(' ')[0]}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3"><span className="badge bg-gray-100 text-gray-600 text-xs">{t.category}</span></td>
                        <td className="px-4 py-3"><span className={`badge text-xs ${FREQ_COLOR[t.frequency]||'bg-gray-100 text-gray-600'}`}>{FREQ_LABEL[t.frequency]||t.frequency}</span></td>
                        <td className="px-4 py-3"><span className={`badge text-xs ${PRI_COLOR[t.priority]}`}>{t.priority}</span></td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{t.due_date||'–'}</td>
                        <td className="px-4 py-3"><span className={`badge text-xs ${STATUS_COLOR[t.status]}`}>{t.status}</span></td>
                        <td className="px-4 py-3 text-xs text-gray-400 max-w-[140px]">
                          <p className="truncate" title={t.description||''}>{t.description||'–'}</p>
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button onClick={() => cycleStatus(t)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors" title="Cycle status">
                                <RefreshCw size={13}/>
                              </button>
                              <button onClick={() => deleteTask(t.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                                <Trash2 size={13}/>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <PendingPopup open={popup} onClose={() => setPopup(false)} tasks={tasks} members={members} />
    </div>
  )
}
