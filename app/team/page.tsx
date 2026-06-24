'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Profile, Task, Role } from '@/lib/types'
import Sidebar from '@/components/Sidebar'
import PendingPopup from '@/components/PendingPopup'
import toast from 'react-hot-toast'
import { Bell, Shield, Users, User, Briefcase, BarChart2 } from 'lucide-react'

const AV = [['bg-purple-100','text-purple-700'],['bg-teal-100','text-teal-700'],['bg-amber-100','text-amber-700'],['bg-blue-100','text-blue-700'],['bg-rose-100','text-rose-700']]
const RBADGE: Record<string,string> = { admin:'bg-purple-100 text-purple-700', manager:'bg-teal-100 text-teal-700', member:'bg-gray-100 text-gray-600' }

export default function TeamPage() {
  const router = useRouter()
  const [profile,  setProfile]  = useState<Profile | null>(null)
  const [members,  setMembers]  = useState<Profile[]>([])
  const [tasks,    setTasks]    = useState<Task[]>([])
  const [popup,    setPopup]    = useState(false)
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async (uid: string) => {
    const [{ data: p }, { data: m }, { data: t }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('tasks').select('*, profiles!tasks_assigned_to_fkey(full_name)').order('created_at', { ascending: false }),
    ])
    if (p) setProfile(p)
    if (m) setMembers(m)
    if (t) setTasks(t.map((x: any) => ({ ...x, assigned_to_name: x.profiles?.full_name })))
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace('/login'); return }
      await load(data.session.user.id)
      setLoading(false)
    })
  }, [router, load])

  async function updateRole(memberId: string, role: Role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', memberId)
    if (error) toast.error(error.message)
    else { toast.success('Role updated'); if(profile) load(profile.id) }
  }

  async function updateDept(memberId: string, department: string) {
    const { error } = await supabase.from('profiles').update({ department }).eq('id', memberId)
    if (error) toast.error(error.message)
    else { toast.success('Department updated'); if(profile) load(profile.id) }
  }

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const pending = tasks.filter(t => t.status !== 'done')
  const isAdmin = profile.role === 'admin'
  const admins   = members.filter(m => m.role === 'admin').length
  const managers = members.filter(m => m.role === 'manager').length

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} pendingCount={pending.length} onBellClick={() => setPopup(true)} />

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Team</h1>
              <p className="text-sm text-gray-400">{members.length} members across {[...new Set(members.map(m=>m.department).filter(Boolean))].length} departments</p>
            </div>
            {(profile.role === 'admin' || profile.role === 'manager') && pending.length > 0 && (
              <button onClick={() => setPopup(true)}
                className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100">
                <Bell size={14}/> {pending.length} pending
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label:'Admins', val: admins, icon: Shield, color:'text-purple-600', bg:'bg-purple-50' },
              { label:'Managers', val: managers, icon: Users, color:'text-teal-600', bg:'bg-teal-50' },
              { label:'Members', val: members.length-admins-managers, icon: User, color:'text-gray-600', bg:'bg-gray-100' },
            ].map(s => (
              <div key={s.label} className="card p-4">
                <div className={`w-8 h-8 ${s.bg} ${s.color} rounded-lg flex items-center justify-center mb-2`}><s.icon size={16}/></div>
                <div className={`text-2xl font-semibold ${s.color}`}>{s.val}</div>
                <div className="text-xs text-gray-400">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Invite notice */}
          <div className="card p-4 mb-5 border-l-4 border-l-indigo-400 rounded-l-none">
            <p className="text-sm font-medium text-gray-700">Inviting new team members</p>
            <p className="text-xs text-gray-400 mt-1">Share your app URL with your team. They create an account, then you assign their role here. Works from any device, any network.</p>
          </div>

          {/* Member list */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Team roster</h3>
            </div>
            {members.map((m, i) => {
              const [bg, fc] = AV[i % AV.length]
              const mt = tasks.filter(t => t.assigned_to === m.id)
              const mp = mt.filter(t => t.status !== 'done').length
              return (
                <div key={m.id} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <div className={`w-10 h-10 rounded-full ${bg} ${fc} flex items-center justify-center text-sm font-semibold flex-shrink-0`}>
                    {m.full_name.slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-sm text-gray-900">{m.full_name}</span>
                      <span className={`badge text-xs ${RBADGE[m.role]}`}>{m.role}</span>
                      {m.id === profile.id && <span className="badge bg-indigo-100 text-indigo-700 text-xs">you</span>}
                    </div>
                    <p className="text-xs text-gray-400">{m.email}</p>
                  </div>

                  {/* Department */}
                  <div className="flex items-center gap-1">
                    <Briefcase size={13} className="text-gray-300"/>
                    {isAdmin ? (
                      <input className="input text-xs py-1 w-28" placeholder="Department"
                        defaultValue={m.department||''}
                        onBlur={e => e.target.value !== (m.department||'') && updateDept(m.id, e.target.value)} />
                    ) : (
                      <span className="text-xs text-gray-400">{m.department||'—'}</span>
                    )}
                  </div>

                  {/* Task count */}
                  <div className="flex items-center gap-1 text-xs text-gray-400 w-24">
                    <BarChart2 size={13} className="text-gray-300"/>
                    {mt.length} tasks · {mp} pending
                  </div>

                  {/* Role selector (admin only, not self) */}
                  {isAdmin && m.id !== profile.id ? (
                    <select className="input text-xs py-1 w-28"
                      value={m.role}
                      onChange={e => updateRole(m.id, e.target.value as Role)}>
                      <option value="member">Member</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <div className="w-28" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </main>

      <PendingPopup open={popup} onClose={() => setPopup(false)} tasks={tasks} members={members} />
    </div>
  )
}
