'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { CheckSquare, Mail, Lock, User } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.replace('/dashboard')
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name, role: 'member' } }
        })
        if (error) throw error
        toast.success('Account created! Check your email to confirm, then log in.')
        setMode('login')
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl mb-4">
            <CheckSquare className="text-white" size={28} />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Team Task Manager</h1>
          <p className="text-gray-500 text-sm mt-1">Assign, schedule & track — together</p>
        </div>

        <div className="card p-8">
          <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
            {(['login','signup'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-1.5 text-sm rounded-md font-medium transition-all ${mode===m ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full name</label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input className="input pl-9" placeholder="Alice Chen" value={name}
                    onChange={e => setName(e.target.value)} required />
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email address</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="input pl-9" type="email" placeholder="you@company.com"
                  value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="input pl-9" type="password" placeholder="Min. 6 characters"
                  value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
              </div>
            </div>
            <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={loading}>
              {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {mode === 'login' && (
            <p className="text-center text-xs text-gray-400 mt-4">
              New team member?{' '}
              <button className="text-indigo-600 hover:underline" onClick={() => setMode('signup')}>Create account</button>
            </p>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Your admin will assign your role after signup.
        </p>
      </div>
    </div>
  )
}
