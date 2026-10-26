# Supabase Setup Instructions (Staff Portal)

The staff portal (`staff.html`) uses Supabase for login, staff roles, and
storing the blank PDF forms. Follow these steps once, then staff can log in.

> **Employee portal (`portal.html`) users:** if you are setting up the
> employee portal, run `supabase-setup.sql` instead — it includes the
> `fillable_forms` table that powers the admin-managed forms in the
> Manage Documents tab (re-run it after pulling this change; it is safe
> to run repeatedly).

---

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com/](https://supabase.com/) and sign up (free tier is fine).
2. Click **New project** and create a project (any name, e.g. `ace-transitions-staff`).
3. Set a strong database password and save it somewhere safe.

## Step 2: Run the Database Schema

1. In your project, open **SQL Editor** → **New query**.
2. Paste the entire contents of `supabase/schema.sql` from this repo.
3. Click **Run**.
4. You should see the tables `profiles`, `form_templates`, `training_videos`,
   and `training_progress` appear under **Table Editor** after refreshing.

> The schema also creates a private storage bucket named `form-templates`
> where the blank PDF forms live, plus all the security (RLS) rules.

## Step 3: Deploy the `create-staff` Edge Function

This lets an admin create staff accounts from the web app.

1. Install the Supabase CLI if you don't have it:
   ```bash
   npm install -g supabase
   ```
2. From this repo's root, link it to your project:
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   (Your project ref is the part of your project URL like `abcdefghijklmnopqrst`.)
3. Deploy the function:
   ```bash
   supabase functions deploy create-staff
   ```

**Manual fallback (no CLI needed):** skip the function and create accounts by
hand in the Supabase dashboard (see Step 6 below).

## Step 4: Copy Your Keys Into the Portal

1. In Supabase, go to **Project Settings** → **API**.
2. Copy the **Project URL** and the **anon / public** key.
3. Open `js/staff/config.js` and paste them in:

   ```javascript
   window.StaffConfig = {
       supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
       supabaseAnonKey: 'YOUR-ANON-PUBLIC-KEY',
       demoMode: false,          // true = filler demo without Supabase
       adminEmail: 'info@acetransitions.org',
       createStaffFunction: 'create-staff'
   };
   ```

4. Set `demoMode` to `false` so the portal uses your real project.

> The anon key is meant to be public — it lives in the browser. All real
> security is enforced by the Row Level Security policies from Step 2.

## Step 5: Upload Your PDF Forms

1. Log in to `staff.html` as an admin.
2. Go to the **Forms** tab → **Add Form**.
3. Choose a **fillable** PDF (one with actual form fields), give it a name,
   and optionally paste a field-label mapping (see below).
4. The form now appears for Clinicians and Admins to fill.

### Friendly field labels (optional but recommended)

PDF field names are often cryptic (e.g. `topmostSubform[0].Page1[0].f1_1[0]`).
To show friendly labels instead, open the PDF in a viewer that lists field
names (Chrome's built-in PDF viewer → right-click a field, or a tool like
Acrobat's "Prepare Form"), then paste a JSON mapping when adding the form:

```json
{
  "topmostSubform[0].Page1[0].f1_1[0]": "First Name",
  "topmostSubform[0].Page1[0].f1_2[0]": "Last Name"
}
```

Without a mapping, the portal shows the cleaned-up field name, which still
works — just less pretty.

## Step 6: Create Your First Admin Account

**Option A — via the Edge Function (recommended):** you still need one admin
to exist first. Until then, use Option B once, then create everyone else
from the web app.

**Option B — manually in the dashboard:**
1. In Supabase, go to **Authentication** → **Users** → **Add user**.
2. Enter the admin's email and a temporary password, and turn on
   **Auto Confirm User**.
3. The `profiles` trigger automatically creates the profile with role
   `peer_support`.
4. To make them an admin, run this in the SQL Editor:
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'admin@example.com');
   ```
   (Replace the email. Note: the trigger gives every new user the
   `peer_support` role by default — they can log in and see the portal, but
   they cannot fill PDFs until an admin sets their role to `clinician`.)

## Step 7: Invite the Rest of the Staff

1. Log in to `staff.html` as the admin.
2. Open the **Admin** tab → **Add Staff**.
3. Enter the person's name, email, and role:
   - **Admin** — full access, manages staff and forms, sees training progress.
   - **Clinician** — can fill out PDF forms.
   - **Peer Support** — can log in and view forms, but cannot fill them.
4. Copy the temporary password the portal shows and share it with them.
   (They can't change it in the portal yet — you can change passwords from
   Supabase → Authentication → Users if needed.)

## Troubleshooting

- **Login says invalid credentials** — the user's email confirmation may be
  pending. Check Authentication → Users, and enable **Auto Confirm User**
  in Authentication → Providers → Email.
- **"Only an admin can create staff accounts"** — the person trying to add
  staff isn't an admin. Fix their role with Option B above.
- **"Failed to load PDF"** — the form may be an encrypted PDF (password
  protected). Re-save it without encryption, or re-create it with fields
  (Acrobat → Prepare Form → Save As).
- **Fields missing in the filler** — some PDFs store fields in a way pdf-lib
  can't read. Re-save the PDF with Acrobat ("Save As Other → Optimized PDF"
  often helps), or generate a fresh form with the tool at
  `tools/make-sample-pdf.html`.

## Testing Without Supabase (demo mode)

Set `demoMode: true` in `js/staff/config.js` and open `staff.html` — login and
admin features are disabled, but you can try the PDF filler with the sample
form at `assets/sample-forms/intake-demo.pdf` (regenerate it anytime by
opening `tools/make-sample-pdf.html` and clicking the button).
