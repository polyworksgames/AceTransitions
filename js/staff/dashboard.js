// ============================================================
// Staff Portal — Dashboard (session handling, roles, tabs)
// ============================================================
(function () {
    'use strict';

    const Staff = window.Staff;
    if (!Staff || !Staff.client) return;

    const client = Staff.client;
    const ui = Staff.ui;

    let currentProfile = null;

    function roleLabel(role) {
        return {
            admin: 'Admin',
            clinician: 'Clinician',
            peer_support: 'Peer Support'
        }[role] || role || '';
    }

    // ---------- view switching ----------
    function showLogin() {
        document.getElementById('login-view').hidden = false;
        document.getElementById('dashboard-view').hidden = true;
        Staff.forms.exitFiller();
    }

    async function showDashboard() {
        // Demo mode: no real session — show a demo dashboard.
        if (client.demoMode) {
            currentProfile = { full_name: 'Demo User', role: 'admin' };
            renderShell();
            return;
        }

        const { data: { session } } = await client.getSession();
        if (!session) {
            showLogin();
            return;
        }

        const { data: profile } = await client.getProfile(session.user.id);
        if (!profile) {
            ui.toast('Could not load your profile. Please sign in again.', 'error');
            await client.signOut();
            showLogin();
            return;
        }

        currentProfile = profile;
        renderShell();
    }

    function renderShell() {
        const demo = client.demoMode;

        document.getElementById('demo-banner').hidden = !demo;
        document.getElementById('login-view').hidden = true;
        document.getElementById('dashboard-view').hidden = false;

        // User info
        document.getElementById('user-name').textContent =
            currentProfile.full_name || (demo ? 'Demo User' : 'Staff Member');
        const badge = document.getElementById('user-role');
        badge.textContent = roleLabel(currentProfile.role);
        badge.className = 'role-badge ' + (currentProfile.role || '');

        // Role-gated pieces. Admin features need a real Supabase project,
        // so they are hidden in demo mode.
        const canFill = demo || currentProfile.role === 'admin' || currentProfile.role === 'clinician';
        const isAdmin = currentProfile.role === 'admin';

        document.getElementById('admin-tab').hidden = !(isAdmin && !demo);
        document.getElementById('upload-form-btn').hidden = !(isAdmin && !demo);
        document.getElementById('staff-create-btn').parentElement.hidden = !(isAdmin && !demo);

        // Remember who can fill for the forms module.
        Staff.forms.setPermission(canFill, isAdmin);

        // Load the active tab's content.
        switchTab('forms');
    }

    function switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === 'view-' + tab);
        });

        if (tab === 'forms') {
            Staff.forms.exitFiller();
            Staff.forms.renderForms();
        } else if (tab === 'training') {
            Staff.training.render();
        } else if (tab === 'admin') {
            Staff.admin.render();
        }
    }

    function getProfile() {
        return currentProfile;
    }

    // ----- init -----
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    Staff.dashboard = {
        showLogin,
        showDashboard,
        switchTab,
        getProfile,
        roleLabel
    };
})();
