# Team Task Manager — Complete Setup Guide
### For non-technical teams · No coding required · ~25 minutes total

---

## What you're deploying
A real web application your team of 5 can access from any browser, phone, or computer — inside the office or anywhere in the world. Each person logs in with their own email and password.

---

## Step 1 — Create a free Supabase account (your database)
*Supabase stores all your tasks, team members, and login info securely.*

1. Go to **https://supabase.com** → click **Start your project**
2. Sign up with Google or GitHub (free, no credit card)
3. Click **New project**
4. Fill in:
   - **Name:** `task-manager` (or anything you like)
   - **Database password:** choose a strong password — save it somewhere!
   - **Region:** pick the one closest to your team
5. Click **Create new project** — wait about 1 minute for it to set up
6. Once ready, go to **Settings → API** in the left sidebar
7. Copy and save these two values (you'll need them in Step 3):
   - **Project URL** → looks like `https://abcdefgh.supabase.co`
   - **anon public key** → a long string starting with `eyJ...`

---

## Step 2 — Set up your database tables
*This creates the tables where tasks and users are stored.*

1. In Supabase, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open the file `supabase_schema.sql` from the app folder
4. Copy the entire contents and paste into the SQL editor
5. Click **Run** (the green button)
6. You should see "Success. No rows returned" — that means it worked!

---

## Step 3 — Deploy to Vercel (your hosting, free)
*Vercel gives your app a real URL that works anywhere.*

1. Go to **https://github.com** → create a free account if you don't have one
2. Click the **+** icon → **New repository**
   - Name it `task-manager`
   - Set it to **Private**
   - Click **Create repository**
3. Upload all the app files:
   - On your new repo page, click **uploading an existing file**
   - Drag and drop the entire `taskmanager` folder contents
   - Click **Commit changes**
4. Go to **https://vercel.com** → sign up with your GitHub account
5. Click **Add New → Project**
6. Select your `task-manager` repository → click **Import**
7. Before clicking Deploy, click **Environment Variables** and add:
   ```
   Name:  NEXT_PUBLIC_SUPABASE_URL
   Value: (paste your Project URL from Step 1)

   Name:  NEXT_PUBLIC_SUPABASE_ANON_KEY
   Value: (paste your anon key from Step 1)
   ```
8. Click **Deploy** → wait 2-3 minutes
9. You'll get a URL like `https://task-manager-yourname.vercel.app` 🎉

---

## Step 4 — Create your admin account
*The first person to sign up becomes admin — do this yourself first.*

1. Open your new app URL in the browser
2. Click **Create account**
3. Enter your name, email, and a password → click **Create account**
4. Check your email for a confirmation link → click it
5. Go back to the app and sign in
6. In Supabase → **Table Editor → profiles** → find your row → change `role` to `admin`
7. Sign out and sign back in — you now have full admin access!

---

## Step 5 — Invite your team (all 5 members)
*Works for people inside AND outside your office network.*

**Option A — Share the link (easiest)**
Send your team this message:
> "Hi team! We're using a new task manager. Sign up here: [YOUR_APP_URL]
> Use your work email and choose a password. I'll assign your role after."

**Option B — Email invite via Supabase**
1. In Supabase → **Authentication → Users** → **Invite user**
2. Enter their email → they'll get a magic link to set their password

**After each person signs up:**
1. Go to your app → **Team** tab
2. Find their name → use the role dropdown to set them as `admin`, `manager`, or `member`
3. Add their department

---

## Step 6 — Start using the app

| Role | What they can do |
|------|-----------------|
| **Admin** | Everything: assign tasks, manage team, change roles, view all reports |
| **Manager** | Assign & update tasks, view pending popup, see all reports |
| **Member** | View tasks assigned to them, read-only access |

**Daily workflow:**
1. Admin/Manager opens the app → **Pending tasks popup appears automatically** showing how many tasks each member has
2. Go to **Tasks** → **Add task** → fill in details → assign to a team member
3. Team member logs in → sees their tasks on the Task Board
4. As work progresses, manager clicks the ↻ button to cycle status: `pending → in-progress → review → done`
5. Check **Schedule** to see tasks laid out on the calendar by frequency (daily, weekly, monthly, etc.)

---

## Accessing the app

| Situation | How to access |
|-----------|--------------|
| Inside office (WiFi) | Open `your-app-url.vercel.app` in any browser |
| Outside office (home, travel) | Same URL — works from anywhere with internet |
| Mobile phone | Open the URL in Safari or Chrome — works as a mobile web app |
| Slow connection | The app is lightweight — loads in under 3 seconds |

**No VPN needed.** Vercel is a global CDN — your app loads fast worldwide.

---

## Troubleshooting

**"Invalid login credentials"** → Check email/password. Make sure you confirmed your email.

**Page shows error after deploy** → Check that both environment variables are set correctly in Vercel → Settings → Environment Variables.

**Team member can't see add-task button** → Their role is set to `member`. Go to Team tab → change their role.

**Forgot password** → On the login page, Supabase handles password reset via email automatically.

---

## Your app URL
Write it here once deployed: _______________________________

Share this URL with all 5 team members. Bookmark it on your phone!

---

*Built with Next.js 14 + Supabase + Vercel · All data stored securely in your own Supabase project*
