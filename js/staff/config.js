// ============================================================
// Staff Portal — Configuration
// ============================================================
// Follow SUPABASE_SETUP.md to fill in your real project values.
//
// demoMode:
//   true  -> no Supabase needed. The portal shows a demo of the PDF
//            filler using the sample form in assets/sample-forms/.
//   false -> the real portal. Requires the values below.
// ============================================================

window.StaffConfig = {
    supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
    supabaseAnonKey: 'YOUR-ANON-PUBLIC-KEY',
    demoMode: true,

    // Who staff should email their filled PDFs to.
    adminEmail: 'info@acetransitions.org',

    // Name of the deployed Edge Function (see SUPABASE_SETUP.md Step 3).
    createStaffFunction: 'create-staff'
};
