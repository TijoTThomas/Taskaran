'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Profile } from '@/lib/types'
import Sidebar from '@/components/Sidebar'
import toast from 'react-hot-toast'
import { Plus, Trash2, Tag, Clock, Save } from 'lucide-react'

const DEFAULT_CATEGORIES = ['maintenance','review','report','meeting','audit','other']
const DEFAULT_FREQUENCIES = [
  { key:'daily',     label:'Daily' },
  { key:'weekly',    label:'Weekly' },
  { key:'monthly',   label:'Monthly' },
  { key:'quarterly', label:'Quarterly' },
  { key:'yearly',    label:'Yearly' },
  { key:'once',      label:'One-time' },
]

export default function SettingsPage() {
  const router = useRouter()
  const [profile,     setProfile]     = useState<Profile | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [categories,  setCategories]  = useState<string[]>([])
  const [frequencies, setFrequencies] = useState<{key:string,label:string}[]>([])
  const [newCat,      setNewCat]      = useState('')
  const [newFreqLbl,  setNewFreqLbl]  = useState('')
  const [saving,      setSaving]      = useState(false)

  const load = useCallback(async (uid: string) => {
    const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).single()
    if (p) setProfile(p)
    const { data: s } = await supabase.from('app_settings').select('*')
    if (s && s.length > 0) {
      const catRow  = s.find((r:any) => r.key === 'categories')
      const freqRow = s.find((r:any) => r.key === 'frequencies')
      if (catRow)  setCategories(JSON.parse(catRow.value))
      if (freqRow) setFrequencies(JSON.parse(freqRow.value))
    } else {
      setCategories(DEFAULT_CATEGORIES)
      setFrequencies(DEFAULT_FREQUENCIES)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace('/login'); return }
      await load(data.session.user.id)
      setLoading(false)
    })
  }, [router, load])

  async function saveSettings() {
    setSaving(true)
    const { error } = await supabase.from('app_settings').upsert([
      { key: 'categories',  value: JSON.stringify(categories) },
      { key: 'frequencies', value: JSON.stringify(frequencies) },
    ], { onConflict: 'key' })
    if (error) toast.error(error.message)
    else toast.success('Settings saved! Changes apply immediately.')
    setSaving(false)
  }

  function addCategory() {
    const v = newCat.trim().toLowerCase()
    if (!v) return
    if (categories.includes(v)) { toast.error('Already exists'); return }
    setCategories([...categories, v])
    setNewCat('')
    toast.success(`"${v}" added — click Save`)
  }

  function removeCategory(cat: string) {
    if (DEFAULT_CATEGORIES.includes(cat)) { toast.error('Cannot remove default categories'); return }
    setCategories(categories.filter(c => c !== cat))
  }

  function addFrequency() {
    const l = newFreqLbl.trim()
    const k = l.toLowerCase().replace(/\s+/g,'-')
    if (!l) return
    if (frequencies.find(f => f.key === k)) { toast.error('Already exists'); return }
    setFrequencies([...frequencies, { key: k, label: l }])
    setNewFreqLbl('')
    toast.success(`"${l}" added — click Save`)
  }

  function removeFrequency(key: string) {
    if (DEFAULT_FREQUENCIES.map(f => f.key).includes(key)) { toast.error('Cannot remove defaults'); return }
    setFrequencies(frequencies.filter(f => f.key !== key))
  }

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (profile.role !== 'admin') return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} pendingCount={0} onBellClick={() => {}} />
      <main className="flex-1 p-6 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <p className="text-lg font-medium">Access denied</p>
          <p className="text-sm mt-1">Only admins can access settings.</p>
        </div>
      </main>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} pendingCount={0} onBellClick={() => {}} />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto">

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">App settings</h1>
              <p className="text-sm text-gray-400">Add or remove task categories and frequencies</p>
            </div>
            <button onClick={saveSettings} disabled={saving} className="btn-primary">
              {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <Save size={14}/>}
              Save changes
            </button>
          </div>

          {/* CATEGORIES */}
          <div className="card p-5 mb-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                <Tag size={15} className="text-indigo-600"/>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Task categories</h2>
                <p className="text-xs text-gray-400">{categories.length} total · grey = default (cannot remove)</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {categories.map(cat => {
                const isDefault = DEFAULT_CATEGORIES.includes(cat)
                return (
                  <div key={cat} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border capitalize ${isDefault ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                    {cat}
                    {!isDefault && (
                      <button onClick={() => removeCategory(cat)} className="hover:text-red-500 ml-0.5">
                        <Trash2 size={11}/>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2">
              <input className="input flex-1" placeholder='e.g. Training, Inspection, Safety check'
                value={newCat} onChange={e => setNewCat(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCategory()} />
              <button onClick={addCategory} className="btn-primary"><Plus size={14}/> Add</button>
            </div>
          </div>

          {/* FREQUENCIES */}
          <div className="card p-5 mb-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                <Clock size={15} className="text-purple-600"/>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Task frequencies</h2>
                <p className="text-xs text-gray-400">{frequencies.length} total · grey = default (cannot remove)</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 mb-4">
              {frequencies.map(f => {
                const isDefault = DEFAULT_FREQUENCIES.map(d => d.key).includes(f.key)
                return (
                  <div key={f.key} className={`flex items-center justify-between px-4 py-2.5 rounded-lg border ${isDefault ? 'bg-gray-50 border-gray-200' : 'bg-purple-50 border-purple-200'}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-800">{f.label}</span>
                      <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">{f.key}</span>
                    </div>
                    {!isDefault && (
                      <button onClick={() => removeFrequency(f.key)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                        <Trash2 size={13}/>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2">
              <input className="input flex-1" placeholder='e.g. Bi-weekly, Half-yearly, Every 2 months'
                value={newFreqLbl} onChange={e => setNewFreqLbl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addFrequency()} />
              <button onClick={addFrequency} className="btn-primary"><Plus size={14}/> Add</button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Just type the name — key is auto-generated</p>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-xs text-amber-700">
            <strong>Remember to click "Save changes"</strong> after making any updates. New options appear in the task form immediately.
          </div>

        </div>
      </main>
    </div>
  )
}
