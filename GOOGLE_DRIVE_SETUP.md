# Google Drive Mirror — Free Setup (no paid plans)

Every employee gets their own folder in the company's Google Drive. When they
submit a signed document (onboarding packet, master application, any admin
added fillable form) or upload their ID / credentials, the file is copied to
that folder:

```
📄 ACE Transitions Employee Documents/     ← the folder you share once
   ├── Jane Doe (jane@acetransitions.org)/
   │   ├── onboarding_packet-…pdf
   │   ├── master_application-…pdf
   │   ├── form-…pdf                       (admin-added fillable forms)
   │   ├── identification/                 (IDs, driver's licence…)
   │   └── credentials/                    (diplomas, certificates…)
   └── John Smith (john@acetransitions.org)/
       └── …
```

Everything here is free: a Google **service account** (no billing required),
the Drive API's free quota, and Supabase Edge Functions on the free tier.

---

## 1. Create the destination folder in Drive

1. In the company Google account, create a folder in Drive, e.g.
   **ACE Transitions Employee Documents**.
2. Copy its **folder ID** from the URL:
   `https://drive.google.com/drive/folders/`**`<FOLDER_ID>`**

## 2. Create a free service account

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and
   create a project (any name, e.g. `ace-transitions`). No billing prompt.
2. **APIs & Services → Library →** search **Google Drive API → Enable**.
3. **APIs & Services → OAuth consent screen** — fill the required fields
   (app name, your email); type "External" is fine, no scopes needed.
4. **APIs & Services → Credentials → Create credentials → Service account**
   — name it e.g. `ace-drive-mirror`. No project roles needed (skip steps).
5. Open the service account → **Keys → Add key → Create new key → JSON**.
   A `.json` file downloads — this is the credential the function uses.
6. In the JSON, find `"client_email"` — it looks like
   `ace-drive-mirror@ace-transitions.iam.gserviceaccount.com`.
7. Back in Drive, **share** the folder from step 1 with that email as
   **Editor**. (One-time; the service account then manages everything inside.)

## 3. Set the Supabase secrets and deploy the function

From the repo root (Supabase CLI required):

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF   # ref from your project URL

# Paste the FULL contents of the JSON key file between the quotes:
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='{ …entire JSON key… }'
supabase secrets set DRIVE_ROOT_FOLDER_ID='<FOLDER_ID from step 1>'

supabase functions deploy mirror-to-drive
```

## 4. Make sure the database is current

Re-run `supabase-setup.sql` in the SQL editor (safe to re-run). It adds the
`profiles.drive_folder_id` column the function uses to remember each
employee's folder.

## 5. How it runs

- **Automatic per document:** after an employee submits a form
  (`packet.html`) or uploads ID/credential files (`portal.html`), the page
  calls the `mirror-to-drive` function, which copies the file into that
  employee's folder (creating it on first use). Mirroring is best-effort —
  a Drive hiccup never blocks the employee, and admins can always catch up.
- **Admin catch-up:** the portal header has a **Sync all to Drive** button
  (admins only). It re-mirrors every completed document and upload for every
  active employee — use it after setup, after deploying the function, or any
  time something failed.

## Notes

- Files are **copies**; the originals stay in Supabase private storage, and
  the portal remains the system of record.
- Uploads land in `identification/` or `credentials/` subfolders; forms land
  in the employee's root folder named by document key.
- Deleting a document in the portal does **not** delete it in Drive (Drive is
  an archive mirror). Clean up there manually if needed.
- Drive free tier: 15 GB shared with the account's Gmail — plenty for PDFs.
