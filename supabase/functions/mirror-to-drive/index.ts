// Supabase Edge Function: mirror-to-drive
//
// Mirrors employee documents from Supabase Storage into the company's
// Google Drive, organised one folder per employee:
//
//   <Shared Folder>/
//     <Employee Full Name> (<email>)/
//       onboarding_packet-....pdf
//       master_application-....pdf
//       form:<id>-....pdf
//       identification/...
//       credentials/...
//
// Auth: a Google SERVICE ACCOUNT (free — no billing, no paid Workspace).
// The company shares the destination folder once with the service account's
// email as "Editor"; everything under it is created by the function.
//
// Called by the portal after a successful upload/submit:
//   POST /functions/v1/mirror-to-drive
//   Authorization: Bearer <user access token>   (supabase.auth.getSession())
//   { "user_id": "<uuid>", "doc_type": "onboarding_packet|master_application|form|identification|credentials|form:<id>", "path": "documents/<user_id>/..." }
//
// Admins may also omit user_id/path to re-mirror everything (catch-up):
//   { }  → full sync (admin only)
//
// Deploy:
//   supabase functions deploy mirror-to-drive
//   supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='<contents of the JSON key file>'
//   supabase secrets set DRIVE_ROOT_FOLDER_ID='<folder id from its URL>'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// ---------------------------------------------------------------------------
// Google service-account auth: build a signed JWT and swap it for an
// access token. No external dependencies (uses WebCrypto).
// ---------------------------------------------------------------------------
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive';

function b64url(bytes: Uint8Array | string): string {
  const s = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON secret is not set.');
  const svc = JSON.parse(raw);
  if (!svc.client_email || !svc.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.');
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: svc.client_email,
    scope: GOOGLE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const input = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claim));

  const keyData = svc.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  const assertion = `${input}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) throw new Error('Google token exchange failed: ' + (await res.text()).slice(0, 300));
  const tok = await res.json();
  if (!tok.access_token) throw new Error('Google token response missing access_token.');
  cachedToken = { token: tok.access_token, exp: now + (tok.expires_in ?? 3600) };
  return tok.access_token;
}

// ---------------------------------------------------------------------------
// Minimal Drive API helpers
// ---------------------------------------------------------------------------
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

async function driveFetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` } });
  return res;
}

async function ensureFolder(token: string, name: string, parentId: string): Promise<string> {
  const q = encodeURIComponent(
    `name = '${name.replace(/'/g, "\\'")}' and '${parentId.replace(/'/g, "\\'")}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const res = await driveFetch(token, `${DRIVE_API}/files?q=${q}&fields=files(id)&pageSize=1`);
  if (!res.ok) throw new Error('Drive query failed: ' + (await res.text()).slice(0, 300));
  const found = await res.json();
  if (found.files?.length) return found.files[0].id as string;

  const res2 = await driveFetch(token, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  if (!res2.ok) throw new Error('Drive folder create failed: ' + (await res2.text()).slice(0, 300));
  const created = await res2.json();
  return created.id as string;
}

async function uploadFileMultipart(token: string, name: string, parentId: string, bytes: Uint8Array, mime: string): Promise<string> {
  const boundary = 'ace' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name, parents: [parentId] });
  const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  const post = `\r\n--${boundary}--\r\n`;
  const bodyBytes = new Uint8Array(pre.length + bytes.length + post.length);
  let off = 0;
  for (const part of [new TextEncoder().encode(pre), bytes, new TextEncoder().encode(post)]) {
    bodyBytes.set(part, off);
    off += part.length;
  }
  const res = await driveFetch(token, `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: bodyBytes as unknown as BodyInit,
  });
  if (!res.ok) throw new Error('Drive upload failed: ' + (await res.text()).slice(0, 300));
  const created = await res.json();
  return created.id as string;
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------
async function downloadObject(admin: ReturnType<typeof createClient>, path: string): Promise<{ bytes: Uint8Array; name: string }> {
  const { data, error } = await admin.storage.from('documents').download(path);
  if (error || !data) throw new Error('Could not download ' + path + ': ' + (error?.message ?? 'empty'));
  const buf = await data.arrayBuffer();
  const name = path.split('/').pop() || 'document.pdf';
  return { bytes: new Uint8Array(buf), name };
}

async function profileOf(admin: ReturnType<typeof createClient>, userId: string) {
  const { data } = await admin.from('profiles').select('id, full_name, email, drive_folder_id').eq('id', userId).maybeSingle();
  return data;
}

function folderNameFor(p: { full_name: string; email: string }): string {
  const base = (p.full_name || '').trim() || p.email.split('@')[0];
  return `${base} (${p.email})`.replace(/[/\\:*?"<>|]/g, '-');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });

    // Who is calling? (admin for full sync; any active employee for their own docs)
    const { data: { user }, error: userError } = await admin.auth.getUser();
    if (userError || !user) return json({ error: 'Not authenticated.' }, 401);

    const { data: caller } = await admin.from('profiles').select('role, active').eq('id', user.id).maybeSingle();
    if (!caller?.active) return json({ error: 'Account is not active.' }, 403);
    const isAdmin = caller.role === 'admin';

    const body = await req.json().catch(() => ({}));
    const rootFolderId = Deno.env.get('DRIVE_ROOT_FOLDER_ID');
    if (!rootFolderId) throw new Error('DRIVE_ROOT_FOLDER_ID secret is not set.');

    const token = await getAccessToken();
    const admin_db = admin; // service-role client for unrestricted reads

    // ------------------------------------------------------------------
    // FULL SYNC (admin): mirror every completed/known document for everyone
    // ------------------------------------------------------------------
    if (!body.user_id && !body.path) {
      if (!isAdmin) return json({ error: 'Only an admin can run a full sync.' }, 403);

      const [{ data: people }, { data: docs }, { data: ups }] = await Promise.all([
        admin_db.from('profiles').select('id, full_name, email, drive_folder_id, active').eq('active', true),
        admin_db.from('document_assignments').select('user_id, doc_key, file_path, status').eq('status', 'complete'),
        admin_db.from('document_uploads').select('user_id, category, file_path, file_name'),
      ]);

      const results: Array<Record<string, unknown>> = [];
      for (const p of people ?? []) {
        try {
          let folderId = p.drive_folder_id;
          if (!folderId) {
            folderId = await ensureFolder(token, folderNameFor(p), rootFolderId);
            await admin_db.from('profiles').update({ drive_folder_id: folderId }).eq('id', p.id);
          }
          const sub: Record<string, string> = {};
          // Completed forms/packets go at the employee folder's root;
          // ID/credential uploads go into matching subfolders (as single mode does).
          const myDocs = (docs ?? []).filter(d => d.user_id === p.id && d.file_path);
          for (const d of myDocs) {
            const { bytes } = await downloadObject(admin_db, d.file_path);
            await uploadFileMultipart(token, d.file_path.split('/').pop(), folderId, bytes, 'application/pdf');
            results.push({ user: p.email, item: d.doc_key, ok: true });
          }
          for (const u of ups ?? []) {
            if (u.user_id !== p.id) continue;
            if (!sub[u.category]) sub[u.category] = await ensureFolder(token, u.category, folderId);
            const { bytes } = await downloadObject(admin_db, u.file_path);
            await uploadFileMultipart(token, u.file_name, sub[u.category], bytes, 'application/octet-stream');
            results.push({ user: p.email, item: u.category, ok: true });
          }
        } catch (e) {
          results.push({ user: p.email, ok: false, error: String(e.message ?? e) });
        }
      }
      return json({ ok: true, mode: 'full-sync', count: results.length, results });
    }

    // ------------------------------------------------------------------
    // SINGLE-ITEM MODE: mirror one document for one employee
    // ------------------------------------------------------------------
    const targetId = String(body.user_id ?? user.id);
    if (targetId !== user.id && !isAdmin) {
      return json({ error: 'You can only mirror your own documents.' }, 403);
    }
    // Employees may only reference paths inside their own storage folder
    // (the download below uses the service role, which bypasses RLS).
    const pathStr = String(body.path ?? '');
    if (!pathStr || pathStr.split('/')[0] !== targetId) {
      return json({ error: 'Invalid document path.' }, 403);
    }

    const prof = await profileOf(admin_db, targetId);
    if (!prof) return json({ error: 'Profile not found.' }, 404);

    let folderId = prof.drive_folder_id;
    if (!folderId) {
      folderId = await ensureFolder(token, folderNameFor(prof), rootFolderId);
      await admin_db.from('profiles').update({ drive_folder_id: folderId }).eq('id', prof.id);
    }

    const { bytes, name } = await downloadObject(admin_db, pathStr);
    // ID/credential uploads go into matching subfolders; forms stay at the root.
    const docType = String(body.doc_type ?? '');
    const sub = String(body.subfolder ?? (['identification', 'credentials'].includes(docType) ? docType : ''));
    let uploadName = name;
    if (['identification', 'credentials'].includes(docType)) {
      const { data: u } = await admin_db.from('document_uploads').select('file_name').eq('file_path', pathStr).maybeSingle();
      if (u?.file_name) uploadName = u.file_name;
    }
    let parent = folderId;
    if (sub) parent = await ensureFolder(token, sub, folderId);
    const fileId = await uploadFileMultipart(token, uploadName, parent, bytes, String(body.mime ?? 'application/pdf'));

    return json({ ok: true, mode: 'single', drive_file_id: fileId, name: uploadName });
  } catch (err) {
    console.error('mirror-to-drive: unexpected error', err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
