// ============================================================
// Staff Portal — Admin (staff accounts + training progress)
// ============================================================
(function () {
    'use strict';

    const Staff = window.Staff;
    if (!Staff || !Staff.client) return;

    const client = Staff.client;
    const ui = Staff.ui;

    const ROLE_LABELS = { admin: 'Admin', clinician: 'Clinician', peer_support: 'Peer Support' };

    // ---------- staff list ----------
    async function renderStaff() {
        const container = document.getElementById('staff-list');
        container.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i>Loading staff…</div>';

        const { data, error } = await client.listStaff();
        if (error) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i>' +
                'Could not load staff: ' + ui.esc(error.message) + '</div>';
            return;
        }

        if (!data.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-user-friends"></i>' +
                'No staff yet. Click <strong>Add Staff</strong> to create the first account.</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'staff-table';
        table.innerHTML = '<thead><tr>' +
            '<th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th></th>' +
            '</tr></thead>';
        const tbody = document.createElement('tbody');

        const me = Staff.dashboard.getProfile();

        data.forEach(person => {
            const tr = document.createElement('tr');

            const nameTd = document.createElement('td');
            nameTd.innerHTML = ui.esc(person.full_name || '—') +
                (person.id === me.id ? ' <small>(you)</small>' : '');
            tr.appendChild(nameTd);

            const emailTd = document.createElement('td');
            emailTd.textContent = person.email || '';
            tr.appendChild(emailTd);

            const roleTd = document.createElement('td');
            const select = document.createElement('select');
            select.className = 'role-select';
            Object.keys(ROLE_LABELS).forEach(role => {
                const opt = document.createElement('option');
                opt.value = role;
                opt.textContent = ROLE_LABELS[role];
                if (person.role === role) opt.selected = true;
                select.appendChild(opt);
            });
            select.addEventListener('change', () => changeRole(person, select.value, select));
            roleTd.appendChild(select);
            tr.appendChild(roleTd);

            const joinedTd = document.createElement('td');
            joinedTd.textContent = person.created_at
                ? new Date(person.created_at).toLocaleDateString()
                : '';
            tr.appendChild(joinedTd);

            const actionTd = document.createElement('td');
            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn btn-ghost';
            copyBtn.innerHTML = '<i class="fas fa-envelope"></i>';
            copyBtn.title = 'Copy email address';
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(person.email || '').then(
                    () => ui.toast('Email copied.', 'success'),
                    () => ui.toast('Could not copy.', 'error')
                );
            });
            actionTd.appendChild(copyBtn);
            tr.appendChild(actionTd);

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        container.innerHTML = '';
        container.appendChild(table);
    }

    async function changeRole(person, role, select) {
        const isMe = person.id === Staff.dashboard.getProfile().id;
        if (isMe && role !== 'admin' && !window.confirm(
            'You are changing your own role away from Admin. You may lose access to this page. Continue?'
        )) {
            select.value = person.role;
            return;
        }

        const { error } = await client.updateRole(person.id, role);
        if (error) {
            ui.toast('Could not change role: ' + error.message, 'error');
            select.value = person.role;
            return;
        }
        ui.toast(person.full_name + ' is now ' + ROLE_LABELS[role] + '.', 'success');
    }

    // ---------- create staff ----------
    function openCreateModal() {
        document.getElementById('staff-name').value = '';
        document.getElementById('staff-email').value = '';
        document.getElementById('staff-role').value = 'clinician';
        document.getElementById('staff-error').hidden = true;
        ui.openModal('staff-modal');
    }

    async function submitCreate() {
        const name = document.getElementById('staff-name').value.trim();
        const email = document.getElementById('staff-email').value.trim();
        const role = document.getElementById('staff-role').value;
        const errorEl = document.getElementById('staff-error');
        const saveBtn = document.getElementById('staff-save');

        errorEl.hidden = true;
        if (!name || !email) {
            errorEl.textContent = 'Please enter a full name and email address.';
            errorEl.hidden = false;
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errorEl.textContent = 'Please enter a valid email address.';
            errorEl.hidden = false;
            return;
        }

        const original = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span> Creating…';

        const { data, error } = await client.createStaff(name, email, role);

        saveBtn.disabled = false;
        saveBtn.innerHTML = original;

        if (error) {
            errorEl.textContent = error.message || 'Could not create the account.';
            errorEl.hidden = false;
            return;
        }

        ui.closeModal('staff-modal');
        if (data && data.temporaryPassword) {
            showResult(data.temporaryPassword, data.user && data.user.email);
        } else {
            ui.toast('Staff account created.', 'success');
        }
        renderStaff();
    }

    function showResult(password, email) {
        document.getElementById('result-password').textContent = password;
        document.getElementById('result-email').textContent =
            'Account email: ' + (email || '') + ' — this password is shown only once.';
        document.getElementById('result-copy').onclick = () => {
            navigator.clipboard.writeText(password).then(
                () => ui.toast('Temporary password copied.', 'success'),
                () => ui.toast('Could not copy.', 'error')
            );
        };
        ui.openModal('result-modal');
    }

    // ---------- training progress ----------
    async function renderProgress() {
        const container = document.getElementById('progress-table');
        const summary = await client.getTrainingSummary();

        if (summary.error) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i>' +
                'Could not load progress: ' + ui.esc(summary.error.message) + '</div>';
            return;
        }

        const { staff, progress, videos } = summary;
        const videoById = {};
        videos.forEach(v => { videoById[v.id] = v; });

        if (!videos.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-video"></i>' +
                'No training videos yet. This table will show how far each staff member has gotten once ' +
                'training videos are added.</div>';
            return;
        }

        if (!staff.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-user-friends"></i>No staff to track.</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'staff-table';
        table.innerHTML = '<thead><tr>' +
            '<th>Staff</th><th>Role</th><th>Progress</th><th>Completed</th><th>In Progress</th><th>Last Activity</th>' +
            '</tr></thead>';
        const tbody = document.createElement('tbody');

        const byUser = {};
        progress.forEach(p => {
            (byUser[p.user_id] = byUser[p.user_id] || []).push(p);
        });

        staff.forEach(person => {
            const rows = byUser[person.id] || [];
            const completed = rows.filter(r => r.status === 'completed').length;
            const inProgress = rows.filter(r => r.status === 'in_progress').length;
            const last = rows
                .map(r => r.updated_at)
                .filter(Boolean)
                .sort()
                .pop();

            const pct = Math.round((completed / videos.length) * 100);

            const tr = document.createElement('tr');

            const nameTd = document.createElement('td');
            nameTd.innerHTML = ui.esc(person.full_name || '—');
            tr.appendChild(nameTd);

            const roleTd = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = 'role-badge ' + person.role;
            badge.textContent = ROLE_LABELS[person.role] || person.role;
            roleTd.appendChild(badge);
            tr.appendChild(roleTd);

            const progTd = document.createElement('td');
            const barWrap = document.createElement('div');
            barWrap.className = 'progress-bar-wrap';
            const bar = document.createElement('div');
            bar.className = 'progress-bar';
            const fill = document.createElement('div');
            fill.style.width = pct + '%';
            bar.appendChild(fill);
            barWrap.appendChild(bar);
            const pctSpan = document.createElement('span');
            pctSpan.className = 'progress-pct';
            pctSpan.textContent = pct + '%';
            barWrap.appendChild(pctSpan);
            progTd.appendChild(barWrap);
            tr.appendChild(progTd);

            const doneTd = document.createElement('td');
            doneTd.textContent = completed + ' / ' + videos.length;
            tr.appendChild(doneTd);

            const inpTd = document.createElement('td');
            inpTd.textContent = inProgress;
            tr.appendChild(inpTd);

            const lastTd = document.createElement('td');
            lastTd.textContent = last ? new Date(last).toLocaleDateString() : '—';
            tr.appendChild(lastTd);

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        container.innerHTML = '';
        container.appendChild(table);
    }

    // ---------- render ----------
    async function render() {
        if (client.demoMode) {
            document.getElementById('staff-list').innerHTML =
                '<div class="empty-state"><i class="fas fa-lock"></i>' +
                'Admin features are disabled in demo mode. Add your Supabase keys ' +
                '(see SUPABASE_SETUP.md) to manage staff accounts and view training progress.</div>';
            document.getElementById('progress-table').innerHTML = '';
            return;
        }
        await renderStaff();
        await renderProgress();
    }

    // ----- init -----
    document.getElementById('staff-create-btn').addEventListener('click', openCreateModal);
    document.getElementById('staff-cancel').addEventListener('click', () => ui.closeModal('staff-modal'));
    document.getElementById('staff-save').addEventListener('click', submitCreate);
    document.getElementById('result-close').addEventListener('click', () => ui.closeModal('result-modal'));

    Staff.admin = { render };
})();
