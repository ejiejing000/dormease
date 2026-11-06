// Shared renderer for the management pages: one config per page, no per-page SQL knowledge.
function renderCell(row, column) {
  const value = row[column.key];
  if (column.format === 'money') return formatMoney(value);
  if (column.format === 'date') return formatDate(value);
  if (column.format === 'bool') return value ? 'yes' : 'no';
  if (column.format === 'badge') return `<span class="badge ${escapeHtml(value || 'none')}">${escapeHtml(value ?? '-')}</span>`;
  if (column.render) return column.render(row);
  return escapeHtml(value === null || value === undefined ? '-' : value);
}

function fieldInput(field) {
  const required = field.required ? ' required' : '';
  if (field.type === 'select') {
    const options = (field.options || []).map(o => {
      const value = Array.isArray(o) ? o[0] : o;
      const label = Array.isArray(o) ? o[1] : o;
      const selected = String(value) === String(field.value ?? '') ? ' selected' : '';
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
    }).join('');
    return `<label>${escapeHtml(field.label)}<select name="${field.name}"${required}>${options}</select></label>`;
  }
  if (field.type === 'textarea') {
    return `<label>${escapeHtml(field.label)}<textarea name="${field.name}" rows="3"${required}></textarea></label>`;
  }
  if (field.type === 'checkbox') {
    return `<label class="check"><input type="checkbox" name="${field.name}" value="true">${escapeHtml(field.label)}</label>`;
  }
  return `<label>${escapeHtml(field.label)}<input type="${field.type || 'text'}" name="${field.name}"${required}${field.step ? ` step="${field.step}"` : ''}${field.value ? ` value="${escapeHtml(field.value)}"` : ''}></label>`;
}

function readForm(form) {
  const data = {};
  new FormData(form).forEach((value, key) => { data[key] = value; });
  form.querySelectorAll('input[type=checkbox]').forEach(box => { data[box.name] = box.checked; });
  form.querySelectorAll('[data-number]').forEach(input => { if (data[input.name] !== undefined) data[input.name] = Number(data[input.name]); });
  return data;
}

async function initPage(config) {
  const user = requireRole(...(config.roles || ['landlord', 'staff']));
  if (!user) return;
  const mount = document.querySelector('#page');
  if (!mount) return;
  let loadedRows = [];

  const filters = (config.filters || []).map(fieldInput).join('');
  const form = config.fields ? `<details class="card inline"><summary>${escapeHtml(config.createLabel || 'Add new')}</summary><form id="create-form">${config.fields.map(fieldInput).join('')}<button>Create</button></form></details>` : '';

  mount.innerHTML = `<h1>${escapeHtml(config.title)}</h1>${config.help ? `<p class="muted">${escapeHtml(config.help)}</p>` : ''}
    <form id="filter-form" class="filters">${filters}<button type="submit">Apply</button></form>
    ${form}<div id="message" class="muted"></div>
    <div class="table-wrap"><table id="records"><thead></thead><tbody></tbody></table></div>`;

  async function load() {
    const query = new URLSearchParams(document.querySelector('#filter-form') ? readForm(document.querySelector('#filter-form')) : {}).toString();
    showMessage('Loading...');
    try {
      const rows = await api(config.endpoint + (query ? `?${query}` : ''));
      const list = Array.isArray(rows) ? rows : (rows?.items || []);
      loadedRows = list;
      const thead = mount.querySelector('thead');
      thead.innerHTML = `<tr>${config.columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}<th></th></tr>`;
      const tbody = mount.querySelector('tbody');
      tbody.innerHTML = list.length ? list.map(row => `<tr>${config.columns.map(c => `<td>${renderCell(row, c)}</td>`).join('')}
        <td class="row-actions">${(config.rowActions || []).map((a, i) => `<button type="button" data-row="${escapeHtml(row[config.idKey || 'id'])}" data-rid="${i}">${escapeHtml(a.label(row))}</button>`).join('')}</td></tr>`).join('')
        : `<tr><td colspan="${config.columns.length + 1}" class="muted">No records match these filters.</td></tr>`;
      showMessage(`${list.length} record(s).`);
      if (config.onLoad) await config.onLoad(list);
    } catch (e) {
      showMessage(e.message, true);
      mount.querySelector('tbody').innerHTML = '';
    }
  }

  const filterForm = mount.querySelector('#filter-form');
  if (filterForm) filterForm.addEventListener('submit', (event) => { event.preventDefault(); load(); });

  const createForm = mount.querySelector('#create-form');
  if (createForm) createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const raw = readForm(createForm);
      const values = config.serialize ? config.serialize(raw) : raw;
      const created = await api(config.endpoint, { method: config.createMethod || 'POST', body: JSON.stringify(values) });
      showMessage(config.createdMessage ? config.createdMessage(created) : 'Saved.');
      createForm.reset();
      load();
    } catch (e) { showMessage(e.message, true); }
  });

  mount.querySelector('tbody').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-rid]');
    if (!button) return;
    const action = config.rowActions[Number(button.dataset.rid)];
    const rowId = button.dataset.row;
    const row = loadedRows.find(item => String(item[config.idKey || 'id']) === rowId) || {};
    if (action.confirm && !confirm(typeof action.confirm === 'function' ? action.confirm(row) : action.confirm)) return;
    let body = action.body ? { ...action.body(row) } : {};
    if (action.fields) {
      const answers = {};
      for (const field of action.fields) {
        const answer = prompt(`${field.label}${field.required ? ' (required)' : ''}`, field.value ?? '');
        if (answer === null) return;
        if (field.required && !answer) { showMessage(`${field.label} is required.`, true); return; }
        answers[field.name] = field.type === 'number' ? Number(answer) : (field.type === 'boolean' ? answer === 'true' : answer);
      }
      body = { ...body, ...answers };
    }
    showMessage('Working...');
    try {
      const result = await api(action.path(rowId, row), { method: action.method || 'POST', body: JSON.stringify(body) });
      if (action.render) {
        const panel = document.querySelector('#panel');
        if (panel) { panel.classList.remove('hidden'); panel.innerHTML = action.render(result); }
      }
      showMessage(action.done ? action.done(result) : 'Done.');
      if (action.reload !== false) load();
    } catch (e) { showMessage(e.message, true); }
  });

  await load();
  return { load };
}
