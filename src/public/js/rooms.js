/**
 * DormEase client - Rooms and master data screen
 * Owner: Member 2
 * Plain script: shares globals with the other js/*.js files.
 */

// =========================================================================
// TAB 3 & MEMBER B: Rooms & Master Data (Signature Room Cards & Door Plates)
// =========================================================================
async function loadRooms() {
    try {
        const res = await fetch('/api/rooms');
        const json = await res.json();
        if (json.success && json.data.length > 0) {
            allRoomsCache = json.data;
            renderRoomCards(allRoomsCache);
        }
    } catch (err) {
        console.error('Failed to load rooms:', err);
    }
}

function renderRoomCards(rooms) {
    const grid = document.getElementById('roomsCardGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (rooms.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:3rem; background:#fff; border-radius:18px; border:1px dashed var(--line);"><p class="muted">No rooms match your filter criteria.</p></div>`;
        return;
    }

    rooms.forEach((r, idx) => {
        const svgIdx = String((idx % 14) + 1).padStart(2, '0');
        const imgPath = `img/rooms/room-${svgIdx}.svg`;
        const isTaken = r.status === 'OCCUPIED';

        const card = document.createElement('article');
        card.className = 'room-card';
        card.innerHTML = `
            <div class="room-photo">
                <img src="${imgPath}" alt="Room ${r.room_number} photo">
                <span class="plate sm ${isTaken ? 'taken' : ''}">${r.room_number}</span>
            </div>
            <div class="room-body">
                <h3>${r.property_name}</h3>
                <div class="room-loc"><i class="fa-solid fa-location-dot" style="color:var(--tile); margin-right:4px;"></i> ${r.property_address || 'University Belt Area'}</div>
                <div class="room-chips">
                    <span class="chip soft">${r.category_name}</span>
                    ${r.aircon_equipped ? '<span class="chip soft"><i class="fa-solid fa-snowflake"></i> Aircon</span>' : '<span class="chip soft">Fan Only</span>'}
                    <span class="tag ${r.status.toLowerCase()}">${r.status}</span>
                </div>
                <div class="room-foot">
                    <span class="price">PHP ${Number(r.base_rate).toLocaleString('en-US', { minimumFractionDigits: 0 })} <small>/ month</small></span>
                    <span class="sleeps" title="Capacity: ${r.max_occupants} persons"><i class="fa-solid fa-users" style="margin-right:4px;"></i> ${r.max_occupants}</span>
                </div>
                <div class="actions" style="margin-top:10px;">
                    <button class="btn small secondary" style="flex:1;" onclick="editRoomPrompt(${r.id}, '${r.room_number}', '${r.status}', ${r.aircon_equipped})"><i class="fa-solid fa-pen"></i> Edit</button>
                    <button class="btn small danger" onclick="deleteRoom(${r.id}, '${r.room_number}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function openRoomModal() {
    showLoading('Loading properties and categories...');
    try {
        const res = await fetch('/api/rooms/metadata/lookups');
        const meta = await res.json();
        hideLoading();

        let propOptions = meta.data.properties.map(p => `<option value="${p.id}">${p.property_name}</option>`).join('');
        let catOptions = meta.data.categories.map(c => `<option value="${c.id}">${c.category_name} (PHP ${c.base_rate})</option>`).join('');

        const html = `
            <form onsubmit="handleCreateRoom(event)" class="form" style="max-width:none;">
                <label>Boarding House Property
                    <select id="newRoomProp">${propOptions}</select>
                </label>
                <label>Room Category Tier
                    <select id="newRoomCat">${catOptions}</select>
                </label>
                <label>Room Code / Enamel Plate Number
                    <input type="text" id="newRoomNum" placeholder="e.g. Room 301" required>
                </label>
                <label>Floor Number
                    <input type="number" id="newRoomFloor" value="1" min="1" required>
                </label>
                <label>Air Conditioning
                    <select id="newRoomAircon">
                        <option value="1">Yes (Aircon Equipped)</option>
                        <option value="0">No (Standard Fan)</option>
                    </select>
                </label>
                <div class="actions" style="justify-content:flex-end; margin-top:1.5rem;">
                    <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="btn"><i class="fa-solid fa-check"></i> Register Room (POST)</button>
                </div>
            </form>
        `;
        openModal('Member B: Register New Room Unit', html);
    } catch (err) {
        hideLoading();
        showBanner('Error loading metadata', 'error');
    }
}

async function handleCreateRoom(e) {
    e.preventDefault();
    showLoading('Sending POST /api/rooms...');
    try {
        const payload = {
            property_id: Number(document.getElementById('newRoomProp').value),
            category_id: Number(document.getElementById('newRoomCat').value),
            room_number: document.getElementById('newRoomNum').value,
            floor_number: Number(document.getElementById('newRoomFloor').value),
            aircon_equipped: document.getElementById('newRoomAircon').value === '1'
        };
        const res = await fetch('/api/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        hideLoading();
        closeModal();
        if (data.success) {
            showBanner(`HTTP 201 Created: ${data.message}`);
            loadRooms();
            loadDashboardStats();
        } else {
            showBanner(`Error: ${data.message}`, 'error');
        }
    } catch (err) {
        hideLoading();
        showBanner('Error creating room', 'error');
    }
}

function editRoomPrompt(id, roomNumber, currentStatus, aircon) {
    const html = `
        <form onsubmit="handleUpdateRoom(event, ${id})" class="form" style="max-width:none;">
            <label>Room Identifier
                <input type="text" id="editRoomNum" value="${roomNumber}" required>
            </label>
            <label>Availability Status
                <select id="editRoomStatus">
                    <option value="AVAILABLE" ${currentStatus === 'AVAILABLE' ? 'selected' : ''}>AVAILABLE</option>
                    <option value="OCCUPIED" ${currentStatus === 'OCCUPIED' ? 'selected' : ''}>OCCUPIED</option>
                    <option value="MAINTENANCE" ${currentStatus === 'MAINTENANCE' ? 'selected' : ''}>MAINTENANCE</option>
                </select>
            </label>
            <label>Air Conditioning
                <select id="editRoomAircon">
                    <option value="1" ${aircon ? 'selected' : ''}>Yes</option>
                    <option value="0" ${!aircon ? 'selected' : ''}>No</option>
                </select>
            </label>
            <div class="actions" style="justify-content:flex-end; margin-top:1.5rem;">
                <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn"><i class="fa-solid fa-save"></i> Save Changes (PUT)</button>
            </div>
        </form>
    `;
    openModal(`Member B: Update Room Unit #${roomNumber}`, html);
}

async function handleUpdateRoom(e, id) {
    e.preventDefault();
    showLoading('Sending PUT /api/rooms/' + id);
    try {
        const payload = {
            room_number: document.getElementById('editRoomNum').value,
            status: document.getElementById('editRoomStatus').value,
            aircon_equipped: document.getElementById('editRoomAircon').value === '1'
        };
        const res = await fetch(`/api/rooms/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        hideLoading();
        closeModal();
        if (data.success) {
            showBanner(`HTTP 200 OK: ${data.message}`);
            loadRooms();
        } else {
            showBanner(`Error: ${data.message}`, 'error');
        }
    } catch (err) {
        hideLoading();
        showBanner('Error updating room', 'error');
    }
}

async function deleteRoom(id, roomNumber) {
    if (!confirm(`Are you sure you want to delete room "${roomNumber}"?`)) return;
    showLoading('Sending DELETE /api/rooms/' + id);
    try {
        const res = await fetch(`/api/rooms/${id}`, { method: 'DELETE' });
        const data = await res.json();
        hideLoading();
        if (data.success) {
            showBanner(`HTTP 200 OK: ${data.message}`);
            loadRooms();
            loadDashboardStats();
        } else {
            showBanner(`HTTP ${res.status}: ${data.message}`, 'error');
        }
    } catch (err) {
        hideLoading();
        showBanner('Error deleting room', 'error');
    }
}

function openMemberBJoinModal() {
    loadJoinDemo('left-rooms');
    switchTab('tab-joins');
}

