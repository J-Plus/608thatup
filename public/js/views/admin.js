import { api } from '../api.js';
import { getState } from '../state.js';
import { renderNavbar, bindNavbar } from '../components/navbar.js';

function cohortSelect(cohorts, current, userId) {
  return `
    <select class="cohort-select" data-user-id="${userId}">
      <option value="">—</option>
      ${cohorts.map(c => `<option value="${c}" ${c === current ? 'selected' : ''}>${c}</option>`).join('')}
    </select>
  `;
}

export async function adminView() {
  const app = document.getElementById('app');
  const { user } = getState();
  const isSuperAdmin = !user.cohort;

  app.innerHTML = `
    ${renderNavbar()}
    <div class="container page">
      <div class="page-header">
        <h1 class="page-title">Admin Dashboard</h1>
        <p class="page-subtitle">Student performance overview${user.cohort ? ` — Cohort ${user.cohort}` : ''}</p>
        <div style="display:flex; gap:0.5rem; margin-top:1rem; flex-wrap:wrap; align-items:center;">
          <button id="export-csv-btn" class="btn btn--primary">Download Scores CSV</button>
          ${isSuperAdmin ? '<button id="manage-cohorts-btn" class="btn btn--ghost">Manage Cohorts</button>' : ''}
        </div>
        ${isSuperAdmin ? `
        <label id="show-answers-toggle" style="display:inline-flex; align-items:center; gap:0.5rem; margin-top:1rem; font-size:0.85rem; cursor:pointer; color:var(--text-secondary);">
          <input type="checkbox" id="show-answers-cb" style="cursor:pointer;">
          Show correct answers (* prefix) for testing
        </label>
        ` : ''}
      </div>
      <div id="cohort-panel"></div>
      <div class="spinner"></div>
    </div>
  `;
  bindNavbar();

  document.getElementById('export-csv-btn')?.addEventListener('click', () => {
    window.location = '/api/admin/export-csv';
  });

  // Show answers toggle (super-admin only)
  if (isSuperAdmin) {
    try {
      const settings = await api.getSettings();
      const cb = document.getElementById('show-answers-cb');
      if (cb) {
        cb.checked = settings.show_answers === '1';
        cb.addEventListener('change', async () => {
          await api.setSetting('show_answers', cb.checked ? '1' : '0');
        });
      }
    } catch (e) { /* ignore */ }
  }

  // Cohort management panel (super-admin only)
  let cohorts = [];
  if (isSuperAdmin) {
    try {
      cohorts = await api.getCohorts();
    } catch (e) {
      cohorts = [];
    }
  }

  // Bind manage button after cohorts load but before the try block
  document.getElementById('manage-cohorts-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('cohort-panel');
    if (panel.children.length > 0) {
      panel.innerHTML = '';
      return;
    }
    renderCohortPanel(panel, cohorts);
  });

  function renderCohortPanel(panel, list) {
    panel.innerHTML = `
      <div class="glass" style="padding:1.25rem; margin-bottom:1.5rem;">
        <h3 style="margin:0 0 0.75rem; font-family:var(--font-heading); font-weight:600; color:var(--card-text);">Manage Cohorts</h3>
        <div style="display:flex; gap:0.5rem; margin-bottom:0.75rem;">
          <input type="text" id="new-cohort-input" placeholder="e.g. NYC13" style="flex:1; padding:0.4rem 0.75rem; border:1px solid rgba(0,0,0,0.15); border-radius:8px; font-size:0.875rem; color:var(--card-text);">
          <button id="add-cohort-btn" class="btn btn--primary" style="font-size:0.85rem;">Add</button>
        </div>
        <div id="cohort-list" style="display:flex; flex-wrap:wrap; gap:0.4rem;">
          ${list.map(c => `
            <span class="cohort-tag" style="display:inline-flex; align-items:center; gap:4px; padding:4px 10px;">
              ${c}
              <button class="delete-cohort-btn" data-name="${c}" style="background:none; border:none; cursor:pointer; color:var(--error); font-size:1rem; line-height:1; padding:0;">&times;</button>
            </span>
          `).join('')}
          ${list.length === 0 ? '<span style="color:var(--card-text-secondary); font-size:0.85rem;">No cohorts yet</span>' : ''}
        </div>
      </div>
    `;

    document.getElementById('add-cohort-btn').addEventListener('click', async () => {
      const input = document.getElementById('new-cohort-input');
      const name = input.value.trim();
      if (!name) return;
      try {
        await api.createCohort(name);
        cohorts.push(name);
        cohorts.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        renderCohortPanel(panel, cohorts);
        updateAllSelects();
      } catch (err) {
        alert(err.message || 'Failed to add cohort');
      }
    });

    panel.querySelectorAll('.delete-cohort-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        if (!confirm(`Remove cohort "${name}"? Students assigned to it will keep their tag.`)) return;
        try {
          await api.deleteCohort(name);
          cohorts = cohorts.filter(c => c !== name);
          renderCohortPanel(panel, cohorts);
          updateAllSelects();
        } catch (err) {
          alert('Failed to remove cohort');
        }
      });
    });
  }

  function updateAllSelects() {
    document.querySelectorAll('.cohort-select').forEach(sel => {
      const userId = sel.dataset.userId;
      const current = sel.value;
      sel.innerHTML = `<option value="">—</option>${cohorts.map(c => `<option value="${c}" ${c === current ? 'selected' : ''}>${c}</option>`).join('')}`;
    });
  }

  try {
    const [overview, students] = await Promise.all([
      api.getOverview(),
      api.getStudents(),
    ]);

    const container = app.querySelector('.container');
    container.querySelector('.spinner').remove();

    // Cohort filter chips
    const allCohorts = [...new Set(students.map(s => s.cohort).filter(Boolean))].sort();
    let activeCohort = null;

    function buildRows(list) {
      if (list.length === 0) return '<tr><td colspan="6" style="text-align:center;color:var(--card-text-secondary);padding:2rem;">No students in this cohort</td></tr>';
      return list.map(s => `
        <tr class="clickable" data-student-id="${s.id}">
          <td>
            <div class="student-cell">
              ${s.avatar_url ? `<img src="${s.avatar_url}" alt="" class="student-avatar" onerror="this.style.display='none'">` : ''}
              <span>${s.name}</span>
            </div>
          </td>
          ${isSuperAdmin ? `<td class="cohort-cell" data-user-id="${s.id}">${cohortSelect(cohorts, s.cohort || '', s.id)}</td>` : ''}
          <td>${s.totalRounds}</td>
          <td>${s.totalPerfects}</td>
          <td>${s.avgScore}/${overview.quizLength}</td>
          <td>${new Date(s.last_login).toLocaleDateString()}</td>
        </tr>
      `).join('');
    }

    function buildChips() {
      const chips = ['All', ...allCohorts].map(c => {
        const isActive = (c === 'All' && !activeCohort) || c === activeCohort;
        return `<button class="cohort-chip ${isActive ? 'cohort-chip--active' : ''}" data-cohort="${c}">${c}${c !== 'All' ? ` <span class="cohort-chip__count">${students.filter(s => s.cohort === c).length}</span>` : ''}</button>`;
      }).join('');
      return `<div class="cohort-chips" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem;">${chips}</div>`;
    }

    function renderTable() {
      const filtered = activeCohort ? students.filter(s => s.cohort === activeCohort) : students;
      const tableWrap = container.querySelector('#student-table-wrap');
      tableWrap.innerHTML = students.length === 0
        ? '<p class="text-muted text-center mt-xl">No students yet</p>'
        : `
          ${buildChips()}
          <div class="glass" style="overflow-x:auto;">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Student</th>
                  ${isSuperAdmin ? '<th>Cohort</th>' : ''}
                  <th>Rounds</th>
                  <th>Perfect</th>
                  <th>Avg Score</th>
                  <th>Last Active</th>
                </tr>
              </thead>
              <tbody>${buildRows(filtered)}</tbody>
            </table>
          </div>
        `;

      // Chip clicks
      tableWrap.querySelectorAll('.cohort-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          activeCohort = chip.dataset.cohort === 'All' ? null : chip.dataset.cohort;
          renderTable();
          bindTableEvents();
        });
      });

      bindTableEvents();
    }

    function bindTableEvents() {
      // Row click → student detail
      container.querySelectorAll('.clickable').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('.cohort-cell')) return;
          window.location.hash = `#/admin/${row.dataset.studentId}`;
        });
      });
      // Cohort dropdown
      if (isSuperAdmin) {
        container.querySelectorAll('.cohort-select').forEach(sel => {
          sel.addEventListener('change', async (e) => {
            e.stopPropagation();
            try {
              await api.setCohort(sel.dataset.userId, sel.value);
              // Update local data so filter stays accurate
              const student = students.find(s => s.id == sel.dataset.userId);
              if (student) student.cohort = sel.value;
            } catch (err) {
              alert('Failed to set cohort');
            }
          });
          sel.addEventListener('click', (e) => e.stopPropagation());
        });
      }
    }

    container.insertAdjacentHTML('beforeend', '<div id="student-table-wrap"></div>');
    renderTable();
  } catch (e) {
    app.querySelector('.spinner').outerHTML = `<p class="text-muted text-center">Failed to load admin data</p>`;
  }
}
