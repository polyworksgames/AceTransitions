// ============================================================
// Staff Portal — Training (placeholder)
//
// The training video library and per-user progress tracking are
// coming later. The schema (training_videos, training_progress)
// is already in place, and the admin progress table lives in the
// Admin tab. This section just shows a friendly placeholder.
// ============================================================
(function () {
    'use strict';

    const Staff = window.Staff;
    if (!Staff || !Staff.client) return;

    const ui = Staff.ui;

    function render() {
        const container = document.getElementById('training-content');
        container.innerHTML =
            '<div class="panel-toolbar"><h2>Training</h2></div>' +
            '<div class="empty-state"><i class="fas fa-video"></i>' +
            '<strong>Training videos are coming soon.</strong><br>' +
            'Once they are added, you\'ll be able to watch them here and your progress will be ' +
            'tracked automatically so your admin can see how far you\'ve gotten.' +
            '</div>';
    }

    Staff.training = { render };
})();
