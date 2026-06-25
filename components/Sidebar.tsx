'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Profile } from '@/lib/types'
import { LayoutDashboard, ClipboardList, Users, Calendar, LogOut, CheckSquare, Bell, Settings } from 'lucide-react'

interface Props { profile: Profile; pendingCount: number; onBellClick: () => void }

export default function Sidebar({ profile, pendingCount, onBellClick }: Props) {
  const path   = usePathname()
  const router = useRouter()

  const NAV = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin','manager','member'] },
    { href: '/tasks',     icon: ClipboardList,   label: 'Tasks',     roles: ['admin','manager','member'] },
    { href: '/team',      icon: Users,            label: 'Team',      roles: ['admin','manager','member'] },
    { href: '/schedule',  icon: Calendar,         label: 'Schedule',  roles: ['admin','manager','member'] },
    { href: '/settings',  icon: Settings,         label: 'Settings',  roles: ['admin'] },
  ]

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const initials = profile.full_name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()
  const canSeeAlert = profile.role === 'admin' || profile.role === 'manager'

  return (
    <aside className="w-60 min-h-screen bg-white border-r border-gray-100 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <CheckSquare size={16} className="text-white" />
          </div>
          <span className="font-semibold text-gray-900 text-sm">TaskManager</span>
        </div>
      </div>

      {/* Pending alert bell */}
      {canSeeAlert && pendingCount > 0 && (
        <button onClick={onBellClick}
          className="mx-3 mt-4 flex items-center gap-3 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100 text-red-700 hover:bg-red-100 transition-colors text-sm font-medium">
          <Bell size={15} />
          <span className="flex-1 text-left">Pending tasks</span>
          <span className="bg-red-600 text-white text-xs font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
            {pendingCount}
          </span>
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.filter(n => n.roles.includes(profile.role)).map(({ href, icon: Icon, label }) => {
          const active = path === href
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}>
              <Icon size={17} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User + logout */}
      <div className="px-3 pb-4 border-t border-gray-100 pt-3">
        <div className="flex items-center gap-3 px-2 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-900 truncate">{profile.full_name}</p>
            <p className="text-xs text-gray-400 capitalize">{profile.role}</p>
          </div>
        </div>
        <button onClick={signOut}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors">
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </aside>
  )
}
