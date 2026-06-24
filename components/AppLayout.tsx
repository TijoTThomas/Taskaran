'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Profile, Task } from '@/lib/types'
import Sidebar from '@/components/Sidebar'
import PendingPopup from '@/components/PendingPopup'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [profile,  setProfile]  = useState<Profile | null>(null)
  const [tasks,    setTasks]    = useState<Task[]>([])
  const [members,  setMembers]  = useState<Profile[]>([])
  const [popup,    setPopup]    = useState(false)
  const [loading,  setLoading]  = useState(true)

  const fetchData = useCallback(async (uid: string) => {
    const [{ data: prof }, { data: taskData }, { data: memberData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('tasks').select('*, profiles!tasks_assigned_to_fkey(full_name)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('full_name'),
    ])
    if (prof)        setProfile(prof)
    if (taskData)    setTasks(taskData.map((t: any) => ({ ...t, assigned_to_name: t.profiles?.full_name })))
    if (memberData)  setMembers(memberData)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace('/login'); return }
      await fetchData(data.session.user.id)
      setLoading(false)
      // Show pending popup on load for admin/manager
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', data.session.user.id).single()
      if (prof?.role === 'admin' || prof?.role === 'manager') setPopup(true)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) router.replace('/login')
    })
    return () => listener.subscription.unsubscribe()
  }, [router, fetchData])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!profile) return null

  const pendingCount = tasks.filter(t => t.status !== 'done').length

  return (
    <div className="flex min-h-screen">
      <Sidebar profile={profile} pendingCount={pendingCount} onBellClick={() => setPopup(true)} />

      <main className="flex-1 p-6 overflow-auto">
        {/* Pass profile + tasks + members + refresh down via context or props */}
        {typeof children === 'function'
          ? (children as any)({ profile, tasks, members, refresh: () => supabase.auth.getSession().then(({data})=>data.session && fetchData(data.session.user.id)) })
          : children
        }
      </main>

      <PendingPopup
        open={popup && (profile.role === 'admin' || profile.role === 'manager')}
        onClose={() => setPopup(false)}
        tasks={tasks}
        members={members}
      />
    </div>
  )
}
