'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Profile, Task, TaskStatus, Priority } from '@/lib/types'
import Sidebar from '@/components/Sidebar'
import PendingPopup from '@/components/PendingPopup'
import toast from 'react-hot-toast'
import { Plus, RefreshCw, Trash2, X, Filter, Bell, Upload, Download, CheckCircle, RotateCcw, Eye, Calendar, Tag, Clock, User, AlignLeft, Flag } from 'lucide-react'

const STATUS_ORDER: TaskStatus[] = ['pending','in-progress','review','done']
const STATUS_COLOR: Record<string,string> = { pending:'bg-red-100 text-red-700', 'in-progress':'bg-blue-100 text-blue-700', review:'bg-amber-100 text-amber-700', done:'bg-green-100 text-green-700' }
const PRI_COLOR: Record<string,string> = { high:'bg-red-100 text-red-700', medium:'bg-amber-100 text-amber-700', low:'bg-green-100 text-green-700' }
const FREQ_COLOR_MAP: Record<string,string> = { daily:'bg-green-100 text-green-700', weekly:'bg-blue-100 text-blue-700', monthly:'bg-teal-100 text-teal-700', quarterly:'bg-amber-100 text-amber-700', yearly:'bg-rose-100 text-rose-700', once:'bg-gray-100 text-gray-600' }
const AV = [['bg-purple-100','text-purple-700'],['bg-teal-100','text-teal-700'],['bg-amber-100','text-amber-700'],['bg-blue-100','text-blue-700'],['bg-rose-100','text-rose-700']]

const EMPTY_FORM = { title:'', description:'', assigned_to:'', category:'other', priority:'medium' as Priority, frequency:'once', status:'pending' as TaskStatus, due_date:'' }

export default function TasksPage() {
  const router = useRouter()
  const [profile,     setProfile]     = useState<Profile | null>(null)
  const [tasks,       setTasks]       = useState<Task[]>([])
  const [members,     setMembers]     = useState<Profile[]>([])
  const [popup,       setPopup]       = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [showImport,  setShowImport]  = useState(false)
  const [importing,   setImporting]   = useState(false)
  const [form,        setForm]        = useState(EMPTY_FORM)
  const [saving,      setSaving]      = useState(false)
  const [fMember,     setFMember]     = useState('')
  const [fStatus,     setFStatus]     = useState('')
  const [fFreq,       setFFreq]       = useState('')
  const [fPri,        setFPri]        = useState('')
  const [revokeId,    setRevokeId]    = useState<string | null>(null)
  const [revokeNote,  setRevokeNote]  = useState('')
  const [viewTask,    setViewTask]    = useState<Task | null>(null)
  const [categories,  setCategories]  = useState<string[]>(['maintenance','review','report','meeting','audit','other'])
  const [frequencies, setFrequencies] = useState<{key:string,label:string}[]>([
    {key:'daily',label:'Daily'},{key:'weekly',label:'Weekly'},{key:'monthly',label:'Monthly'},
    {key:'quarterly',label:'Quarterly'},{key:'yearly',label:'Yearly'},{key:'once',label:'One-time'}
  ])

  const load = useCallback(async (uid: string) => {
    const [{ data: p }, { data: t }, { data: m }, { data: s }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('tasks').select('*, profiles!tasks_assigned_to_fkey(full_name)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('app_settings').select('*'),
    ])
    if (p) setProfile(p)
    if (t) setTasks(t.map((x: any) => ({ ...x, assigned_to_name: x.profiles?.full_name })))
    if (m) setMembers(m)
    if (s && s.length > 0) {
      const catRow  = s.find((r:any) => r.key === 'categories')
      const freqRow = s.find((r:any) => r.key === 'frequencies')
      if (catRow)  setCategories(JSON.parse(catRow.value))
      if (freqRow) setFrequencies(JSON.parse(freqRow.value))
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace('/login'); return }
      await load(data.session.user.id)
      setLoading(false)
    })
  }, [router, load])

  const isAdmin   = profile?.role === 'admin'
  const isManager = profile?.role === 'manager' || isAdmin
  const canEdit   = isManager

  function canMarkDone(task: Task) {
    if (!profile) return false
    if (isManager) return true
    return task.assigned_to === profile.id
  }

  async function markDone(task: Task) {
    const next: TaskStatus = task.status === 'done' ? 'in-progress' : 'done'
    const { error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    if (error) toast.error(error.message)
    else {
      toast.success(next === 'done' ? '✅ Marked as done!' : '↩️ Reopened')
      if (profile) load(profile.id)
      if (viewTask?.id === task.id) setViewTask({ ...viewTask, status: next })
    }
  }

  async function confirmRevoke() {
    if (!revokeId) return
    const { error } = await supabase.from('tasks').update({ status: 'pending' }).eq('id', revokeId)
    if (error) toast.error(error.message)
    else {
      toast.success('Task revoked — sent back to pending')
      setRevokeId(null); setRevokeNote('')
      if (profile) load(profile.id)
    }
  }

  async function cycleStatus(task: Task) {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length]
    const { error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    if (error) toast.error(error.message)
    else {
      toast.success(`→ ${next}`)
      if (profile) load(profile.id)
      if (viewTask?.id === task.id) setViewTask({ ...viewTask, status: next })
    }
  }

  async function saveTask() {
    if (!form.title || !form.assigned_to || !profile) return
    setSaving(true)
    const { error } = await supabase.from('tasks').insert({ ...form, created_by: profile.id })
    if (error) toast.error(error.message)
    else { toast.success('Task assigned!'); setShowForm(false); setForm(EMPTY_FORM); load(profile.id) }
    setSaving(false)
  }

  async function deleteTask(id: string) {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) toast.error(error.message)
    else {
      toast.success('Task removed')
      if (viewTask?.id === id) setViewTask(null)
      if (profile) load(profile.id)
    }
  }

  function downloadTemplate() {
    const csv = [
      'title,assigned_to_email,category,priority,frequency,due_date,description',
      'Server health check,alice@company.com,maintenance,high,daily,2026-07-01,Check all servers daily',
      'Monthly report,bob@company.com,report,medium,monthly,2026-07-31,Compile monthly sales data',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'task_import_template.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success('Template downloaded!')
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    setImporting(true)
    try {
      const text = await file.text()
      const allLines = text.trim().split('\n').filter(l => !l.trim().startsWith('#') && l.trim() !== '')
      if (allLines.length < 2) { toast.error('CSV has no data rows'); setImporting(false); return }
      const headers = allLines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g,'_'))
      let imported = 0, failed = 0

      const freqMap: Record<string,string> = {}
      frequencies.forEach(f => {
        freqMap[f.key.toLowerCase()]   = f.key
        freqMap[f.label.toLowerCase()] = f.key
      })

      for (let i = 1; i < allLines.length; i++) {
        const line = allLines[i].trim()
        if (!line) continue
        const values: string[] = []
        let cur = '', inQ = false
        for (const ch of line) {
          if (ch === '"') { inQ = !inQ }
          else if (ch === ',' && !inQ) { values.push(cur.trim()); cur = '' }
          else { cur += ch }
        }
        values.push(cur.trim())
        const row: Record<string,string> = {}
        headers.forEach((h, idx) => { row[h] = (values[idx]||'').replace(/^"|"$/g,'').trim() })
        if (!row.title) continue

        const rawCat  = (row.category  || 'other').toLowerCase().trim()
        const rawFreq = (row.frequency || 'once').toLowerCase().trim()
        const rawPri  = (row.priority  || 'medium').toLowerCase().trim()
        const rawEmail = (row.assigned_to_email || '').toLowerCase().trim()

        const finalFreq = freqMap[rawFreq] || frequencies[0]?.key || 'once'
        const finalPri: Priority = (['high','medium','low'].includes(rawPri) ? rawPri : 'medium') as Priority
        const member = members.find(m => m.email.toLowerCase() === rawEmail)

        const { error } = await supabase.from('tasks').insert({
          title:       row.title,
          description: row.description || '',
          assigned_to: member?.id || null,
          category:    rawCat,
          priority:    finalPri,
          frequency:   finalFreq,
          status:      'pending' as TaskStatus,
          due_date:    row.due_date || null,
          created_by:  profile.id,
        })
        if (error) { console.error('Row', i, error.message); failed++ } else imported++
      }
      if (imported > 0) toast.success(`✅ ${imported} tasks imported!`, { duration: 5000 })
      if (failed > 0)   toast.error(`❌ ${failed} rows failed`, { duration: 5000 })
    } catch (err: any) {
      toast.error('Import failed: ' + err.message)
    }
    setImporting(false); setShowImport(false); e.target.value = ''
    load(profile.id)
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

  const pending    = tasks.filter(t => t.status !== 'done')
  const revokeTask = tasks.find(t => t.id === revokeId)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} pendingCount={pending.length} onBellClick={() => setPopup(true)} />

      {/* ── TASK DETAIL POPUP ── */}
      {viewTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setViewTask(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex-1 pr-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`badge text-xs ${STATUS_COLOR[viewTask.status]}`}>{viewTask.status}</span>
                  <span className={`badge text-xs ${PRI_COLOR[viewTask.priority]}`}>{viewTask.priority} priority</span>
                </div>
                <h2 className="text-base font-semibold text-gray-900 mt-1">{viewTask.title}</h2>
              </div>
              <button onClick={() => setViewTask(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0">
                <X size={16}/>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">

              {/* Description */}
              <div className="flex gap-3">
                <AlignLeft size={16} className="text-gray-400 mt-0.5 flex-shrink-0"/>
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-1">Description</p>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {viewTask.description || <span className="text-gray-400 italic">No description provided</span>}
                  </p>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4">
                <div className="flex gap-2 items-start">
                  <User size={14} className="text-gray-400 mt-0.5 flex-shrink-0"/>
                  <div>
                    <p className="text-xs text-gray-400">Assigned to</p>
                    <p className="text-sm font-medium text-gray-700">{viewTask.assigned_to_name || '—'}</p>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <Tag size={14} className="text-gray-400 mt-0.5 flex-shrink-0"/>
                  <div>
                    <p className="text-xs text-gray-400">Category</p>
                    <p className="text-sm font-medium text-gray-700 capitalize">{viewTask.category}</p>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <Clock size={14} className="text-gray-400 mt-0.5 flex-shrink-0"/>
                  <div>
                    <p className="text-xs text-gray-400">Frequency</p>
                    <p className="text-sm font-medium text-gray-700">
                      {frequencies.find(f => f.key === viewTask.frequency)?.label || viewTask.frequency}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <Calendar size={14} className="text-gray-400 mt-0.5 flex-shrink-0"/>
                  <div>
                    <p className="text-xs text-gray-400">Due date</p>
                    <p className={`text-sm font-medium ${viewTask.due_date && new Date(viewTask.due_date) < new Date() && viewTask.status !== 'done' ? 'text-red-600' : 'text-gray-700'}`}>
                      {viewTask.due_date || '—'}
                      {viewTask.due_date && new Date(viewTask.due_date) < new Date() && viewTask.status !== 'done' && ' ⚠️'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <Flag size={14} className="text-gray-400 mt-0.5 flex-shrink-0"/>
                  <div>
                    <p className="text-xs text-gray-400">Priority</p>
                    <p className="text-sm font-medium text-gray-700 capitalize">{viewTask.priority}</p>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <RefreshCw size={14} className="text-gray-400 mt-0.5 flex-shrink-0"/>
                  <div>
                    <p className="text-xs text-gray-400">Status</p>
                    <p className="text-sm font-medium text-gray-700 capitalize">{viewTask.status}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex gap-2">
                {canMarkDone(viewTask) && viewTask.status !== 'done' && (
                  <button onClick={() => markDone(viewTask)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 text-xs font-medium hover:bg-green-100">
                    <CheckCircle size={13}/> Mark done
                  </button>
                )}
                {canEdit && viewTask.status === 'done' && (
                  <button onClick={() => { setRevokeId(viewTask.id); setViewTask(null) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium hover:bg-amber-100">
                    <RotateCcw size={13}/> Revoke
                  </button>
                )}
                {canEdit && viewTask.status !== 'done' && (
                  <button onClick={() => cycleStatus(viewTask)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-medium hover:bg-indigo-100">
                    <RefreshCw size={13}/> Next status
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {isAdmin && (
                  <button onClick={() => deleteTask(viewTask.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-medium hover:bg-red-100">
                    <Trash2 size={13}/> Delete
                  </button>
                )}
                <button onClick={() => setViewTask(null)} className="btn-secondary text-xs py-1.5">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── REVOKE POPUP ── */}
      {revokeId && revokeTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRevokeId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <RotateCcw size={18} className="text-amber-600"/>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Revoke completed task?</h3>
                <p className="text-xs text-gray-400 mt-0.5">Sends task back to <strong>pending</strong></p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4">
              <p className="text-sm font-medium text-gray-800">{revokeTask.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">Assigned to: {revokeTask.assigned_to_name}</p>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Reason (optional)</label>
              <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none h-16"
                placeholder="e.g. Incomplete work, missing documentation..."
                value={revokeNote} onChange={e => setRevokeNote(e.target.value)}/>
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => { setRevokeId(null); setRevokeNote('') }}>Cancel</button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600" onClick={confirmRevoke}>
                <RotateCcw size={14}/> Revoke task
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Task board</h1>
              <p className="text-sm text-gray-400">{filtered.length} of {tasks.length} tasks · click any row to view details</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {canEdit && pending.length > 0 && (
                <button onClick={() => setPopup(true)} className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100">
                  <Bell size={14}/> {pending.length} pending
                </button>
              )}
              {canEdit && (
                <button onClick={() => { setShowImport(!showImport); setShowForm(false) }}
                  className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium hover:bg-green-100">
                  <Upload size={14}/> Import CSV
                </button>
              )}
              {canEdit && (
                <button onClick={() => { setShowForm(!showForm); setShowImport(false) }} className="btn-primary">
                  {showForm ? <><X size={14}/> Cancel</> : <><Plus size={14}/> Add task</>}
                </button>
              )}
            </div>
          </div>

          {/* Member info */}
          {!canEdit && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 mb-5 text-xs text-indigo-700">
              ✅ Click any task row to view details. Use the green tick to mark your tasks as done.
            </div>
          )}

          {/* CSV Import */}
          {showImport && canEdit && (
            <div className="card p-5 mb-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Import tasks from CSV</h3>
              <p className="text-xs text-gray-400 mb-3">Category and frequency values are matched automatically — case insensitive.</p>
              <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="font-medium text-gray-600 mb-1.5">Valid categories:</p>
                  <div className="flex flex-wrap gap-1">{categories.map(c=><span key={c} className="bg-white border border-gray-200 px-2 py-0.5 rounded-full capitalize">{c}</span>)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="font-medium text-gray-600 mb-1.5">Valid frequencies:</p>
                  <div className="flex flex-wrap gap-1">{frequencies.map(f=><span key={f.key} className="bg-white border border-gray-200 px-2 py-0.5 rounded-full">{f.key}</span>)}</div>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button onClick={downloadTemplate} className="btn-secondary"><Download size={14}/> Download template</button>
                <label className={`btn-primary cursor-pointer ${importing?'opacity-50 cursor-not-allowed':''}`}>
                  <Upload size={14}/> {importing?'Importing...':'Upload CSV'}
                  <input type="file" accept=".csv" className="hidden" onChange={handleCSVImport} disabled={importing}/>
                </label>
              </div>
            </div>
          )}

          {/* Add task form */}
          {showForm && canEdit && (
            <div className="card p-5 mb-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">New task assignment</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Task title *</label>
                  <input className="input" placeholder="Enter task name" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Assign to *</label>
                  <select className="input" value={form.assigned_to} onChange={e=>setForm({...form,assigned_to:e.target.value})}>
                    <option value="">Select member</option>
                    {members.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                  <select className="input" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
                    {categories.map(c=><option key={c} value={c} className="capitalize">{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                  <select className="input" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value as Priority})}>
                    <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Frequency</label>
                  <select className="input" value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})}>
                    {frequencies.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Due date</label>
                  <input className="input" type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                  <select className="input" value={form.status} onChange={e=>setForm({...form,status:e.target.value as TaskStatus})}>
                    <option value="pending">Pending</option><option value="in-progress">In progress</option><option value="review">In review</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                  <textarea className="input resize-none h-16" placeholder="Task objectives, steps, notes…" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
                </div>
              </div>
              <button className="btn-primary" onClick={saveTask} disabled={saving}>
                {saving?<span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>:<Plus size={14}/>}
                Assign task
              </button>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-1 text-xs text-gray-400"><Filter size={13}/> Filter:</div>
            <select className="input py-1 text-xs w-auto" value={fMember} onChange={e=>setFMember(e.target.value)}>
              <option value="">All members</option>
              {members.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
            <select className="input py-1 text-xs w-auto" value={fStatus} onChange={e=>setFStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUS_ORDER.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <select className="input py-1 text-xs w-auto" value={fFreq} onChange={e=>setFFreq(e.target.value)}>
              <option value="">All frequencies</option>
              {frequencies.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <select className="input py-1 text-xs w-auto" value={fPri} onChange={e=>setFPri(e.target.value)}>
              <option value="">All priorities</option>
              {['high','medium','low'].map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            {(fMember||fStatus||fFreq||fPri)&&(
              <button className="btn-secondary py-1 text-xs" onClick={()=>{setFMember('');setFStatus('');setFFreq('');setFPri('')}}>
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
                    {['Task','Assigned to','Category','Frequency','Priority','Due','Status','Actions'].map(h=>(
                      <th key={h} className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0
                    ? <tr><td colSpan={8} className="text-center text-gray-400 text-sm py-12">No tasks found</td></tr>
                    : filtered.map(t => {
                      const mIdx = members.findIndex(m => m.id === t.assigned_to)
                      const [bg, fc] = AV[Math.max(0,mIdx) % AV.length]
                      const isDone = t.status === 'done'
                      const freqLabel = frequencies.find(f => f.key === t.frequency)?.label || t.frequency
                      const freqColor = FREQ_COLOR_MAP[t.frequency] || 'bg-purple-100 text-purple-700'
                      return (
                        <tr key={t.id}
                          onClick={() => setViewTask(t)}
                          className={`border-b border-gray-50 cursor-pointer transition-colors ${isDone?'opacity-60 bg-gray-50/40 hover:bg-gray-100/60':'hover:bg-indigo-50/40'}`}>
                          <td className="px-4 py-3 max-w-[200px]">
                            <div className="flex items-center gap-2">
                              <Eye size={12} className="text-gray-300 flex-shrink-0"/>
                              <p className={`font-medium text-gray-800 truncate ${isDone?'line-through text-gray-400':''}`}>{t.title}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 rounded-full ${bg} ${fc} flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
                                {(t.assigned_to_name||'?').slice(0,2).toUpperCase()}
                              </div>
                              <span className="text-xs text-gray-600 truncate max-w-[80px]">{(t.assigned_to_name||'').split(' ')[0]}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3"><span className="badge bg-gray-100 text-gray-600 text-xs capitalize">{t.category}</span></td>
                          <td className="px-4 py-3"><span className={`badge text-xs ${freqColor}`}>{freqLabel}</span></td>
                          <td className="px-4 py-3"><span className={`badge text-xs ${PRI_COLOR[t.priority]}`}>{t.priority}</span></td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{t.due_date||'–'}</td>
                          <td className="px-4 py-3"><span className={`badge text-xs ${STATUS_COLOR[t.status]}`}>{t.status}</span></td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex gap-1">
                              <button onClick={() => setViewTask(t)} title="View details"
                                className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors">
                                <Eye size={13}/>
                              </button>
                              {canMarkDone(t) && !isDone && (
                                <button onClick={() => markDone(t)} title="Mark done"
                                  className="p-1.5 rounded-lg text-gray-400 hover:bg-green-50 hover:text-green-600 transition-colors">
                                  <CheckCircle size={13}/>
                                </button>
                              )}
                              {canEdit && !isDone && (
                                <button onClick={() => cycleStatus(t)} title="Cycle status"
                                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors">
                                  <RefreshCw size={13}/>
                                </button>
                              )}
                              {canEdit && isDone && (
                                <button onClick={() => setRevokeId(t.id)} title="Revoke"
                                  className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-50 hover:text-amber-600 transition-colors">
                                  <RotateCcw size={13}/>
                                </button>
                              )}
                              {isAdmin && (
                                <button onClick={() => deleteTask(t.id)} title="Delete"
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                                  <Trash2 size={13}/>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <PendingPopup open={popup} onClose={() => setPopup(false)} tasks={tasks} members={members}/>
    </div>
  )
}
