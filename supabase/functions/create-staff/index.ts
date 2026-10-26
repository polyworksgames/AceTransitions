// Supabase Edge Function: create-staff
//
// Called from the staff portal's Admin tab. Only an existing admin may
// create new staff accounts. The function:
//   1. Verifies the caller is an admin (reads the caller's profile).
//   2. Creates the auth user with a random temporary password
//      (email confirmation is skipped — the admin shares the password).
//   3. Sets the profile role (the profiles trigger creates the row).
//   4. Returns the temporary password once, so the admin can share it.
//
// Deploy with:  npx supabase functions deploy create-staff

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_ROLES = ['admin', 'clinician', 'peer_support'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Client created with the service role key, but we identify the caller
    // with the Authorization header they sent, so only admins get through.
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });

    // 1. Who is calling?
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return json({ error: 'Not authenticated.' }, 401);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return json({ error: 'Only an admin can create staff accounts.' }, 403);
    }

    // 2. Validate input.
    const body = await req.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const fullName = String(body.fullName ?? '').trim();
    const role = String(body.role ?? '').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'A valid email address is required.' }, 400);
    }
    if (!fullName) {
      return json({ error: 'A full name is required.' }, 400);
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return json({ error: 'Role must be one of: ' + ALLOWED_ROLES.join(', ') + '.' }, 400);
    }

    // 3. Create the user with a random temporary password.
    const temporaryPassword = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError) {
      console.error('create-staff: createUser failed', createError.message);
      return json({ error: createError.message }, 400);
    }

    // 4. Set the role. (The profiles trigger created the row on signup.)
    const { error: roleError } = await supabase
      .from('profiles')
      .update({ full_name: fullName, role })
      .eq('id', created.user.id);

    if (roleError) {
      console.error('create-staff: role update failed', roleError.message);
      return json({ error: 'Account created but the role could not be set: ' + roleError.message }, 500);
    }

    return json({
      ok: true,
      user: { id: created.user.id, email },
      temporaryPassword,
      message: `Staff account created for ${email}.`,
    });
  } catch (err) {
    console.error('create-staff: unexpected error', err);
    return json({ error: 'Unexpected server error.' }, 500);
  }
});
