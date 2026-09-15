// ACE Transitions — shared Supabase client + portal helpers
// Loaded by login.html, portal.html, packet.html
const SUPABASE_URL = 'https://rlqzadarlasudqnbaqzf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2yfhC8ad8_k64dk4yxLPKA_Q7cvd8W_';

// Single shared client (window.supabaseClient)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
window.supabaseClient = supabaseClient;

// Wait until we know who the user is (or bounce to login)
window.requireUser = async function requireUser() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    window.location.replace('login.html');
    return null;
  }
  // Profile controls role + activation
  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('id, email, full_name, role, active')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    alert('Could not load your profile. Please contact an administrator.');
    await supabaseClient.auth.signOut();
    window.location.replace('login.html');
    return null;
  }
  if (!profile.active) {
    window.location.replace('login.html?pending=1');
    return null;
  }
  return profile;
};

// Sign out + return to login
window.portalSignOut = async function portalSignOut() {
  await supabaseClient.auth.signOut();
  window.location.replace('login.html');
};

// Download (or open) the employee's filled PDF from private storage
window.downloadCompletedPacket = async function downloadCompletedPacket(path) {
  const { data, error } = await supabaseClient.storage
    .from('documents')
    .createSignedUrl(path, 300); // 5-minute link
  if (error || !data) {
    alert('Could not open the document: ' + (error?.message || 'unknown error'));
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener');
};

// Tiny toast helper
window.showToast = function showToast(msg, isError = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' toast-error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, 4000);
};
