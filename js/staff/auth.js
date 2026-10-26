// ============================================================
// Staff Portal — Auth (login, password reset, logout)
// ============================================================
(function () {
    'use strict';

    const Staff = window.Staff;
    if (!Staff || !Staff.client) return;

    const client = Staff.client;
    const ui = Staff.ui;

    function showResetForm(show) {
        document.getElementById('reset-form').hidden = !show;
        document.getElementById('forgot-link').hidden = show;
    }

    function setError(id, message) {
        const el = document.getElementById(id);
        if (message) {
            el.textContent = message;
            el.hidden = false;
        } else {
            el.hidden = true;
        }
    }

    function setBusy(button, busy, label) {
        if (busy) {
            button.dataset.label = label || button.textContent;
            button.disabled = true;
            button.innerHTML = '<span class="spinner"></span> Working…';
        } else {
            button.disabled = false;
            button.textContent = button.dataset.label || button.textContent;
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const submit = document.getElementById('login-submit');

        setError('login-error', null);
        if (!email || !password) {
            setError('login-error', 'Please enter your email and password.');
            return;
        }

        setBusy(submit, true, 'Sign In');
        const { session, error } = await client.signIn(email, password);
        setBusy(submit, false);

        if (error) {
            const friendly = error.message === 'Invalid login credentials'
                ? 'Invalid email or password. Please try again.'
                : error.message;
            setError('login-error', friendly);
            return;
        }
        if (session) {
            await Staff.dashboard.showDashboard();
        }
    }

    async function handleReset(e) {
        e.preventDefault();
        const email = document.getElementById('reset-email').value.trim();
        const btn = document.getElementById('reset-send');
        const msg = document.getElementById('reset-message');

        if (!email) {
            msg.textContent = 'Please enter your email address.';
            msg.hidden = false;
            return;
        }

        setBusy(btn, true, 'Send Reset Link');
        const { error } = await client.resetPassword(email);
        setBusy(btn, false);

        msg.textContent = error
            ? 'Could not send the reset link: ' + error.message
            : 'If that email belongs to a staff account, a password reset link is on its way.';
        msg.hidden = false;
    }

    async function handleLogout() {
        if (client.demoMode) {
            ui.toast('Demo mode — there is no account to sign out of.', 'info');
            return;
        }
        await client.signOut();
        Staff.dashboard.showLogin();
    }

    // ----- init -----
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('forgot-link').addEventListener('click', () => showResetForm(true));
    document.getElementById('back-to-login').addEventListener('click', () => showResetForm(false));
    document.getElementById('reset-form').addEventListener('submit', handleReset);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Listen for auth changes (sign-in from another tab, session expiry).
    client.onAuthChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            Staff.dashboard.showDashboard();
        } else if (event === 'SIGNED_OUT') {
            Staff.dashboard.showLogin();
        }
    });

    Staff.auth = { showResetForm };
})();
