'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Profile, Task, TaskStatus, Priority, Frequency, Category } from '@/lib/types'
import Sidebar from '@/components/Sidebar'
import PendingPopup from '@/components/PendingPopup'
import toast from 'react-hot-toast'
import { Plus, RefreshCw, Trash2, X, Filter, Bell, Upload, Download, CheckCircle, RotateCcw } from 'lucide-react'

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

  // Dynamic settings loaded from Supabase
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
    else { toast.success(next === 'done' ? '✅ Marked as done!' : '↩️ Reopened'); if (profile) load(profile.id) }
  }

  async function confirmRevoke() {
    if (!revokeId) return
    const { error } = await supabase.from('tasks').update({ status: 'pending' }).eq('id', revokeId)
    if (error) toast.error(error.message)
    else { toast.success('Task revoked — sent back to pending'); setRevokeId(null); setRevokeNote(''); if (profile) load(profile.id) }
  }

  async function cycleStatus(task: Task) {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length]
    const { error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    if (error) toast.error(error.message)
    else { toast.success(`→ ${next}`); if (profile) load(profile.id) }
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
    else { toast.success('Task removed'); if (profile) load(profile.id) }
  }

  function downloadTemplate() {
    const catList  = categories.join(' / ')
    const freqList = frequencies.map(f => f.key).join(' / ')
    const csv = [
      'title,assigned_to_email,category,priority,frequency,due_date,description',
      `# Categories: ${catList}`,
      `# Frequencies: ${freqList}`,
      `# Priority: high / medium / low`,
      'Server health check,alice@company.com,maintenance,high,daily,2026-07-01,Check all servers daily',
      'Monthly report,bob@company.com,report,medium,monthly,2026-07-31,Compile monthly sales data',
      'Weekly review,carol@company.com,review,medium,weekly,2026-07-07,Review team progress',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'task_import_template.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success('Template downloaded — check the # comment lines for valid values!')
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    setImporting(true)

    const text  = await file.text()
    // skip comment lines starting with #
    const lines = text.trim().split('\n').filter(l => !l.trim().startsWith('#'))
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g,'_'))

    let imported = 0, failed = 0, skipped = 0

    const validCats  = categories
    const validFreqs = frequencies.map(f => f.key)

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue

      // Handle quoted commas properly
      const values: string[] = []
      let current = '', inQuotes = false
      for (const char of lines[i]) {
        if (char === '"') { inQuotes = !inQuotes }
        else if (char === ',' && !inQuotes) { values.push(current.trim()); current = '' }
        else { current += char }
      }
      values.push(current.trim())

      const row: Record<string,string> = {}
      headers.forEach((h, idx) => { row[h] = (values[idx] || '').replace(/^"|"$/g,'').trim() })

      if (!row.title) { skipped++; continue }

      // Match category — exact match first, then partial match
      const rawCat = (row.category || '').toLowerCase().trim()
      const matchedCat = validCats.find(c => c === rawCat)
        || validCats.find(c => c.includes(rawCat) || rawCat.includes(c))
        || 'other'

      // Match frequency — exact key match first, then label match
      const rawFreq = (row.frequency || '').toLowerCase().trim()
      const matchedFreq = frequencies.find(f => f.key === rawFreq)
        || frequencies.find(f => f.label.toLowerCase() === rawFreq)
        || frequencies.find(f => f.key.includes(rawFreq) || rawFreq.includes(f.key))
        || frequencies[0]

      // Match priority
      const rawPri = (row.priority || '').toLowerCase().trim()
      const matchedPri: Priority = (['high','medium','low'].includes(rawPri) ? rawPri : 'medium') as Priority

      // Match member by email
      const member = members.find(m => m.email.toLowerCase() === (row.assigned_to_email||'').toLowerCase())

      const task = {
        title:       row.title,
        description: row.description || '',
        assigned_to: member?.id || null,
        category:    matchedCat,
        priority:    matchedPri,
        frequency:   matchedFreq.key,
        status:      'pending' as TaskStatus,
        due_date:    row.due_date || null,
        created_by:  profile.id,
      }

      const { error } = await supabase.from('tasks').insert(task)
      if (error) { console.error(error); failed++ } else imported++
    }

    const msg = [`✅ ${imported} imported`]
    if (failed  > 0) msg.push(`❌ ${failed} failed`)
    if (skipped > 0) msg.push(`⏭️ ${skipped} skipped`)
    toast.success(msg.join(' · '), { duration: 5000 })

    setImporting(false)
    setShowImport(false)
    e.target.value = ''
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

      {/* REVOKE POPUP */}
      {revokeId && revokeTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRevokeId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <RotateCcw size={18} className="text-amber-600" />
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
                value={revokeNote} onChange={e => setRevokeNote(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => { setRevokeId(null); setRevokeNote('') }}>Cancel</button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 active:scale-95" onClick={confirmRevoke}>
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
              <p className="text-sm text-gray-400">{filtered.length} of {tasks.length} tasks</p>
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

          {/* Member info bar */}
          {!canEdit && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 mb-5 text-xs text-indigo-700">
              ✅ You can mark your assigned tasks as <strong>done</strong> using the green tick. Contact your manager to add or change tasks.
            </div>
          )}

          {/* CSV Import panel */}
          {showImport && canEdit && (
            <div className="card p-5 mb-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Import tasks from CSV</h3>
              <p className="text-xs text-gray-400 mb-3">Use exact category and frequency values from your Settings. Download the template to see current valid values.</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-600 mb-1.5">Valid categories:</p>
                  <div className="flex flex-wrap gap-1">
                    {categories.map(c => <span key={c} className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded-full capitalize">{c}</span>)}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-600 mb-1.5">Valid frequencies:</p>
                  <div className="flex flex-wrap gap-1">
                    {frequencies.map(f => <span key={f.key} className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded-full">{f.key}</span>)}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button onClick={downloadTemplate} className="btn-secondary"><Download size={14}/> Download template</button>
                <label className={`btn-primary cursor-pointer ${importing ? 'opacity-50 cursor-not-allowed':''}`}>
                  <Upload size={14}/> {importing ? 'Importing...' : 'Upload CSV'}
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
                  <input className="input" placeholder="Enter task name" value={form.title} onChange={e => setForm({...form, title: e.target.value})}/>
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
                  <select className="input" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                    {categories.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
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
                  <select className="input" value={form.frequency} onChange={e => setForm({...form, frequency: e.target.value})}>
                    {frequencies.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Due date</label>
                  <input className="input" type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})}/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                  <select className="input" value={form.status} onChange={e => setForm({...form, status: e.target.value as TaskStatus})}>
                    <option value="pending">Pending</option><option value="in-progress">In progress</option><option value="review">In review</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                  <textarea className="input resize-none h-16" placeholder="Task objectives, steps, notes…" value={form.description} onChange={e => setForm({...form, description: e.target.value})}/>
                </div>
              </div>
              <button className="btn-primary" onClick={saveTask} disabled={saving}>
                {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <Plus size={14}/>}
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
              {frequencies.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
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
                    {['Task','Assigned to','Category','Frequency','Priority','Due','Status','Description','Actions'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9} className="text-center text-gray-400 text-sm py-12">No tasks found</td></tr>
                  ) : filtered.map(t => {
                    const mIdx  = members.findIndex(m => m.id === t.assigned_to)
                    const [bg, fc] = AV[Math.max(0, mIdx) % AV.length]
                    const isDone   = t.status === 'done'
                    const freqLabel = frequencies.find(f => f.key === t.frequency)?.label || t.frequency
                    const freqColor = FREQ_COLOR_MAP[t.frequency] || 'bg-purple-100 text-purple-700'
                    return (
                      <tr key={t.id} className={`border-b border-gray-50 transition-colors ${isDone ? 'opacity-60 bg-gray-50/40':'hover:bg-gray-50/60'}`}>
                        <td className="px-4 py-3 font-medium text-gray-800 max-w-[160px]">
                          <p className={`truncate ${isDone?'line-through text-gray-400':''}`}>{t.title}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full ${bg} ${fc} flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
                              {(t.assigned_to_name||'?').slice(0,2).toUpperCase()}
                            </div>
                            <span className="text-xs text-gray-600 truncate max-w-[70px]">{(t.assigned_to_name||'').split(' ')[0]}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3"><span className="badge bg-gray-100 text-gray-600 text-xs capitalize">{t.category}</span></td>
                        <td className="px-4 py-3"><span className={`badge text-xs ${freqColor}`}>{freqLabel}</span></td>
                        <td className="px-4 py-3"><span className={`badge text-xs ${PRI_COLOR[t.priority]}`}>{t.priority}</span></td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{t.due_date||'–'}</td>
                        <td className="px-4 py-3"><span className={`badge text-xs ${STATUS_COLOR[t.status]}`}>{t.status}</span></td>
                        <td className="px-4 py-3 text-xs text-gray-400 max-w-[120px]">
                          <p className="truncate" title={t.description||''}>{t.description||'–'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {canMarkDone(t) && !isDone && (
                              <button onClick={() => markDone(t)} title="Mark as done"
                                className="p-1.5 rounded-lg text-gray-400 hover:bg-green-50 hover:text-green-600 transition-colors">
                                <CheckCircle size={14}/>
                              </button>
                            )}
                            {canEdit && !isDone && (
                              <button onClick={() => cycleStatus(t)} title="Cycle status"
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors">
                                <RefreshCw size={13}/>
                              </button>
                            )}
                            {canEdit && isDone && (
                              <button onClick={() => setRevokeId(t.id)} title="Revoke — send back to pending"
                                className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-50 hover:text-amber-600 transition-colors">
                                <RotateCcw size={14}/>
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
                  })}
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
