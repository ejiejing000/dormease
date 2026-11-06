const COOLING_LABEL = { fan: 'Fan room', aircon: 'Air-conditioned', none: 'No cooling' };
const PUBLIC_BASE = typeof ROOT === 'string' ? ROOT : '';

function formValues(form) {
  const data = Object.fromEntries(new FormData(form));
  form.querySelectorAll('input[type=checkbox]').forEach(box => { data[box.name] = box.checked; });
  return data;
}

function roomCard(room) {
  return `<article class="room-card">
    ${room.photoUrl ? `<img src="${escapeHtml(room.photoUrl)}" alt="${escapeHtml(room.roomNumber)}" loading="lazy">` : `<div class="room-placeholder">${escapeHtml(room.roomNumber)}</div>`}
    <div class="room-body">
      <h3>${escapeHtml(room.roomNumber)} · ${escapeHtml(COOLING_LABEL[room.coolingType] || room.coolingType)}</h3>
      <p class="muted">${escapeHtml(room.house.name)} — ${escapeHtml(room.house.address || '')}</p>
      <p class="price">${formatMoney(room.monthlyRent)}<span> / month per bed</span></p>
      <p>${room.bedCapacity} bed(s) · ${room.availableBeds} available · ${escapeHtml((room.amenities || []).join(', ') || 'No listed amenities')}</p>
      <p><span class="badge ${room.isAvailable ? 'available' : 'full'}">${room.isAvailable ? 'Available' : 'Fully occupied'}</span></p>
      <a class="button-link" href="${PUBLIC_BASE}room-details.html?id=${room.id}">View &amp; request this room</a>
    </div>
  </article>`;
}

async function loadFeatured(mountId, params = '') {
  const mount = document.querySelector(`#${mountId}`);
  if (!mount) return;
  mount.innerHTML = '<p class="muted">Loading rooms…</p>';
  try {
    const rooms = await api(`/public/rooms${params}`);
    mount.innerHTML = rooms.length
      ? `<div class="room-grid">${rooms.map(roomCard).join('')}</div>`
      : '<p class="muted">No rooms are listed right now. Check back soon.</p>';
  } catch (e) {
    mount.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
  }
}

function initBrowse() {
  const form = document.querySelector('#browse-filters');
  if (!form) return;
  const submit = () => {
    const data = formValues(form);
    const query = new URLSearchParams(Object.entries(data).filter(([key, v]) => v !== '' && v !== undefined && key !== 'availableOnly'));
    if (data.availableOnly) query.set('availableOnly', '1');
    loadFeatured('room-results', `?${query.toString()}`);
  };
  form.addEventListener('submit', (event) => { event.preventDefault(); submit(); });
  api('/public/houses').then(meta => {
    const select = form.querySelector('[name=houseId]');
    if (select) select.innerHTML = '<option value="">All boarding houses</option>' +
      meta.houses.map(h => `<option value="${h.id}">${escapeHtml(h.name)}</option>`).join('');
    const min = form.querySelector('[name=minRent]'), max = form.querySelector('[name=maxRent]');
    if (min && meta.price.min_rent) min.placeholder = `from ${meta.price.min_rent}`;
    if (max && meta.price.max_rent) max.placeholder = `up to ${meta.price.max_rent}`;
  }).catch(() => {});
  submit();
}

function initRoomDetail() {
  const mount = document.querySelector('#room-detail');
  if (!mount) return;
  const id = qs('id');
  if (!id) { mount.innerHTML = '<p class="error">No room selected.</p>'; return; }
  api(`/public/rooms/${encodeURIComponent(id)}`).then(room => {
    mount.innerHTML = `<h1>Room ${escapeHtml(room.roomNumber)}</h1>
      <p class="muted">${escapeHtml(room.house.name)} · ${escapeHtml(room.house.address || '')}</p>
      <div class="room-grid single">${roomCard(room)}</div>`;
    const form = document.querySelector('#request-form');
    if (form) {
      form.querySelector('[name=room_id]').value = room.id;
      const note = document.querySelector('#request-room-note');
      if (note) note.textContent = `You are requesting room ${room.roomNumber} at ${room.house.name}.`;
      if (!room.isAvailable) {
        form.querySelector('button').disabled = true;
        showMessage('This room is currently full — join the waitlist after signing in.', true);
      }
    }
  }).catch(e => { mount.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`; });

  const requestForm = document.querySelector('#request-form');
  if (requestForm) requestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await api('/public/reservation-requests', { method: 'POST', body: JSON.stringify(formValues(requestForm)) });
      showMessage(`Request #${result.id} sent. ${result.message}`);
      requestForm.reset();
      document.querySelector('#request-result').innerHTML =
        `<p>Keep your request number: <strong>${result.id}</strong>. You can check its status with the same email address on the <a href="request-status.html">request status page</a>.</p>`;
    } catch (e) { showMessage(e.message, true); }
  });
}

function initStatusCheck() {
  const form = document.querySelector('#status-form');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
      const found = await api(`/public/reservation-requests/status?id=${encodeURIComponent(data.id)}&email=${encodeURIComponent(data.email)}`);
      document.querySelector('#status-result').innerHTML = `<table><tbody>
        <tr><th>Request</th><td>#${found.id} · ${escapeHtml(found.room_number)} at ${escapeHtml(found.house_name)}</td></tr>
        <tr><th>Status</th><td><span class="badge ${escapeHtml(found.status)}">${escapeHtml(found.status)}</span></td></tr>
        <tr><th>Sent</th><td>${formatDate(found.created_at)}</td></tr>
        <tr><th>Reviewed</th><td>${formatDate(found.reviewed_at)}</td></tr>
        <tr><th>Note</th><td>${escapeHtml(found.review_note || '-')}</td></tr>
      </tbody></table>${found.status === 'approved' ? '<p>Approved! Staff will send an email link to set up your tenant account.</p>' : ''}`;
    } catch (e) { document.querySelector('#status-result').innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`; }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const page = (location.pathname.split('/').pop() || '');
  if (document.querySelector('#featured-rooms')) loadFeatured('featured-rooms', '?availableOnly=1&perPage=6');
  if (page === 'browse-rooms.html') initBrowse();
  if (page === 'room-details.html') initRoomDetail();
  if (page === 'request-status.html') initStatusCheck();
});
