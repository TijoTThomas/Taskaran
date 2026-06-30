'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Profile, Task, TaskStatus, Priority } from '@/lib/types'
import Sidebar from '@/components/Sidebar'
import PendingPopup from '@/components/PendingPopup'
import toast from 'react-hot-toast'
import { Plus, RefreshCw, Trash2, X, Filter, Bell, Upload, Download, CheckCircle, RotateCcw, Calendar, Tag, Clock, AlignLeft, Flag, Users, UserPlus, Save, History } from 'lucide-react'

const STATUS_ORDER: TaskStatus[] = ['pending','in-progress','review','done']
const STATUS_COLOR: Record<string,string> = { pending:'bg-red-100 text-red-700', 'in-progress':'bg-blue-100 text-blue-700', review:'bg-amber-100 text-amber-700', done:'bg-green-100 text-green-700' }
const PRI_COLOR: Record<string,string> = { high:'bg-red-100 text-red-700', medium:'bg-amber-100 text-amber-700', low:'bg-green-100 text-green-700' }
const FREQ_COLOR_MAP: Record<string,string> = { daily:'bg-green-100 text-green-700', weekly:'bg-blue-100 text-blue-700', monthly:'bg-teal-100 text-teal-700', quarterly:'bg-amber-100 text-amber-700', yearly:'bg-rose-100 text-rose-700', once:'bg-gray-100 text-gray-600' }
const AV = [['bg-purple-100','text-purple-700'],['bg-teal-100','text-teal-700'],['bg-amber-100','text-amber-700'],['bg-blue-100','text-blue-700'],['bg-rose-100','text-rose-700']]
const EMPTY_FORM = { title:'', description:'', assignees:[] as string[], category:'other', priority:'medium' as Priority, frequency:'once', status:'pending' as TaskStatus, due_date:'' }

function formatDateTime(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

export default function TasksPage() {
  const router = useRouter()
  const [profile,      setProfile]      = useState<Profile | null>(null)
  const [tasks,        setTasks]        = useState<any[]>([])
  const [members,      setMembers]      = useState<Profile[]>([])
  const [popup,        setPopup]        = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [showImport,   setShowImport]   = useState(false)
  const [showClosed,   setShowClosed]   = useState(false)
  const [importing,    setImporting]    = useState(false)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [saving,       setSaving]       = useState(false)
  const [fMember,      setFMember]      = useState('')
  const [fStatus,      setFStatus]      = useState('')
  const [fFreq,        setFFreq]        = useState('')
  const [fPri,         setFPri]         = useState('')
  const [revokeId,     setRevokeId]     = useState<string|null>(null)
  const [revokeNote,   setRevokeNote]   = useState('')
  const [viewTask,     setViewTask]     = useState<any|null>(null)
  const [editAssignees,setEditAssignees]= useState(false)
  const [newAssignees, setNewAssignees] = useState<string[]>([])
  const [savingAssign, setSavingAssign] = useState(false)
  const [categories,   setCategories]   = useState<string[]>(['maintenance','review','report','meeting','audit','other'])
  const [frequencies,  setFrequencies]  = useState<{key:string,label:string}[]>([
    {key:'daily',label:'Daily'},{key:'weekly',label:'Weekly'},{key:'monthly',label:'Monthly'},
    {key:'quarterly',label:'Quarterly'},{key:'yearly',label:'Yearly'},{key:'once',label:'One-time'}
  ])
  const [selected,     setSelected]     = useState<Set<string>>(new Set())
  const [bulkDate,     setBulkDate]     = useState('')
  const [bulkStatus,   setBulkStatus]   = useState<TaskStatus|''>('')
  const [bulkAssignee, setBulkAssignee] = useState('')
  const [applyingBulk, setApplyingBulk] = useState(false)
  const [editDueId,    setEditDueId]    = useState<string|null>(null)
  const [inlineDue,    setInlineDue]    = useState('')

  const load = useCallback(async (uid: string) => {
    // ── AUTO-RESET STALE DAILY TASKS ──
    // If a daily task was closed on a previous day, reset it to pending for today
    const today = new Date().toISOString().split('T')[0]
    const { data: staleDailies } = await supabase
      .from('tasks')
      .select('id, closed_at')
      .eq('frequency', 'daily')
      .eq('status', 'done')
    if (staleDailies) {
      const toReset = staleDailies.filter((t:any) => {
        if (!t.closed_at) return true
        const closedDate = t.closed_at.split('T')[0]
        return closedDate < today
      })
      if (toReset.length > 0) {
        await supabase.from('tasks')
          .update({ status: 'pending', closed_by: null, closed_at: null })
          .in('id', toReset.map((t:any) => t.id))
      }
    }

    const [{ data: p }, { data: t }, { data: m }, { data: s }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('app_settings').select('*'),
    ])
    if (p) setProfile(p)
    if (m) setMembers(m)
    if (t) setTasks(t)
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

  function getAssigneeProfiles(task: any): Profile[] {
    const ids: string[] = task.assignees?.length ? task.assignees : task.assigned_to ? [task.assigned_to] : []
    return ids.map(id => members.find(m => m.id === id)).filter(Boolean) as Profile[]
  }

  function canMarkDone(task: any) {
    if (!profile) return false
    if (isManager) return true
    const ids: string[] = task.assignees?.length ? task.assignees : task.assigned_to ? [task.assigned_to] : []
    return ids.includes(profile.id)
  }

  function getMemberName(id: string | null) {
    if (!id) return '—'
    return members.find(m => m.id === id)?.full_name || '—'
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function selectAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(t => t.id)))
  }
  function clearSelection() { setSelected(new Set()); setBulkDate(''); setBulkStatus(''); setBulkAssignee('') }

  async function applyBulkDueDate() {
    if (!bulkDate || selected.size === 0) return
    setApplyingBulk(true)
    const { error } = await supabase.from('tasks').update({ due_date: bulkDate }).in('id', Array.from(selected))
    if (error) toast.error(error.message)
    else { toast.success(`✅ Due date set for ${selected.size} tasks`); clearSelection(); if (profile) load(profile.id) }
    setApplyingBulk(false)
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selected.size === 0) return
    setApplyingBulk(true)
    const updateData: any = { status: bulkStatus }
    if (bulkStatus === 'done') { updateData.closed_by = profile?.id; updateData.closed_at = new Date().toISOString() }
    const { error } = await supabase.from('tasks').update(updateData).in('id', Array.from(selected))
    if (error) toast.error(error.message)
    else { toast.success(`✅ Status updated for ${selected.size} tasks`); clearSelection(); if (profile) load(profile.id) }
    setApplyingBulk(false)
  }

  async function applyBulkAssignee() {
    if (!bulkAssignee || selected.size === 0) return
    setApplyingBulk(true)
    for (const id of Array.from(selected)) {
      const task = tasks.find(t => t.id === id); if (!task) continue
      const existing: string[] = task.assignees?.length ? task.assignees : task.assigned_to ? [task.assigned_to] : []
      const updated = existing.includes(bulkAssignee) ? existing : [...existing, bulkAssignee]
      await supabase.from('tasks').update({ assignees: updated, assigned_to: updated[0] }).eq('id', id)
    }
    toast.success(`✅ Member added to ${selected.size} tasks`)
    clearSelection(); if (profile) load(profile.id)
    setApplyingBulk(false)
  }

  async function bulkDelete() {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} tasks? This cannot be undone.`)) return
    setApplyingBulk(true)
    const { error } = await supabase.from('tasks').delete().in('id', Array.from(selected))
    if (error) toast.error(error.message)
    else { toast.success(`🗑️ ${selected.size} tasks deleted`); clearSelection(); if (profile) load(profile.id) }
    setApplyingBulk(false)
  }

  async function saveInlineDue(taskId: string) {
    const { error } = await supabase.from('tasks').update({ due_date: inlineDue || null }).eq('id', taskId)
    if (error) toast.error(error.message)
    else { toast.success('Due date updated'); setEditDueId(null); if (profile) load(profile.id) }
  }

  function toggleAssignee(memberId: string, list: string[], setList: (v:string[])=>void) {
    setList(list.includes(memberId) ? list.filter(id => id !== memberId) : [...list, memberId])
  }

  function openEditAssignees(task: any) {
    const ids: string[] = task.assignees?.length ? task.assignees : task.assigned_to ? [task.assigned_to] : []
    setNewAssignees(ids); setEditAssignees(true)
  }

  async function saveAssignees() {
    if (!viewTask || newAssignees.length === 0) { toast.error('Select at least one member'); return }
    setSavingAssign(true)
    const { error } = await supabase.from('tasks').update({ assignees: newAssignees, assigned_to: newAssignees[0] }).eq('id', viewTask.id)
    if (error) toast.error(error.message)
    else { toast.success('Assignees updated!'); setEditAssignees(false); setViewTask({ ...viewTask, assignees: newAssignees, assigned_to: newAssignees[0] }); if (profile) load(profile.id) }
    setSavingAssign(false)
  }

  async function markDone(task: any) {
    const isDone = task.status === 'done'
    const next: TaskStatus = isDone ? 'in-progress' : 'done'
    const updateData: any = { status: next }
    if (!isDone) { updateData.closed_by = profile?.id; updateData.closed_at = new Date().toISOString() }
    else { updateData.closed_by = null; updateData.closed_at = null }
    const { error } = await supabase.from('tasks').update(updateData).eq('id', task.id)
    if (error) { toast.error(error.message); return }

    // For daily tasks: record per-user closure in task_closures table
    if (task.frequency === 'daily' && profile) {
      const today = new Date().toISOString().split('T')[0]
      if (!isDone) {
        // Insert closure record for this user
        await supabase.from('task_closures').upsert({
          task_id: task.id, user_id: profile.id,
          closed_at: new Date().toISOString(), date: today
        }, { onConflict: 'task_id,user_id,date' })
      } else {
        // Remove closure record (reopening)
        await supabase.from('task_closures')
          .delete().eq('task_id', task.id).eq('user_id', profile.id).eq('date', today)
      }
    }

    toast.success(next === 'done' ? '✅ Task closed!' : '↩️ Reopened')
    if (profile) load(profile.id)
    if (viewTask?.id === task.id) setViewTask({ ...viewTask, status: next, ...updateData })
  }

  async function confirmRevoke() {
    if (!revokeId) return
    const { error } = await supabase.from('tasks').update({ status: 'pending', closed_by: null, closed_at: null }).eq('id', revokeId)
    if (error) toast.error(error.message)
    else { toast.success('Task revoked'); setRevokeId(null); setRevokeNote(''); if (profile) load(profile.id) }
  }

  async function cycleStatus(task: any) {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length]
    const updateData: any = { status: next }
    if (next === 'done') { updateData.closed_by = profile?.id; updateData.closed_at = new Date().toISOString() }
    else { updateData.closed_by = null; updateData.closed_at = null }
    const { error } = await supabase.from('tasks').update(updateData).eq('id', task.id)
    if (error) toast.error(error.message)
    else { toast.success(`→ ${next}`); if (profile) load(profile.id); if (viewTask?.id === task.id) setViewTask({ ...viewTask, ...updateData }) }
  }

  async function saveTask() {
    if (!form.title || !profile) return
    if (form.assignees.length === 0) { toast.error('Please select at least one member'); return }
    setSaving(true)
    const { error } = await supabase.from('tasks').insert({
      title: form.title, description: form.description,
      assigned_to: form.assignees[0], assignees: form.assignees,
      category: form.category, priority: form.priority,
      frequency: form.frequency, status: form.status,
      due_date: form.due_date || null, created_by: profile.id,
    })
    if (error) toast.error(error.message)
    else { toast.success('Task assigned!'); setShowForm(false); setForm(EMPTY_FORM); load(profile.id) }
    setSaving(false)
  }

  async function deleteTask(id: string) {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Task removed'); if (viewTask?.id === id) setViewTask(null); if (profile) load(profile.id) }
  }

  function downloadTemplate() {
    const csv = ['title,assigned_to_email,category,priority,frequency,due_date,description',
      'Server health check,alice@company.com,maintenance,high,daily,2026-07-01,Check all servers'].join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download='task_import_template.csv'; a.click()
    URL.revokeObjectURL(url); toast.success('Template downloaded!')
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !profile) return
    setImporting(true)
    try {
      const text = await file.text()
      const allLines = text.trim().split('\n').filter(l => !l.trim().startsWith('#') && l.trim() !== '')
      if (allLines.length < 2) { toast.error('CSV has no data rows'); setImporting(false); return }
      const headers = allLines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g,'_'))
      let imported = 0, failed = 0
      const freqMap: Record<string,string> = {}
      frequencies.forEach(f => { freqMap[f.key.toLowerCase()]=f.key; freqMap[f.label.toLowerCase()]=f.key })
      for (let i = 1; i < allLines.length; i++) {
        const line = allLines[i].trim(); if (!line) continue
        const values: string[] = []; let cur='', inQ=false
        for (const ch of line) { if(ch==='"'){inQ=!inQ}else if(ch===','&&!inQ){values.push(cur.trim());cur=''}else{cur+=ch} }
        values.push(cur.trim())
        const row: Record<string,string> = {}
        headers.forEach((h,idx)=>{row[h]=(values[idx]||'').replace(/^"|"$/g,'').trim()})
        if (!row.title) continue
        const emailsRaw = (row.assigned_to_email||'').split('|').map(e=>e.trim().toLowerCase()).filter(Boolean)
        const assigneeIds = emailsRaw.map(email=>members.find(m=>m.email.toLowerCase()===email)?.id).filter(Boolean) as string[]
        const rawFreq = (row.frequency||'once').toLowerCase().trim()
        const rawPri  = (row.priority||'medium').toLowerCase().trim()
        const { error } = await supabase.from('tasks').insert({
          title: row.title, description: row.description||'',
          assigned_to: assigneeIds[0]||null, assignees: assigneeIds,
          category: (row.category||'other').toLowerCase().trim(),
          priority: (['high','medium','low'].includes(rawPri)?rawPri:'medium') as Priority,
          frequency: freqMap[rawFreq]||frequencies[0]?.key||'once',
          status: 'pending' as TaskStatus, due_date: row.due_date||null, created_by: profile.id,
        })
        if (error){console.error('Row',i,error.message);failed++}else imported++
      }
      if (imported>0) toast.success(`✅ ${imported} tasks imported!`,{duration:5000})
      if (failed>0)   toast.error(`❌ ${failed} rows failed`,{duration:5000})
    } catch(err:any){ toast.error('Import failed: '+err.message) }
    setImporting(false); setShowImport(false); e.target.value=''; load(profile.id)
  }

  const allActive = tasks.filter(t => t.status !== 'done')
  const allClosed = tasks.filter(t => t.status === 'done')
  const filtered  = (showClosed ? allClosed : allActive).filter(t => {
    const ids: string[] = t.assignees?.length ? t.assignees : t.assigned_to ? [t.assigned_to] : []
    return (!fMember||ids.includes(fMember))&&(!fStatus||t.status===fStatus)&&(!fFreq||t.frequency===fFreq)&&(!fPri||t.priority===fPri)
  })

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  const pending    = tasks.filter(t => t.status !== 'done')
  const revokeTask = tasks.find(t => t.id === revokeId)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} pendingCount={pending.length} onBellClick={() => setPopup(true)}/>

      {/* TASK DETAIL POPUP */}
      {viewTask && (() => {
        const assignees = getAssigneeProfiles(viewTask)
        const closedByName = getMemberName(viewTask.closed_by)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setViewTask(null); setEditAssignees(false) }}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`badge text-xs ${STATUS_COLOR[viewTask.status]}`}>{viewTask.status}</span>
                    <span className={`badge text-xs ${PRI_COLOR[viewTask.priority]}`}>{viewTask.priority} priority</span>
                    {assignees.length > 1 && <span className="badge bg-indigo-100 text-indigo-700 text-xs"><Users size={10} className="inline mr-1"/>{assignees.length} assignees</span>}
                  </div>
                  <h2 className="text-base font-semibold text-gray-900 mt-1">{viewTask.title}</h2>
                </div>
                <button onClick={() => { setViewTask(null); setEditAssignees(false) }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16}/></button>
              </div>
              <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
                <div className="flex gap-3">
                  <AlignLeft size={16} className="text-gray-400 mt-0.5 flex-shrink-0"/>
                  <div><p className="text-xs font-medium text-gray-400 mb-1">Description</p>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{viewTask.description || <span className="text-gray-400 italic">No description</span>}</p></div>
                </div>
                {viewTask.status === 'done' && viewTask.closed_by && (
                  <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <CheckCircle size={18} className="text-green-600 flex-shrink-0"/>
                    <div>
                      <p className="text-xs font-semibold text-green-800">Closed by {closedByName}</p>
                      <p className="text-xs text-green-600 mt-0.5">{formatDateTime(viewTask.closed_at)}</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  <Users size={16} className="text-gray-400 mt-0.5 flex-shrink-0"/>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-gray-400">Assigned to ({assignees.length})</p>
                      {canEdit && !editAssignees && <button onClick={() => openEditAssignees(viewTask)} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"><UserPlus size={12}/> Edit assignees</button>}
                      {canEdit && editAssignees && <button onClick={() => setEditAssignees(false)} className="text-xs text-gray-400">Cancel</button>}
                    </div>
                    {editAssignees && canEdit ? (
                      <div>
                        <div className="flex flex-wrap gap-2 p-3 border border-indigo-200 rounded-lg bg-indigo-50/30 mb-3">
                          {members.map((m, i) => { const [bg,fc]=AV[i%AV.length]; const sel=newAssignees.includes(m.id)
                            return <button key={m.id} type="button" onClick={() => toggleAssignee(m.id, newAssignees, setNewAssignees)}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${sel?`${bg} ${fc} border-current shadow-sm`:'bg-white text-gray-500 border-gray-200'}`}>
                              {m.full_name.split(' ')[0]}{sel&&<span className="text-green-500">✓</span>}
                            </button>
                          })}
                        </div>
                        <button onClick={saveAssignees} disabled={savingAssign} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700">
                          {savingAssign?<span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>:<Save size={12}/>} Save
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {assignees.length === 0 ? <span className="text-sm text-gray-400">Unassigned</span>
                          : assignees.map((m,i) => { const [bg,fc]=AV[i%AV.length]
                            return <div key={m.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${bg}`}>
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold ${fc}`}>{m.full_name.slice(0,2).toUpperCase()}</div>
                              <span className={`text-xs font-medium ${fc}`}>{m.full_name}</span>
                            </div>
                          })
                        }
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4">
                  <div className="flex gap-2 items-start"><Tag size={14} className="text-gray-400 mt-0.5 flex-shrink-0"/><div><p className="text-xs text-gray-400">Category</p><p className="text-sm font-medium text-gray-700 capitalize">{viewTask.category}</p></div></div>
                  <div className="flex gap-2 items-start"><Clock size={14} className="text-gray-400 mt-0.5 flex-shrink-0"/><div><p className="text-xs text-gray-400">Frequency</p><p className="text-sm font-medium text-gray-700">{frequencies.find(f=>f.key===viewTask.frequency)?.label||viewTask.frequency}</p></div></div>
                  <div className="flex gap-2 items-start">
                    <Calendar size={14} className="text-gray-400 mt-0.5 flex-shrink-0"/>
                    <div><p className="text-xs text-gray-400 mb-1">Due date</p>
                    <input type="date" className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      defaultValue={viewTask.due_date||''}
                      onBlur={async e => {
                        if (e.target.value !== (viewTask.due_date||'')) {
                          const { error } = await supabase.from('tasks').update({ due_date: e.target.value||null }).eq('id', viewTask.id)
                          if (!error) { toast.success('Due date updated'); setViewTask({...viewTask,due_date:e.target.value}); if(profile) load(profile.id) }
                        }
                      }}/></div>
                  </div>
                  <div className="flex gap-2 items-start"><Flag size={14} className="text-gray-400 mt-0.5 flex-shrink-0"/><div><p className="text-xs text-gray-400">Priority</p><p className="text-sm font-medium text-gray-700 capitalize">{viewTask.priority}</p></div></div>
                </div>
                {assignees.length > 1 && !editAssignees && viewTask.status !== 'done' && (
                  <div className="bg-green-50 rounded-lg px-4 py-2.5 text-xs text-green-700">✅ Any of the <strong>{assignees.length} members</strong> can mark this task as done.</div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-2 flex-wrap">
                  {canMarkDone(viewTask) && viewTask.status !== 'done' && <button onClick={() => markDone(viewTask)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 text-xs font-medium hover:bg-green-100"><CheckCircle size={13}/> Mark done</button>}
                  {canEdit && viewTask.status === 'done' && <button onClick={() => { setRevokeId(viewTask.id); setViewTask(null) }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium hover:bg-amber-100"><RotateCcw size={13}/> Revoke</button>}
                  {canEdit && viewTask.status !== 'done' && <button onClick={() => cycleStatus(viewTask)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-medium hover:bg-indigo-100"><RefreshCw size={13}/> Next status</button>}
                </div>
                <div className="flex gap-2">
                  {isAdmin && <button onClick={() => deleteTask(viewTask.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-medium hover:bg-red-100"><Trash2 size={13}/> Delete</button>}
                  <button onClick={() => { setViewTask(null); setEditAssignees(false) }} className="btn-secondary text-xs py-1.5">Close</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* REVOKE POPUP */}
      {revokeId && revokeTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRevokeId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center"><RotateCcw size={18} className="text-amber-600"/></div>
              <div><h3 className="font-semibold text-gray-900 text-sm">Revoke completed task?</h3><p className="text-xs text-gray-400">Sends back to <strong>pending</strong></p></div>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4"><p className="text-sm font-medium text-gray-800">{revokeTask.title}</p></div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Reason (optional)</label>
              <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none h-16"
                placeholder="e.g. Incomplete work..." value={revokeNote} onChange={e=>setRevokeNote(e.target.value)}/>
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={()=>{setRevokeId(null);setRevokeNote('')}}>Cancel</button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600" onClick={confirmRevoke}><RotateCcw size={14}/> Revoke</button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Task board</h1>
              <p className="text-sm text-gray-400">{filtered.length} tasks · click any row to view</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {canEdit && pending.length > 0 && <button onClick={() => setPopup(true)} className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100"><Bell size={14}/> {pending.length} pending</button>}
              {canEdit && <button onClick={() => {setShowImport(!showImport);setShowForm(false)}} className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium hover:bg-green-100"><Upload size={14}/> Import CSV</button>}
              {canEdit && <button onClick={() => {setShowForm(!showForm);setShowImport(false)}} className="btn-primary">{showForm?<><X size={14}/> Cancel</>:<><Plus size={14}/> Add task</>}</button>}
            </div>
          </div>

          {!canEdit && <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 mb-5 text-xs text-indigo-700">✅ Click any task to view details and mark your assigned tasks as done.</div>}

          {/* Active / Closed toggle */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button onClick={() => setShowClosed(false)} className={`px-4 py-2 text-xs font-medium transition-colors ${!showClosed?'bg-indigo-600 text-white':'bg-white text-gray-500 hover:bg-gray-50'}`}>Active ({allActive.length})</button>
              <button onClick={() => setShowClosed(true)} className={`px-4 py-2 text-xs font-medium transition-colors flex items-center gap-1.5 ${showClosed?'bg-green-600 text-white':'bg-white text-gray-500 hover:bg-gray-50'}`}><History size={12}/> Closed ({allClosed.length})</button>
            </div>
          </div>

          {/* Bulk bar */}
          {canEdit && selected.size > 0 && (
            <div className="card p-4 mb-4 border-indigo-200 bg-indigo-50/50">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-semibold text-indigo-700">{selected.size} selected</span>
                <div className="flex-1 flex gap-3 flex-wrap items-center">
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                    <Calendar size={13} className="text-gray-400"/>
                    <input type="date" className="text-xs focus:outline-none bg-transparent" value={bulkDate} onChange={e=>setBulkDate(e.target.value)}/>
                    <button onClick={applyBulkDueDate} disabled={!bulkDate||applyingBulk} className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded disabled:opacity-40">Set due date</button>
                  </div>
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                    <RefreshCw size={13} className="text-gray-400"/>
                    <select className="text-xs focus:outline-none bg-transparent" value={bulkStatus} onChange={e=>setBulkStatus(e.target.value as TaskStatus|'')}><option value="">Set status</option>{STATUS_ORDER.map(s=><option key={s} value={s}>{s}</option>)}</select>
                    <button onClick={applyBulkStatus} disabled={!bulkStatus||applyingBulk} className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded disabled:opacity-40">Apply</button>
                  </div>
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                    <Users size={13} className="text-gray-400"/>
                    <select className="text-xs focus:outline-none bg-transparent" value={bulkAssignee} onChange={e=>setBulkAssignee(e.target.value)}><option value="">Add member</option>{members.map(m=><option key={m.id} value={m.id}>{m.full_name.split(' ')[0]}</option>)}</select>
                    <button onClick={applyBulkAssignee} disabled={!bulkAssignee||applyingBulk} className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded disabled:opacity-40">Add</button>
                  </div>
                  {isAdmin && <button onClick={bulkDelete} disabled={applyingBulk} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-medium hover:bg-red-100"><Trash2 size={12}/> Delete {selected.size}</button>}
                </div>
                <button onClick={clearSelection} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"><X size={12}/> Clear</button>
              </div>
            </div>
          )}

          {/* CSV Import */}
          {showImport && canEdit && (
            <div className="card p-5 mb-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Import tasks from CSV</h3>
              <p className="text-xs text-gray-400 mb-3">Use pipe for multiple assignees: <code className="bg-gray-100 px-1 rounded">alice@co.com|bob@co.com</code></p>
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
                <div className="col-span-2"><label className="block text-xs font-medium text-gray-500 mb-1">Task title *</label><input className="input" placeholder="Enter task name" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-2">Assign to * <span className="text-gray-400 font-normal">— any selected member can close the task</span></label>
                  <div className="flex flex-wrap gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50 min-h-[48px]">
                    {members.map((m, i) => { const [bg,fc]=AV[i%AV.length]; const sel=form.assignees.includes(m.id)
                      return <button key={m.id} type="button" onClick={() => toggleAssignee(m.id, form.assignees, (v)=>setForm({...form,assignees:v}))}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${sel?`${bg} ${fc} border-current shadow-sm`:'bg-white text-gray-500 border-gray-200'}`}>
                        {m.full_name.split(' ')[0]}{sel&&<span className="text-green-500">✓</span>}
                      </button>
                    })}
                  </div>
                  {form.assignees.length > 0 && <p className="text-xs text-indigo-600 mt-1">{form.assignees.length} selected</p>}
                </div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Category</label><select className="input" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Priority</label><select className="input" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value as Priority})}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Frequency</label><select className="input" value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})}>{frequencies.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Due date</label><input className="input" type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Status</label><select className="input" value={form.status} onChange={e=>setForm({...form,status:e.target.value as TaskStatus})}><option value="pending">Pending</option><option value="in-progress">In progress</option><option value="review">In review</option></select></div>
                <div className="col-span-2"><label className="block text-xs font-medium text-gray-500 mb-1">Description</label><textarea className="input resize-none h-16" placeholder="Task objectives, steps, notes…" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>
              </div>
              <button className="btn-primary" onClick={saveTask} disabled={saving}>{saving?<span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>:<Plus size={14}/>} Assign task</button>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-1 text-xs text-gray-400"><Filter size={13}/> Filter:</div>
            <select className="input py-1 text-xs w-auto" value={fMember} onChange={e=>setFMember(e.target.value)}><option value="">All members</option>{members.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select>
            <select className="input py-1 text-xs w-auto" value={fStatus} onChange={e=>setFStatus(e.target.value)}><option value="">All statuses</option>{STATUS_ORDER.map(s=><option key={s} value={s}>{s}</option>)}</select>
            <select className="input py-1 text-xs w-auto" value={fFreq} onChange={e=>setFFreq(e.target.value)}><option value="">All frequencies</option>{frequencies.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select>
            <select className="input py-1 text-xs w-auto" value={fPri} onChange={e=>setFPri(e.target.value)}><option value="">All priorities</option>{['high','medium','low'].map(p=><option key={p} value={p}>{p}</option>)}</select>
            {(fMember||fStatus||fFreq||fPri)&&<button className="btn-secondary py-1 text-xs" onClick={()=>{setFMember('');setFStatus('');setFFreq('');setFPri('')}}><X size={12}/> Clear</button>}
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {canEdit && <th className="px-4 py-3 w-10"><input type="checkbox" checked={filtered.length>0&&selected.size===filtered.length} onChange={selectAll} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"/></th>}
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Task</th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Assigned to</th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Category</th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Frequency</th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Priority</th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Due date</th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                    {showClosed && <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Closed by · When</th>}
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0
                    ? <tr><td colSpan={showClosed?10:9} className="text-center text-gray-400 text-sm py-12">{showClosed?'🎉 No closed tasks yet':'No tasks found'}</td></tr>
                    : filtered.map(t => {
                        const assignees  = getAssigneeProfiles(t)
                        const isDone     = t.status === 'done'
                        const isSelected = selected.has(t.id)
                        const freqLabel  = frequencies.find(f=>f.key===t.frequency)?.label||t.frequency
                        const freqColor  = FREQ_COLOR_MAP[t.frequency]||'bg-purple-100 text-purple-700'
                        const isOverdue  = t.due_date && new Date(t.due_date) < new Date() && !isDone
                        const closedByName = getMemberName(t.closed_by)
                        return (
                          <tr key={t.id} className={`border-b border-gray-50 transition-colors ${isSelected?'bg-indigo-50':isDone?'bg-green-50/30 hover:bg-green-50/50':'hover:bg-indigo-50/30'}`}>
                            {canEdit && <td className="px-4 py-3" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={()=>toggleSelect(t.id)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"/></td>}
                            <td className="px-4 py-3 max-w-[180px] cursor-pointer" onClick={() => { setViewTask(t); setEditAssignees(false) }}>
                              <p className={`font-medium text-gray-800 truncate ${isDone?'text-gray-500':''}`}>{t.title}</p>
                            </td>
                            <td className="px-4 py-3 cursor-pointer" onClick={() => { setViewTask(t); setEditAssignees(false) }}>
                              <div className="flex items-center">
                                {assignees.slice(0,3).map((m,i) => { const [bg,fc]=AV[i%AV.length]
                                  return <div key={m.id} title={m.full_name} className={`w-6 h-6 rounded-full ${bg} ${fc} flex items-center justify-center text-xs font-semibold border-2 border-white ${i>0?'-ml-1.5':''}`}>{m.full_name.slice(0,2).toUpperCase()}</div>
                                })}
                                {assignees.length>3&&<span className="text-xs text-gray-400 ml-1">+{assignees.length-3}</span>}
                                {assignees.length===0&&<span className="text-xs text-gray-400">—</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3"><span className="badge bg-gray-100 text-gray-600 text-xs capitalize">{t.category}</span></td>
                            <td className="px-4 py-3"><span className={`badge text-xs ${freqColor}`}>{freqLabel}</span></td>
                            <td className="px-4 py-3"><span className={`badge text-xs ${PRI_COLOR[t.priority]}`}>{t.priority}</span></td>
                            <td className="px-4 py-3" onClick={e=>e.stopPropagation()}>
                              {editDueId === t.id ? (
                                <input type="date" autoFocus className="text-xs border border-indigo-300 rounded px-1.5 py-1 focus:outline-none w-32"
                                  value={inlineDue} onChange={e=>setInlineDue(e.target.value)}
                                  onBlur={()=>saveInlineDue(t.id)}
                                  onKeyDown={e=>{if(e.key==='Enter')saveInlineDue(t.id);if(e.key==='Escape')setEditDueId(null)}}/>
                              ) : (
                                <button onClick={()=>{setEditDueId(t.id);setInlineDue(t.due_date||'')}}
                                  className={`text-xs px-2 py-1 rounded-lg border transition-colors ${isOverdue?'border-red-200 bg-red-50 text-red-600':t.due_date?'border-gray-200 bg-gray-50 text-gray-600 hover:bg-indigo-50 hover:border-indigo-200':'border-dashed border-gray-200 text-gray-400 hover:border-indigo-300'}`}>
                                  {t.due_date?`${t.due_date}${isOverdue?' ⚠️':''}` :'+ Set date'}
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3"><span className={`badge text-xs ${STATUS_COLOR[t.status]}`}>{t.status}</span></td>
                            {showClosed && (
                              <td className="px-4 py-3">
                                {t.closed_by ? <div><p className="text-xs font-medium text-green-700">{closedByName}</p><p className="text-xs text-gray-400">{formatDateTime(t.closed_at)}</p></div> : <span className="text-xs text-gray-400">—</span>}
                              </td>
                            )}
                            <td className="px-4 py-3" onClick={e=>e.stopPropagation()}>
                              <div className="flex gap-1">
                                {canMarkDone(t)&&!isDone&&<button onClick={()=>markDone(t)} title="Mark done" className="p-1.5 rounded-lg text-gray-400 hover:bg-green-50 hover:text-green-600 transition-colors"><CheckCircle size={13}/></button>}
                                {canEdit&&!isDone&&<button onClick={()=>cycleStatus(t)} title="Cycle status" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"><RefreshCw size={13}/></button>}
                                {canEdit&&isDone&&<button onClick={()=>setRevokeId(t.id)} title="Revoke" className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"><RotateCcw size={13}/></button>}
                                {isAdmin&&<button onClick={()=>deleteTask(t.id)} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"><Trash2 size={13}/></button>}
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

      <PendingPopup open={popup} onClose={()=>setPopup(false)} tasks={tasks} members={members}/>
    </div>
  )
}
