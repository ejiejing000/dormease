/**
 * DormEase client - Tenants and leases screen
 * Owner: Member 3
 * Plain script: shares globals with the other js/*.js files.
 */

// =========================================================================
// TAB 4 & MEMBER C: Tenants & Leases (Transactions REST CRUD)
// =========================================================================
function showLeaseSubView(view) {
    const grid = document.getElementById('tenantsGridView');
    const table = document.getElementById('contractsTableView');
    const btnTenants = document.getElementById('btnViewTenants');
    const btnContracts = document.getElementById('btnViewContracts');

    if (view === 'tenants') {
        if (grid) grid.style.display = 'grid';
        if (table) table.style.display = 'none';
        if (btnTenants) btnTenants.classList.add('active');
        if (btnContracts) btnContracts.classList.remove('active');
        loadTenants();
    } else {
        if (grid) grid.style.display = 'none';
        if (table) table.style.display = 'block';
        if (btnTenants) btnTenants.classList.remove('active');
        if (btnContracts) btnContracts.classList.add('active');
        loadLeases();
    }
}

async function loadTenants() {
    try {
        const res = await fetch('/api/leases/metadata/tenants');
        const json = await res.json();
        const container = document.getElementById('tenantsGridView');
        const badge = document.getElementById('tenantsCountBadge');
        if (!container) return;

        if (json.success && json.data && json.data.length > 0) {
            if (badge) badge.textContent = json.data.length;
            container.innerHTML = json.data.map(t => {
                const roomBadge = t.room_number 
                    ? `<span class="badge" style="background:var(--ultra-600); color:#fff; font-weight:700; padding:4px 9px; border-radius:6px;"><i class="fa-solid fa-door-open"></i> ${t.room_number}</span>`
                    : `<span class="badge" style="background:#e2e8f0; color:#64748b; padding:4px 9px; border-radius:6px;">No Room Assigned</span>`;
                const rentBadge = t.monthly_rent_amount 
                    ? `<strong style="color:var(--ultra-700); font-size:1.05rem;">₱${Number(t.monthly_rent_amount).toLocaleString('en-US', {minimumFractionDigits:2})}<small style="font-size:11px; font-weight:400; color:var(--ink-2);"> /mo</small></strong>`
                    : `<span class="muted" style="font-size:12px;">No active contract</span>`;

                return `
                    <div class="tenant-card">
                        <div class="tenant-card-header">
                            <div style="display:flex; align-items:center; gap:12px;">
                                <span class="avatar" style="width:3rem; height:3rem; font-size:1.15rem; background:var(--ultra-700);">${getInitials(t.full_name)}</span>
                                <div>
                                    <strong style="color:var(--ultra-900); font-size:1.1rem; display:block;">${escapeHtml(t.full_name)}</strong>
                                    <span class="muted" style="font-size:12px;"><i class="fa-solid fa-envelope"></i> ${escapeHtml(t.email)}</span>
                                </div>
                            </div>
                            ${roomBadge}
                        </div>
                        <div class="tenant-card-body">
                            <div><i class="fa-solid fa-graduation-cap" style="color:var(--ultra-600); width:18px;"></i> <strong>School / Univ:</strong> ${escapeHtml(t.university_or_company || 'N/A')}</div>
                            <div><i class="fa-solid fa-id-badge" style="color:var(--ultra-600); width:18px;"></i> <strong>Student ID:</strong> <code>${escapeHtml(t.student_id_number || 'N/A')}</code></div>
                            <div><i class="fa-solid fa-phone" style="color:var(--ultra-600); width:18px;"></i> <strong>Student Phone:</strong> <strong>${escapeHtml(t.phone)}</strong></div>
                            <div style="background:var(--ultra-100); border:1px solid var(--ultra-200); border-radius:8px; padding:8px 10px; font-size:12px; margin-top:4px;">
                                <i class="fa-solid fa-shield-heart" style="color:var(--bad);"></i> <strong>Emergency Contact:</strong> ${escapeHtml(t.emergency_contact_name || 'N/A')} (${escapeHtml(t.emergency_contact_phone || 'N/A')})
                            </div>
                        </div>
                        <div class="tenant-card-footer">
                            <div>${rentBadge}</div>
                            <div class="actions">
                                <button class="btn small" style="background:var(--ultra-100); color:var(--ultra-800); border:1px solid var(--ultra-200);" title="Edit Student Name & Account" onclick="editUserPrompt(${t.user_id}, '${escapeHtml(t.full_name)}', '${escapeHtml(t.phone)}', 'ACTIVE', '${escapeHtml(t.email)}', 3)">
                                    <i class="fa-solid fa-user-pen"></i> Edit Name
                                </button>
                                <button class="btn small secondary" title="Edit Student ID & Emergency Info" onclick="openEditTenantModal(${t.id}, '${escapeHtml(t.full_name)}', '${escapeHtml(t.university_or_company || '')}', '${escapeHtml(t.student_id_number || '')}', '${escapeHtml(t.emergency_contact_name || '')}', '${escapeHtml(t.emergency_contact_phone || '')}')">
                                    <i class="fa-solid fa-pen-to-square"></i> Info
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            container.innerHTML = `<div class="card muted" style="grid-column:1/-1; text-align:center; padding:3rem;">No student tenants registered yet.</div>`;
        }
    } catch (err) {
        console.error('Failed to load tenants:', err);
    }
}

function openEditTenantModal(id, currentName, university, studentId, emergencyName, emergencyPhone) {
    const html = `
        <form onsubmit="handleUpdateTenantInfo(event, ${id})" class="form" style="max-width:none;">
            <div style="background:var(--ultra-100); border:1px solid var(--ultra-200); border-radius:12px; padding:1rem; margin-bottom:1.4rem;">
                <strong style="color:var(--ultra-900); font-size:1.05rem; display:block;">Student Records: ${escapeHtml(currentName)}</strong>
                <span class="muted" style="font-size:12px;">Update emergency contacts and university affiliation for this student boarder.</span>
            </div>
            <label>University or College / Company
                <input type="text" id="editTenantUni" value="${escapeHtml(university)}" required placeholder="e.g. University of Santo Tomas">
            </label>
            <label>Student ID Number
                <input type="text" id="editTenantStudentId" value="${escapeHtml(studentId)}" required placeholder="e.g. 2024-12345-UST">
            </label>
            <label>Emergency Contact Person (Parent / Guardian)
                <input type="text" id="editTenantEmergName" value="${escapeHtml(emergencyName)}" required placeholder="e.g. Maria Alonzo (Parent)">
            </label>
            <label>Emergency Contact Phone Number
                <input type="text" id="editTenantEmergPhone" value="${escapeHtml(emergencyPhone)}" required placeholder="09191234567">
            </label>
            <div class="actions" style="justify-content:flex-end; margin-top:1.5rem;">
                <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn"><i class="fa-solid fa-check"></i> Save Student Details (PUT)</button>
            </div>
        </form>
    `;
    openModal(`Edit Tenant Info: ${currentName}`, html);
}

async function handleUpdateTenantInfo(e, id) {
    e.preventDefault();
    showLoading('Updating student record in SQLite...');
    try {
        const payload = {
            university_or_company: document.getElementById('editTenantUni').value.trim(),
            student_id_number: document.getElementById('editTenantStudentId').value.trim(),
            emergency_contact_name: document.getElementById('editTenantEmergName').value.trim(),
            emergency_contact_phone: document.getElementById('editTenantEmergPhone').value.trim()
        };
        const res = await fetch(`/api/leases/tenants/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        hideLoading();
        closeModal();
        if (data.success) {
            showBanner('Student details updated successfully!');
            loadTenants();
        } else {
            showBanner(`Error: ${data.message}`, 'error');
        }
    } catch (err) {
        hideLoading();
        showBanner('Error updating tenant: ' + err.message, 'error');
    }
}

async function loadLeases() {
    try {
        const res = await fetch('/api/leases');
        const json = await res.json();
        const tbody = document.getElementById('leasesTableBody');
        const badge = document.getElementById('contractsCountBadge');
        tbody.innerHTML = '';

        if (json.success && json.data && json.data.length > 0) {
            if (badge) badge.textContent = json.data.length;
            json.data.forEach(l => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>LEAS-${l.id}</strong></td>
                    <td>
                        <strong style="color:var(--ultra-900); display:block;">${l.tenant_name}</strong>
                        <small class="muted">${l.university_or_company}</small>
                    </td>
                    <td><span class="plate sm">${l.room_number}</span></td>
                    <td><small>${l.lease_start_date} <br>to ${l.lease_end_date}</small></td>
                    <td class="num"><strong>PHP ${Number(l.monthly_rent_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
                    <td class="num">PHP ${Number(l.security_deposit).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td><span class="tag ${l.lease_status.toLowerCase()}">${l.lease_status}</span></td>
                    <td>
                        <button class="btn small danger" onclick="deleteLease(${l.id})"><i class="fa-solid fa-ban"></i> Terminate</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (err) {
        console.error('Failed to load leases:', err);
    }
}

async function openLeaseModal() {
    showLoading('Loading available rooms & registered tenants...');
    try {
        const [roomsRes, tenantsRes] = await Promise.all([
            fetch('/api/rooms?status=AVAILABLE'),
            fetch('/api/leases/metadata/tenants')
        ]);
        const roomsJson = await roomsRes.json();
        const tenantsJson = await tenantsRes.json();
        hideLoading();

        if (roomsJson.data.length === 0) {
            alert('No AVAILABLE rooms currently found. Please add or free a room first.');
            return;
        }

        const roomOpts = roomsJson.data.map(r => `<option value="${r.id}" data-rent="${r.base_rate}">${r.room_number} - ${r.category_name} (PHP ${r.base_rate})</option>`).join('');
        const tenantOpts = tenantsJson.data.map(t => `<option value="${t.id}">${t.full_name} (${t.university_or_company})</option>`).join('');

        const html = `
            <form onsubmit="handleCreateLease(event)" class="form" style="max-width:none;">
                <label>Select Room Unit (Must be AVAILABLE)
                    <select id="leaseRoomId" onchange="updateRentField()">${roomOpts}</select>
                </label>
                <label>Select Registered Student Tenant
                    <select id="leaseTenantId">${tenantOpts}</select>
                </label>
                <label>Contract Start Date
                    <input type="date" id="leaseStart" value="2026-11-01" required>
                </label>
                <label>Contract End Date
                    <input type="date" id="leaseEnd" value="2027-04-30" required>
                </label>
                <label>Agreed Monthly Rental Rate (PHP)
                    <input type="number" id="leaseRent" value="3500" required>
                </label>
                <div class="actions" style="justify-content:flex-end; margin-top:1.5rem;">
                    <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="btn"><i class="fa-solid fa-signature"></i> Finalize Contract (POST)</button>
                </div>
            </form>
        `;
        openModal('Member C: Generate Active Tenancy Contract', html);
    } catch (err) {
        hideLoading();
        showBanner('Error loading lease dialog: ' + err.message, 'error');
    }
}

function updateRentField() {
    const sel = document.getElementById('leaseRoomId');
    const opt = sel.options[sel.selectedIndex];
    if (opt) {
        document.getElementById('leaseRent').value = opt.getAttribute('data-rent') || 3500;
    }
}

async function handleCreateLease(e) {
    e.preventDefault();
    showLoading('Creating Lease Contract...');
    try {
        const payload = {
            room_id: Number(document.getElementById('leaseRoomId').value),
            tenant_id: Number(document.getElementById('leaseTenantId').value),
            lease_start_date: document.getElementById('leaseStart').value,
            lease_end_date: document.getElementById('leaseEnd').value,
            monthly_rent_amount: Number(document.getElementById('leaseRent').value)
        };
        const res = await fetch('/api/leases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        hideLoading();
        closeModal();
        if (data.success) {
            showBanner(`HTTP 201 Created: ${data.message}`);
            loadLeases();
            loadRooms();
            loadDashboardStats();
        } else {
            showBanner(`Error: ${data.message}`, 'error');
        }
    } catch (err) {
        hideLoading();
        showBanner('Error creating lease', 'error');
    }
}

async function deleteLease(id) {
    if (!confirm(`Are you sure you want to terminate Lease #${id}? This will free the associated room.`)) return;
    showLoading('Terminating lease...');
    try {
        const res = await fetch(`/api/leases/${id}`, { method: 'DELETE' });
        const data = await res.json();
        hideLoading();
        if (data.success) {
            showBanner(`HTTP 200 OK: ${data.message}`);
            loadLeases();
            loadRooms();
            loadDashboardStats();
        } else {
            showBanner(`HTTP ${res.status}: ${data.message}`, 'error');
        }
    } catch (err) {
        hideLoading();
        showBanner('Error deleting lease', 'error');
    }
}

function openMemberCJoinModal() {
    loadJoinDemo('inner-leases');
    switchTab('tab-joins');
}

