// ============================================================
// Staff Portal — PDF Filler
//
// Loads a blank fillable PDF, reads its AcroForm fields, renders
// a friendly web form, then fills + flattens the PDF and downloads
// it. Nothing is saved anywhere — the staff member emails the
// downloaded PDF to the admin.
// ============================================================
(function () {
    'use strict';

    const Staff = window.Staff;
    if (!Staff || !Staff.client) return;

    const ui = Staff.ui;
    const PDFLib = window.PDFLib;

    let current = null; // { template, pdfDoc, originalBytes, states: [] }

    // ----------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------
    function cleanName(name) {
        return String(name)
            .replace(/\[\d+\]/g, ' ')
            .replace(/[._-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    function labelFor(template, name) {
        const labels = template.field_labels || {};
        if (labels[name]) return labels[name];
        return cleanName(name);
    }

    function b64ToBytes(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

    function findPageForRef(pdfDoc, pageRef) {
        return pdfDoc.getPages().find(p => p.ref.toString() === pageRef.toString()) || null;
    }

    function fileName(template) {
        const date = new Date().toISOString().slice(0, 10);
        const base = String(template.name || 'form').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
        return (base || 'form') + '-' + date + '.pdf';
    }

    // ----------------------------------------------------------
    // Signature pad (canvas + pointer events)
    // ----------------------------------------------------------
    function createSignaturePad() {
        const wrap = document.createElement('div');
        wrap.className = 'signature-wrap';

        const canvas = document.createElement('canvas');
        const tools = document.createElement('div');
        tools.className = 'signature-tools';
        const clearBtn = document.createElement('button');
        clearBtn.className = 'btn btn-ghost';
        clearBtn.textContent = 'Clear';
        tools.appendChild(clearBtn);

        wrap.appendChild(canvas);
        wrap.appendChild(tools);

        const ctx = canvas.getContext('2d');
        let drawing = false;
        let hasInk = false;

        function resize() {
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.max(1, Math.round(rect.width * dpr));
            canvas.height = Math.max(1, Math.round(rect.height * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, rect.width, rect.height);
            ctx.lineWidth = 2.2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#1B365D';
        }

        function pos(e) {
            const r = canvas.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        }

        canvas.addEventListener('pointerdown', (e) => {
            drawing = true;
            hasInk = true;
            canvas.setPointerCapture(e.pointerId);
            const p = pos(e);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
        });

        canvas.addEventListener('pointermove', (e) => {
            if (!drawing) return;
            const p = pos(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
        });

        const stop = () => { drawing = false; };
        canvas.addEventListener('pointerup', stop);
        canvas.addEventListener('pointercancel', stop);
        canvas.addEventListener('pointerleave', stop);

        clearBtn.addEventListener('click', () => {
            hasInk = false;
            resize();
        });

        return {
            el: wrap,
            resize,
            hasInk: () => hasInk,
            dataUrl: () => (hasInk ? canvas.toDataURL('image/png') : null)
        };
    }

    // ----------------------------------------------------------
    // Field state factories. Each state:
    //   el        : DOM node to render
    //   type      : 'text' | 'checkbox' | 'radio' | 'select' |
    //               'list' | 'signature'
    //   label     : display label
    //   required  : bool
    //   isEmpty() : true when a required value is missing
    //   collect() : read the UI into st.value
    //   apply(form): write st.value into the PDF field
    //   (signature) draw(doc) handled separately in buildPdf()
    // ----------------------------------------------------------
    function labelRow(label, required) {
        const row = document.createElement('div');
        row.className = 'ff-field';
        const lbl = document.createElement('label');
        lbl.className = 'ff-label';
        lbl.textContent = label;
        if (required) {
            const req = document.createElement('span');
            req.className = 'req';
            req.textContent = ' *';
            lbl.appendChild(req);
        }
        row.appendChild(lbl);
        return row;
    }

    function makeTextState(field, name, label, required) {
        const wrap = labelRow(label, required);
        const multiline = typeof field.isMultiline === 'function' && field.isMultiline();
        const input = document.createElement(multiline ? 'textarea' : 'input');
        input.className = 'ff-input' + (multiline ? ' ff-textarea' : '');
        if (!multiline) input.type = 'text';
        wrap.appendChild(input);

        const st = {
            el: wrap,
            type: 'text',
            label,
            required,
            isEmpty: () => !input.value.trim(),
            collect: () => { st.value = input.value.trim(); },
            apply: (form) => {
                form.getTextField(name).setText(st.value || '');
            }
        };
        return st;
    }

    function makeCheckState(field, name, label, required) {
        const wrap = document.createElement('div');
        wrap.className = 'ff-field';

        const checkRow = document.createElement('label');
        checkRow.className = 'ff-check';
        const input = document.createElement('input');
        input.type = 'checkbox';
        checkRow.appendChild(input);
        const text = document.createElement('span');
        text.textContent = label;
        checkRow.appendChild(text);
        if (required) {
            const req = document.createElement('span');
            req.className = 'req';
            req.textContent = ' *';
            checkRow.appendChild(req);
        }
        wrap.appendChild(checkRow);

        const st = {
            el: wrap,
            type: 'checkbox',
            label,
            required,
            isEmpty: () => required && !input.checked,
            collect: () => { st.value = input.checked; },
            apply: (form) => {
                const f = form.getCheckBox(name);
                if (st.value) f.check();
                else f.uncheck();
            }
        };
        return st;
    }

    function makeRadioState(field, name, label, required, radioName) {
        const wrap = labelRow(label, required);
        const group = document.createElement('div');
        group.className = 'ff-radio-group';

        let options = [];
        if (typeof field.getOptions === 'function') {
            options = field.getOptions().filter(o => o && o.trim() !== '');
        }
        if (!options.length) options = ['Yes', 'No'];

        options.forEach(opt => {
            const lbl = document.createElement('label');
            lbl.className = 'ff-radio';
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = radioName;
            input.value = opt;
            lbl.appendChild(input);
            const span = document.createElement('span');
            span.textContent = opt;
            lbl.appendChild(span);
            group.appendChild(lbl);
        });
        wrap.appendChild(group);

        const st = {
            el: wrap,
            type: 'radio',
            label,
            required,
            isEmpty: () => !group.querySelector('input:checked'),
            collect: () => {
                const checked = group.querySelector('input:checked');
                st.value = checked ? checked.value : null;
            },
            apply: (form) => {
                if (st.value) form.getRadioGroup(name).select(st.value);
            }
        };
        return st;
    }

    function makeSelectState(field, name, label, required) {
        const wrap = labelRow(label, required);
        const select = document.createElement('select');
        select.className = 'ff-select';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '— Select —';
        select.appendChild(placeholder);

        let options = [];
        if (typeof field.getOptions === 'function') {
            options = field.getOptions().filter(o => o && o.trim() !== '');
        }
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            select.appendChild(option);
        });
        wrap.appendChild(select);

        const st = {
            el: wrap,
            type: 'select',
            label,
            required,
            isEmpty: () => !select.value,
            collect: () => { st.value = select.value || null; },
            apply: (form) => {
                if (st.value) form.getDropdown(name).select(st.value);
            }
        };
        return st;
    }

    function makeListState(field, name, label, required) {
        const wrap = labelRow(label, required);
        const select = document.createElement('select');
        select.className = 'ff-select';
        select.multiple = true;

        let options = [];
        if (typeof field.getOptions === 'function') {
            options = field.getOptions().filter(o => o && o.trim() !== '');
        }
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            select.appendChild(option);
        });
        wrap.appendChild(select);

        const st = {
            el: wrap,
            type: 'list',
            label,
            required,
            isEmpty: () => !select.selectedOptions.length,
            collect: () => {
                st.value = Array.from(select.selectedOptions).map(o => o.value);
            },
            apply: (form) => {
                if (st.value && st.value.length) form.getOptionList(name).select(st.value);
            }
        };
        return st;
    }

    function makeSignatureState(field, name, label, required) {
        const wrap = labelRow(label, required);
        const pad = createSignaturePad();
        wrap.appendChild(pad.el);

        const st = {
            el: wrap,
            type: 'signature',
            label,
            required,
            pad,
            isEmpty: () => required && !pad.hasInk(),
            collect: () => { st.value = pad.dataUrl(); },
            apply: () => { /* handled by draw() in buildPdf */ }
        };
        return st;
    }

    // ----------------------------------------------------------
    // Draw the signed image onto the PDF page that holds the
    // signature widget, then drop the empty widget so flattening
    // doesn't fail on a field with no appearance stream.
    // ----------------------------------------------------------
    async function drawSignatureOn(doc, st) {
        const dataUrl = st.value || st.pad.dataUrl();
        if (!dataUrl) return;
        try {
            const png = await doc.embedPng(b64ToBytes(dataUrl.split(',')[1]));
            const widgets = st.pdfField.acroField.getWidgets();
            if (!widgets.length) return;
            const widget = widgets[0];
            const rect = widget.getRectangle();
            const pageRef = widget.P();
            const page = pageRef ? findPageForRef(doc, pageRef) : null;
            if (!page) return;

            const padX = 3;
            const maxW = Math.max(1, rect.width - padX * 2);
            const maxH = Math.max(1, rect.height - padX * 2);
            const dims = png.scaleToFit(maxW, maxH);
            page.drawImage(png, {
                x: rect.x + padX + (maxW - dims.width) / 2,
                y: rect.y + padX + (maxH - dims.height) / 2,
                width: dims.width,
                height: dims.height
            });
            doc.getForm().removeField(st.pdfField);
        } catch (err) {
            console.warn('Could not draw signature:', err);
        }
    }

    // ----------------------------------------------------------
    // Build the web form from the PDF's fields
    // ----------------------------------------------------------
    function buildFields() {
        const container = document.getElementById('filler-fields');
        container.innerHTML = '';
        current.states = [];

        const form = current.pdfDoc.getForm();
        const fields = form.getFields();
        const pads = [];
        let radioCounter = 0;

        fields.forEach((field) => {
            const name = field.getName();
            if (!name) return;
            if (typeof field.isReadOnly === 'function' && field.isReadOnly()) return;
            if (field instanceof PDFLib.PDFButton) return;

            const label = labelFor(current.template, name);
            const required = typeof field.isRequired === 'function' && field.isRequired();

            let st = null;
            if (field instanceof PDFLib.PDFSignature) {
                st = makeSignatureState(field, name, label, required);
            } else if (field instanceof PDFLib.PDFDropdown) {
                st = makeSelectState(field, name, label, required);
            } else if (field instanceof PDFLib.PDFOptionList) {
                st = makeListState(field, name, label, required);
            } else if (field instanceof PDFLib.PDFCheckBox) {
                st = makeCheckState(field, name, label, required);
            } else if (field instanceof PDFLib.PDFRadioGroup) {
                st = makeRadioState(field, name, label, required, 'ff-radio-' + (++radioCounter));
            } else if (field instanceof PDFLib.PDFTextField) {
                st = makeTextState(field, name, label, required);
            }

            if (!st) return;
            st.pdfField = field;
            current.states.push(st);
            container.appendChild(st.el);
            if (st.type === 'signature') pads.push(st.pad);
        });

        if (!current.states.length) {
            container.innerHTML =
                '<div class="empty-state"><i class="fas fa-info-circle"></i>' +
                'This PDF has no fillable fields that we can read. Try a PDF with real form fields.</div>';
            return;
        }

        // Size the signature canvases now that they're in the DOM.
        pads.forEach(p => p.resize());
    }

    // ----------------------------------------------------------
    // Public API
    // ----------------------------------------------------------
    async function open(template) {
        const filler = document.getElementById('form-filler-view');
        const formsPanel = document.getElementById('view-forms');
        const msg = document.getElementById('filler-message');

        msg.hidden = true;
        document.getElementById('filler-title').textContent = template.name;
        document.getElementById('filler-sub').textContent =
            template.description || 'Fill out the fields below, then download the completed PDF.';
        document.getElementById('filler-fields').innerHTML =
            '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i>Loading form…</div>';

        formsPanel.style.display = 'none';
        filler.hidden = false;

        try {
            const bytes = await Staff.client.fetchBlankPdf(template);
            const pdfDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
            current = { template, pdfDoc, originalBytes: bytes, states: [] };
            buildFields();
        } catch (err) {
            console.error('Failed to load form:', err);
            current = null;
            document.getElementById('filler-fields').innerHTML =
                '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i>' +
                'Could not load this form: ' + ui.esc(err.message) + '</div>';
        }
    }

    function reset() {
        current = null;
        const filler = document.getElementById('form-filler-view');
        const formsPanel = document.getElementById('view-forms');
        if (filler) filler.hidden = true;
        if (formsPanel) formsPanel.style.display = '';
    }

    async function buildPdf() {
        const form = current.pdfDoc.getForm();

        // 1. Read the UI into each state.
        current.states.forEach(st => st.collect());

        // 2. Apply values to the PDF fields.
        current.states.forEach(st => st.apply(form));

        // 3. Draw signatures onto their pages (and drop the widgets).
        for (const st of current.states) {
            if (st.type === 'signature') await drawSignatureOn(current.pdfDoc, st);
        }

        // 4. Flatten so the fields are locked; if any field trips up
        //    flattening, rebuild cleanly from the original bytes
        //    without flattening (values are still embedded).
        try {
            form.flatten();
            return await current.pdfDoc.save();
        } catch (flattenErr) {
            console.warn('Flatten failed — rebuilding without flatten:', flattenErr);
            const fresh = await PDFLib.PDFDocument.load(current.originalBytes, { ignoreEncryption: true });
            const freshForm = fresh.getForm();
            for (const st of current.states) {
                if (st.type === 'signature') {
                    await drawSignatureOn(fresh, st);
                    continue;
                }
                st.apply(freshForm);
            }
            return await fresh.save();
        }
    }

    async function download() {
        if (!current) return;

        const btn = document.getElementById('fill-download');
        const msg = document.getElementById('filler-message');
        const originalHtml = btn.innerHTML;

        // Required-field validation.
        const missing = current.states.filter(st => st.required && st.isEmpty());
        if (missing.length) {
            msg.className = 'form-error';
            msg.textContent = 'Please complete the required field(s): ' +
                missing.map(st => st.label).join(', ') + '.';
            msg.hidden = false;
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Building PDF…';
        msg.hidden = true;

        try {
            const bytes = await buildPdf();
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName(current.template);
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            ui.toast('PDF downloaded.', 'success');
        } catch (err) {
            console.error('Failed to build PDF:', err);
            msg.className = 'form-error';
            msg.textContent = 'Something went wrong building the PDF: ' + err.message;
            msg.hidden = false;
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    // ----- init -----
    document.getElementById('filler-back').addEventListener('click', () => {
        reset();
        Staff.forms.renderForms();
    });
    document.getElementById('fill-download').addEventListener('click', download);

    Staff.pdfFill = { open, reset, download };
})();
