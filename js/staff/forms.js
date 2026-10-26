// ============================================================
// Staff Portal — Forms (list, upload, delete, open filler)
// ============================================================
(function () {
    'use strict';

    const Staff = window.Staff;
    if (!Staff || !Staff.client) return;

    const client = Staff.client;
    const ui = Staff.ui;

    let templates = [];
    let canFill = false;
    let isAdmin = false;

    function setPermission(fill, admin) {
        canFill = fill;
        isAdmin = admin;
    }

    function exitFiller() {
        Staff.pdfFill.reset();
    }

    async function renderForms() {
        const container = document.getElementById('forms-list');
        container.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i>Loading forms…</div>';

        let error = null;
        if (client.demoMode) {
            templates = client.demo;
        } else {
            const res = await client.listForms();
            templates = res.data || [];
            error = res.error;
        }

        if (error) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i>' +
                'Could not load forms: ' + ui.esc(error.message) + '</div>';
            return;
        }

        if (!templates.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i>' +
                'No forms yet.' + (isAdmin ? ' Click <strong>Add Form</strong> to upload the first one.' : '') +
                '</div>';
            return;
        }

        container.innerHTML = '';
        templates.forEach(t => container.appendChild(card(t)));
    }

    function card(t) {
        const el = document.createElement('div');
        el.className = 'form-card';

        const icon = document.createElement('div');
        icon.className = 'card-icon';
        icon.innerHTML = '<i class="fas fa-file-pdf"></i>';
        el.appendChild(icon);

        const h3 = document.createElement('h3');
        h3.textContent = t.name;
        el.appendChild(h3);

        if (t.description) {
            const p = document.createElement('p');
            p.className = 'card-desc';
            p.textContent = t.description;
            el.appendChild(p);
        }

        const actions = document.createElement('div');
        actions.className = 'card-actions';

        if (canFill) {
            const fillBtn = document.createElement('button');
            fillBtn.className = 'btn btn-primary';
            fillBtn.innerHTML = '<i class="fas fa-pen"></i> Fill Out';
            fillBtn.addEventListener('click', () => Staff.pdfFill.open(t));
            actions.appendChild(fillBtn);
        } else {
            const note = document.createElement('div');
            note.className = 'lock-note';
            note.innerHTML = '<i class="fas fa-lock"></i> Only Clinician and Admin roles can fill out forms.';
            actions.appendChild(note);
        }

        if (isAdmin && !client.demoMode) {
            const delBtn = document.createElement('button');
            delBtn.className = 'btn btn-danger';
            delBtn.innerHTML = '<i class="fas fa-trash"></i>';
            delBtn.title = 'Delete this form';
            delBtn.addEventListener('click', () => deleteTemplate(t));
            actions.appendChild(delBtn);
        }

        el.appendChild(actions);
        return el;
    }

    async function deleteTemplate(t) {
        if (!window.confirm('Delete "' + t.name + '"? This removes the form and its PDF.')) return;
        const { error } = await client.deleteTemplate(t.id, t.storage_path);
        if (error) {
            ui.toast('Could not delete the form: ' + error.message, 'error');
        } else {
            ui.toast('Form deleted.', 'success');
            renderForms();
        }
    }

    // ---------- upload form (admin) ----------
    function openUploadModal() {
        document.getElementById('upload-name').value = '';
        document.getElementById('upload-desc').value = '';
        document.getElementById('upload-file').value = '';
        document.getElementById('upload-labels').value = '';
        document.getElementById('upload-error').hidden = true;
        ui.openModal('upload-modal');
    }

    async function submitUpload() {
        const name = document.getElementById('upload-name').value.trim();
        const desc = document.getElementById('upload-desc').value.trim();
        const file = document.getElementById('upload-file').files[0];
        const labelsRaw = document.getElementById('upload-labels').value.trim();
        const errorEl = document.getElementById('upload-error');
        const saveBtn = document.getElementById('upload-save');

        errorEl.hidden = true;
        if (!name || !file) {
            errorEl.textContent = 'Please enter a form name and choose a PDF file.';
            errorEl.hidden = false;
            return;
        }
        if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            errorEl.textContent = 'Please choose a PDF file.';
            errorEl.hidden = false;
            return;
        }

        let labels = {};
        if (labelsRaw) {
            try {
                labels = JSON.parse(labelsRaw);
            } catch (err) {
                errorEl.textContent = 'Field labels must be valid JSON. ' + err.message;
                errorEl.hidden = false;
                return;
            }
        }

        const original = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span> Uploading…';

        const { error } = await client.uploadTemplate(name, desc, file, labels);

        saveBtn.disabled = false;
        saveBtn.innerHTML = original;

        if (error) {
            errorEl.textContent = 'Upload failed: ' + error.message;
            errorEl.hidden = false;
            return;
        }

        ui.closeModal('upload-modal');
        ui.toast('Form uploaded. It now appears for Clinicians and Admins.', 'success');
        renderForms();
    }

    // ----- init -----
    document.getElementById('upload-form-btn').addEventListener('click', openUploadModal);
    document.getElementById('upload-cancel').addEventListener('click', () => ui.closeModal('upload-modal'));
    document.getElementById('upload-save').addEventListener('click', submitUpload);

    Staff.forms = {
        setPermission,
        renderForms,
        exitFiller
    };
})();
