// ============================================================
// Staff Portal — Supabase client + data helpers
// ============================================================
(function () {
    'use strict';

    const cfg = window.StaffConfig;
    if (!cfg || typeof window.supabase === 'undefined') {
        console.error('Staff portal: StaffConfig or supabase-js is missing.');
        return;
    }

    const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

    // Demo templates used when demoMode is on (no Supabase needed).
    const demoTemplates = [{
        id: 'demo-intake',
        name: 'Intake Demo Form',
        description: 'Sample fillable form so you can try the filler before connecting Supabase.',
        storage_path: 'local://assets/sample-forms/intake-demo.pdf',
        field_labels: {
            'first_name': 'First Name',
            'last_name': 'Last Name',
            'date_of_birth': 'Date of Birth',
            'program': 'Program',
            'county': 'County',
            'consent': 'I consent to receiving services',
            'gender': 'Gender',
            'notes': 'Notes',
            'signature': 'Signature'
        },
        is_active: true
    }];

    const StaffClient = {
        client: client,
        demoMode: !!cfg.demoMode,
        adminEmail: cfg.adminEmail || 'info@acetransitions.org',
        demo: demoTemplates,

        // ---------- auth ----------
        getSession() {
            return client.auth.getSession();
        },

        onAuthChange(callback) {
            return client.auth.onAuthStateChange(callback);
        },

        async signIn(email, password) {
            return client.auth.signInWithPassword({ email, password });
        },

        async signOut() {
            return client.auth.signOut();
        },

        async resetPassword(email) {
            return client.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + window.location.pathname
            });
        },

        // ---------- profiles ----------
        async getProfile(userId) {
            const { data, error } = await client
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();
            return error ? { data: null, error } : { data, error: null };
        },

        async listStaff() {
            return client.from('profiles').select('*').order('full_name');
        },

        async updateRole(userId, role) {
            return client.from('profiles').update({ role }).eq('id', userId);
        },

        // ---------- forms ----------
        async listForms() {
            const { data, error } = await client
                .from('form_templates')
                .select('*')
                .eq('is_active', true)
                .order('name');
            return { data, error };
        },

        // Returns the blank PDF as an ArrayBuffer.
        async fetchBlankPdf(template) {
            if (String(template.storage_path).startsWith('local://')) {
                const localPath = template.storage_path.replace('local://', './');
                const res = await fetch(localPath);
                if (!res.ok) throw new Error('Could not load the form file (' + res.status + ').');
                return res.arrayBuffer();
            }
            const { data, error } = await client.storage
                .from('form-templates')
                .download(template.storage_path);
            if (error) throw error;
            return data.arrayBuffer();
        },

        async uploadTemplate(name, description, file, fieldLabels) {
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = 'templates/' + Date.now() + '-' + safeName;
            const { error: upErr } = await client.storage
                .from('form-templates')
                .upload(path, file, { contentType: file.type || 'application/pdf' });
            if (upErr) return { error: upErr };

            const { error: insErr } = await client.from('form_templates').insert({
                name,
                description,
                storage_path: path,
                field_labels: fieldLabels || {}
            });
            return { error: insErr };
        },

        async deleteTemplate(id, storagePath) {
            const { error: dbErr } = await client.from('form_templates').delete().eq('id', id);
            if (dbErr) return { error: dbErr };
            if (storagePath && !String(storagePath).startsWith('local://')) {
                await client.storage.from('form-templates').remove([storagePath]);
            }
            return { error: null };
        },

        // ---------- training progress (admin) ----------
        async getTrainingSummary() {
            const [staffRes, progressRes, videosRes] = await Promise.all([
                client.from('profiles').select('id, full_name, role').order('full_name'),
                client.from('training_progress').select('user_id, video_id, status, updated_at'),
                client.from('training_videos').select('id, title, sort_order').order('sort_order')
            ]);
            return {
                staff: staffRes.data || [],
                progress: progressRes.data || [],
                videos: videosRes.data || [],
                error: staffRes.error || progressRes.error || videosRes.error || null
            };
        }
    };

    window.Staff = window.Staff || {};
    window.Staff.client = StaffClient;
})();
