// ============================================================
// Staff Portal — Bootstrap + shared UI helpers
// ============================================================
(function () {
    'use strict';

    const Staff = window.Staff;
    if (!Staff || !Staff.client) return;

    // ---------- helpers ----------
    function esc(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function toast(message, type) {
        const container = document.getElementById('toast-container');
        const el = document.createElement('div');
        el.className = 'toast ' + (type || 'info');
        el.textContent = message;
        container.appendChild(el);

        requestAnimationFrame(() => el.classList.add('show'));
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 350);
        }, 4000);
    }

    function openModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.hidden = false;
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.hidden = true;
    }

    // Close modals when clicking the backdrop or pressing Escape.
    document.addEventListener('click', (e) => {
        if (e.target.classList && e.target.classList.contains('modal-backdrop')) {
            e.target.hidden = true;
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-backdrop').forEach(m => { m.hidden = true; });
        }
    });

    Staff.ui = { esc, toast, openModal, closeModal };

    // ---------- boot ----------
    async function boot() {
        if (Staff.client.demoMode) {
            // No Supabase keys yet — jump straight into the demo dashboard.
            Staff.dashboard.showDashboard();
            return;
        }

        // Missing config? Explain rather than silently fail.
        if (!StaffConfig.supabaseUrl || StaffConfig.supabaseUrl.indexOf('YOUR-PROJECT') !== -1) {
            document.getElementById('demo-banner').hidden = false;
            document.getElementById('demo-banner').innerHTML =
                '<i class="fas fa-wrench"></i> Supabase isn\'t configured yet. ' +
                'Open <code>js/staff/config.js</code> and add your project URL and anon key ' +
                '(see SUPABASE_SETUP.md).';
            return;
        }

        const { data: { session } } = await Staff.client.getSession();
        if (session) {
            Staff.dashboard.showDashboard();
        } else {
            Staff.dashboard.showLogin();
        }
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
