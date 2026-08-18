import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────
// WHY THIS ROUTE EXISTS
// The Team page previously created new members with supabase.auth.signUp(),
// the PUBLIC self-registration endpoint. That fails outright with a
// "Signups not allowed for this instance" error whenever an admin has
// disabled self-signup in Supabase (Authentication → Settings → "Allow new
// users to sign up"), which is the normal, recommended setting for an
// internal team tool where only admins should be able to add members.
//
// Admin-initiated account creation must go through the Supabase ADMIN API
// (auth.admin.createUser), which requires the SERVICE ROLE key. That key
// must never be sent to the browser, so this has to run in a server route.
// ─────────────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  try {
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in your Vercel/host environment variables (see Supabase → Settings → API → service_role key) and redeploy.' },
        { status: 500 }
      )
    }

    // 1. Authenticate the CALLER using their own access token (sent from the
    //    browser's current session) — we must verify they're an admin/manager
    //    before we let them create accounts with the service role key.
    const authHeader = req.headers.get('authorization') || ''
    const callerToken = authHeader.replace('Bearer ', '')
    if (!callerToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

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
      return NextResponse.json({ error: 'Only admins or managers can create team members' }, { status: 403 })
    }

    // 2. Validate input
    const body = await req.json()
    const { full_name, email, password, role, department } = body || {}
    if (!full_name || !email || !password) {
      return NextResponse.json({ error: 'full_name, email and password are required' }, { status: 400 })
    }
    if (String(password).length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // 3. Create the user via the Admin API. This bypasses the public signup
    //    toggle entirely and auto-confirms the email, so the new member can
    //    log in immediately without an email-confirmation step.
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role: role || 'member' },
    })
    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 400 })
    }

    // 4. Upsert the profile row (in case the DB trigger that auto-creates
    //    profiles on signup doesn't run for admin-created users, or to make
    //    sure department/role match exactly what the admin chose).
    if (created.user) {
      const { error: profileErr } = await adminClient.from('profiles').upsert({
        id: created.user.id,
        email,
        full_name,
        role: role || 'member',
        department: department || null,
      })
      if (profileErr) {
        return NextResponse.json({ error: `User created but profile save failed: ${profileErr.message}` }, { status: 500 })
      }
    }

    return NextResponse.json({ user: created.user })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create member' }, { status: 500 })
  }
}
