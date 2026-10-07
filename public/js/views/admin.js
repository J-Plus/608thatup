import { api } from '../api.js';
import { getState } from '../state.js';
import { renderNavbar, bindNavbar } from '../components/navbar.js';
import { escapeHtml } from '../util/escape.js';

function cohortSelect(cohorts, current, userId) {
  return `
    <select class="cohort-select" data-user-id="${userId}">
      <option value="">—</option>
      ${cohorts.map(c => `<option value="${escapeHtml(c)}" ${c === current ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
    </select>
  `;
}

// View state that survives re-renders after archive actions.
let showArchived = false;
let cohortPanelOpen = false;

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
          <label style="display:inline-flex; align-items:center; gap:0.4rem; font-size:0.85rem; cursor:pointer; color:var(--text-secondary);">
            <input type="checkbox" id="show-archived-cb" ${showArchived ? 'checked' : ''} style="cursor:pointer;">
            Show archived
          </label>
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
    window.location = `/api/admin/export-csv${showArchived ? '?archived=1' : ''}`;
  });

  document.getElementById('show-archived-cb')?.addEventListener('change', (e) => {
    showArchived = e.target.checked;
    adminView();
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
      cohortPanelOpen = false;
      return;
    }
    cohortPanelOpen = true;
    loadCohortPanel(panel);
  });

  async function loadCohortPanel(panel) {
    try {
      renderCohortPanel(panel, await api.getCohortsManage());
    } catch (err) {
      panel.innerHTML = '<p class="text-muted">Failed to load cohorts</p>';
    }
  }

  function cohortTag(c) {
    const muted = c.archived ? 'opacity:0.55;' : '';
    const linkBtn = 'background:none; border:none; cursor:pointer; font-size:0.75rem; text-decoration:underline; padding:0; color:var(--card-text-secondary);';
    return `
      <span class="cohort-tag" style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; ${muted}">
        ${escapeHtml(c.name)} <span style="font-size:0.75rem; color:var(--card-text-secondary);">${c.studentCount}</span>
        <button class="archive-cohort-btn" data-name="${escapeHtml(c.name)}" data-archived="${c.archived ? '1' : '0'}" style="${linkBtn}">${c.archived ? 'unarchive' : 'archive'}</button>
        ${c.studentCount === 0 ? `<button class="delete-cohort-btn" data-name="${escapeHtml(c.name)}" title="Remove empty cohort" style="background:none; border:none; cursor:pointer; color:var(--error); font-size:1rem; line-height:1; padding:0;">&times;</button>` : ''}
      </span>
    `;
  }

  function renderCohortPanel(panel, list) {
    const active = list.filter(c => !c.archived);
    const archived = list.filter(c => c.archived);
    panel.innerHTML = `
      <div class="glass" style="padding:1.25rem; margin-bottom:1.5rem;">
        <h3 style="margin:0 0 0.75rem; font-family:var(--font-heading); font-weight:600; color:var(--card-text);">Manage Cohorts</h3>
        <div style="display:flex; gap:0.5rem; margin-bottom:0.75rem;">
          <input type="text" id="new-cohort-input" placeholder="e.g. NYC13" style="flex:1; padding:0.4rem 0.75rem; border:1px solid rgba(0,0,0,0.15); border-radius:8px; font-size:0.875rem; color:var(--card-text);">
          <button id="add-cohort-btn" class="btn btn--primary" style="font-size:0.85rem;">Add</button>
        </div>
        <div id="cohort-list" style="display:flex; flex-wrap:wrap; gap:0.4rem;">
          ${active.map(cohortTag).join('')}
          ${active.length === 0 ? '<span style="color:var(--card-text-secondary); font-size:0.85rem;">No active cohorts</span>' : ''}
        </div>
        ${archived.length > 0 ? `
          <p style="margin:1rem 0 0.4rem; font-size:0.8rem; color:var(--card-text-secondary);">Archived (hidden from lists, stats and CSV; history kept)</p>
          <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">${archived.map(cohortTag).join('')}</div>
        ` : ''}
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
        await loadCohortPanel(panel);
        updateAllSelects();
      } catch (err) {
        alert(err.message || 'Failed to add cohort');
      }
    });

    panel.querySelectorAll('.archive-cohort-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        const archiving = btn.dataset.archived !== '1';
        const msg = archiving
          ? `Archive cohort "${name}"? It and all its students will be hidden from the student list, stats and CSV. Nothing is deleted and you can unarchive later.`
          : `Unarchive cohort "${name}" and all its students?`;
        if (!confirm(msg)) return;
        try {
          await api.archiveCohort(name, archiving);
          adminView();
        } catch (err) {
          alert(err.message || 'Failed to update cohort');
        }
      });
    });

    panel.querySelectorAll('.delete-cohort-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        if (!confirm(`Remove empty cohort "${name}"?`)) return;
        try {
          await api.deleteCohort(name);
          cohorts = cohorts.filter(c => c !== name);
          await loadCohortPanel(panel);
          updateAllSelects();
        } catch (err) {
          alert('Failed to remove cohort');
        }
      });
    });
  }

  if (cohortPanelOpen && isSuperAdmin) loadCohortPanel(document.getElementById('cohort-panel'));

  function updateAllSelects() {
    document.querySelectorAll('.cohort-select').forEach(sel => {
      const userId = sel.dataset.userId;
      const current = sel.value;
      sel.innerHTML = `<option value="">—</option>${cohorts.map(c => `<option value="${escapeHtml(c)}" ${c === current ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}`;
    });
  }

  try {
    const [overview, allStudents] = await Promise.all([
      api.getOverview(),
      api.getStudents(),
    ]);
    const students = showArchived ? allStudents : allStudents.filter(s => !s.archived);

    const container = app.querySelector('.container');
    container.querySelector('.spinner').remove();

    // Cohort filter chips
    const allCohorts = [...new Set(students.map(s => s.cohort).filter(Boolean))].sort();
    let activeCohort = null;
    let sortMode = 'name';

    const nullsLast = (a, b, cmp) => {
      const aNull = a === null || a === undefined || a === '';
      const bNull = b === null || b === undefined || b === '';
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      return cmp(a, b);
    };

    const sortFns = {
      name:       (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      cohort:     (a, b) => nullsLast(a.cohort, b.cohort, (x, y) => x.localeCompare(y, undefined, { sensitivity: 'base' })),
      rounds:     (a, b) => b.totalRounds - a.totalRounds,
      avgScore:   (a, b) => b.avgScore - a.avgScore,
      lastActive: (a, b) => nullsLast(a.last_login, b.last_login, (x, y) => y > x ? 1 : -1),
      lastTest:   (a, b) => nullsLast(a.lastTestDate, b.lastTestDate, (x, y) => y > x ? 1 : -1),
    };

    const sortHeader = (key, label, align = 'left') => {
      const isActive = key === sortMode;
      const arrow = isActive ? ' <span style="font-size:0.7em;">▾</span>' : '';
      return `<th data-sort="${key}" style="text-align:${align};cursor:pointer;user-select:none;">${label}${arrow}</th>`;
    };

    function fmtDateTime(iso) {
      if (!iso) return '—';
      // SQLite stores datetimes as UTC strings without a Z suffix; append one
      // so JS parses them as UTC, not local time, before formatting in the
      // viewer's locale.
      const withZ = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
      return new Date(withZ).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    }

    function buildRows(list) {
      const colCount = isSuperAdmin ? 6 : 5;
      if (list.length === 0) return `<tr><td colspan="${colCount}" style="text-align:center;color:var(--card-text-secondary);padding:2rem;">No students in this cohort</td></tr>`;
      return list.map(s => `
        <tr class="clickable" data-student-id="${s.id}"${s.archived ? ' style="opacity:0.55;"' : ''}>
          <td>
            <div class="student-cell">
              ${s.avatar_url ? `<img src="${escapeHtml(s.avatar_url)}" alt="" class="student-avatar" onerror="this.style.display='none'">` : ''}
              <span>${escapeHtml(s.name)}</span>
              ${s.archived ? '<span class="history-tag" style="margin-left:0.4rem;">archived</span>' : ''}
            </div>
          </td>
          ${isSuperAdmin ? `<td class="cohort-cell" data-user-id="${s.id}">${cohortSelect(cohorts, s.cohort || '', s.id)}</td>` : ''}
          <td>${s.totalRounds}</td>
          <td>${s.avgScore}/${overview.quizLength}</td>
          <td>${fmtDateTime(s.last_login)}</td>
          <td>${fmtDateTime(s.lastTestDate)}</td>
        </tr>
      `).join('');
    }

    function buildChips() {
      const chips = ['All', 'None', ...allCohorts].map(c => {
        const isActive = (c === 'All' && !activeCohort) || c === activeCohort;
        const count = c === 'All'
          ? null
          : c === 'None'
            ? students.filter(s => !s.cohort).length
            : students.filter(s => s.cohort === c).length;
        return `<button class="cohort-chip ${isActive ? 'cohort-chip--active' : ''}" data-cohort="${escapeHtml(c)}">${escapeHtml(c)}${count !== null ? ` <span class="cohort-chip__count">${count}</span>` : ''}</button>`;
      }).join('');
      return `<div class="cohort-chips" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem;">${chips}</div>`;
    }

    function renderTable() {
      const filtered = activeCohort === 'None'
        ? students.filter(s => !s.cohort)
        : activeCohort
          ? students.filter(s => s.cohort === activeCohort)
          : students;
      const sorted = [...filtered].sort(sortFns[sortMode]);
      const tableWrap = container.querySelector('#student-table-wrap');
      tableWrap.innerHTML = students.length === 0
        ? `<p class="text-muted text-center mt-xl">${allStudents.length > 0 ? 'All students are archived. Tick "Show archived" to see them.' : 'No students yet'}</p>`
        : `
          ${buildChips()}
          <div class="glass" style="overflow-x:auto;">
            <table class="admin-table">
              <thead>
                <tr>
                  ${sortHeader('name', 'Student')}
                  ${isSuperAdmin ? sortHeader('cohort', 'Cohort') : ''}
                  ${sortHeader('rounds', 'Rounds')}
                  ${sortHeader('avgScore', 'Avg Score')}
                  ${sortHeader('lastActive', 'Last Active')}
                  ${sortHeader('lastTest', 'Last Test')}
                </tr>
              </thead>
              <tbody>${buildRows(sorted)}</tbody>
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

      // Sort header clicks
      tableWrap.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
          sortMode = th.dataset.sort;
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
