import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// See app/api/create-member/route.ts for why this must run server-side:
// supabase.auth.admin.* methods require the service role key, which the
// browser client (anon key) never has access to — calling them client-side
// always throws, which is why password resets were silently falling back
// to "send a reset email" even when the admin explicitly set a new password.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  try {
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in your host environment variables and redeploy.' },
        { status: 500 }
      )
    }

    const authHeader = req.headers.get('authorization') || ''
    const callerToken = authHeader.replace('Bearer ', '')
    if (!callerToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: callerUser, error: callerErr } = await adminClient.auth.getUser(callerToken)
    if (callerErr || !callerUser?.user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const { data: callerProfile } = await adminClient
      .from('profiles').select('role').eq('id', callerUser.user.id).single()

    if (!callerProfile || (callerProfile.role !== 'admin' && callerProfile.role !== 'manager')) {
      return NextResponse.json({ error: 'Only admins or managers can reset passwords' }, { status: 403 })
    }

    const { userId, password } = await req.json()
    if (!userId || !password) {
      return NextResponse.json({ error: 'userId and password are required' }, { status: 400 })
    }
    if (String(password).length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const { error } = await adminClient.auth.admin.updateUserById(userId, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to reset password' }, { status: 500 })
  }
}
