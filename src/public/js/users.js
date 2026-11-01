/**
 * DormEase client - Users and landlord screen
 * Owner: Member 1
 * Plain script: shares globals with the other js/*.js files.
 */

// =========================================================================
// TAB 3 & MEMBER A: Users & Landlord Management (Core REST CRUD)
// =========================================================================
let currentLandlordId = 1;

async function loadUsers() {
    try {
        const res = await fetch('/api/users');
        const json = await res.json();

        if (json.success && json.data) {
            window.allUsers = json.data;

            // Update user counts
            const total = json.data.length;
            const landlords = json.data.filter(u => u.role_name === 'LANDLORD').length;
            const staff = json.data.filter(u => u.role_name === 'STAFF').length;
            const tenants = json.data.filter(u => u.role_name === 'STUDENT_TENANT').length;

            const cAll = document.getElementById('userCountAll');
            const cLand = document.getElementById('userCountLandlord');
            const cStaff = document.getElementById('userCountStaff');
            const cTen = document.getElementById('userCountTenant');

            if (cAll) cAll.textContent = total;
            if (cLand) cLand.textContent = landlords;
            if (cStaff) cStaff.textContent = staff;
            if (cTen) cTen.textContent = tenants;

            // Find primary Landlord (Role 'LANDLORD' or id 1)
            const landlord = json.data.find(u => u.role_name === 'LANDLORD') || json.data[0];
            if (landlord) {
                currentLandlordId = landlord.id;
                const initials = getInitials(landlord.full_name);

                // Topbar
                const topAvatar = document.getElementById('topbarAvatar');
                const topName = document.getElementById('topbarLandlordName');
                if (topAvatar && !authUser) topAvatar.textContent = initials;
                if (topName && !authUser) topName.textContent = landlord.full_name;

                // Dashboard Spotlight
                const dashAvatar = document.getElementById('dashLandlordAvatar');
                const dashName = document.getElementById('dashLandlordName');
                const dashPhone = document.getElementById('dashLandlordPhone');
                const dashEmail = document.getElementById('dashLandlordEmail');

                if (dashAvatar) dashAvatar.textContent = initials;
                if (dashName) dashName.textContent = landlord.full_name;
                if (dashPhone) dashPhone.textContent = landlord.phone;
                if (dashEmail) dashEmail.textContent = landlord.email;
            }

            renderUsersTable(window.allUsers);
        }
    } catch (err) {
        showBanner('Error loading users: ' + err.message, 'error');
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (users && users.length > 0) {
        users.forEach(u => {
            const tr = document.createElement('tr');
            let roleBadge = `<span class="tag" style="background:var(--ultra-100); color:var(--ultra-800);">${u.role_name}</span>`;
            if (u.role_name === 'LANDLORD') {
                roleBadge = `<span class="tag" style="background:#fef3c7; color:#92400e; font-weight:700;"><i class="fa-solid fa-crown"></i> LANDLORD</span>`;
            } else if (u.role_name === 'STAFF') {
                roleBadge = `<span class="tag" style="background:#e0f2fe; color:#0369a1; font-weight:600;"><i class="fa-solid fa-user-shield"></i> STAFF</span>`;
            } else if (u.role_name === 'STUDENT_TENANT') {
                roleBadge = `<span class="tag" style="background:var(--ultra-100); color:var(--ultra-800);"><i class="fa-solid fa-graduation-cap"></i> TENANT</span>`;
            }

            tr.innerHTML = `
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span class="avatar">${getInitials(u.full_name)}</span>
                        <div>
                            <strong style="color:var(--ultra-900); display:block; font-size:.95rem;">${escapeHtml(u.full_name)}</strong>
                            <small class="muted">${escapeHtml(u.email)}</small>
                        </div>
                    </div>
                </td>
                <td><strong>${escapeHtml(u.phone)}</strong></td>
                <td>${roleBadge}</td>
                <td><span class="tag ${u.status.toLowerCase()}">${u.status}</span></td>
                <td>
                    <div class="actions">
                        <button class="btn small" style="background:var(--ultra-100); color:var(--ultra-800); border:1px solid var(--ultra-200);" title="Edit User Name & Profile" onclick="editUserPrompt(${u.id}, '${escapeHtml(u.full_name)}', '${escapeHtml(u.phone)}', '${u.status}', '${escapeHtml(u.email)}', ${u.role_id})">
                            <i class="fa-solid fa-pen"></i> Edit
                        </button>
                        ${u.id !== 1 ? `<button class="btn small danger" title="Delete User (DELETE)" onclick="deleteUser(${u.id}, '${escapeHtml(u.full_name)}')"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        tbody.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center; padding:24px;">No users found in this category.</td></tr>`;
    }
}

function filterUsersTable(role, btnElement) {
    document.querySelectorAll('#tab-users .chip').forEach(c => c.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    const users = window.allUsers || [];
    const filtered = (role === 'ALL') ? users : users.filter(u => u.role_name === role);
    renderUsersTable(filtered);
}

function openEditLandlordModal() {
    const landlord = (window.allUsers || []).find(u => u.role_name === 'LANDLORD') || (window.allUsers && window.allUsers[0]) || { id: 1, full_name: 'Engr. Roberto Dela Cruz', email: 'roberto.landlord@dormease.ph', phone: '09171234567' };
    const html = `
        <form onsubmit="handleUpdateLandlord(event, ${landlord.id})" class="form" style="max-width:none;">
            <div style="background:var(--ultra-100); border:1px solid var(--ultra-200); border-radius:12px; padding:1.2rem; margin-bottom:1.4rem; display:flex; align-items:center; gap:14px;">
                <span class="avatar" style="width:3.4rem; height:3.4rem; font-size:1.3rem; background:var(--ultra-600);">${getInitials(landlord.full_name)}</span>
                <div>
                    <strong style="color:var(--ultra-900); font-size:1.1rem; display:block;">Change Primary Landlord Details</strong>
                    <span class="muted" style="font-size:12px;">This updates the primary boarding house owner across the topbar, dashboard, and receipts.</span>
                </div>
            </div>
            <label>Landlord Full Legal Name
                <input type="text" id="editLandlordName" value="${escapeHtml(landlord.full_name)}" required placeholder="e.g. John Doe / Engr. Maria Santos">
            </label>
            <label>Contact Phone Number
                <input type="text" id="editLandlordPhone" value="${escapeHtml(landlord.phone || '')}" required placeholder="09171234567">
            </label>
            <label>Official Email Address
                <input type="email" id="editLandlordEmail" value="${escapeHtml(landlord.email || '')}" required placeholder="landlord@dormease.ph">
            </label>
            <div class="actions" style="justify-content:flex-end; margin-top:1.5rem;">
                <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn" style="font-weight:700;"><i class="fa-solid fa-check"></i> Save Landlord Profile (PUT)</button>
            </div>
        </form>
    `;
    openModal('Edit Primary Landlord Information', html);
}

async function handleUpdateLandlord(e, id) {
    e.preventDefault();
    showLoading('Updating Landlord profile in SQLite...');
    try {
        const payload = {
            full_name: document.getElementById('editLandlordName').value.trim(),
            phone: document.getElementById('editLandlordPhone').value.trim(),
            email: document.getElementById('editLandlordEmail').value.trim()
        };
        const res = await fetch(`/api/users/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        hideLoading();
        closeModal();
        if (data.success) {
            showBanner(`Landlord name updated to "${payload.full_name}"!`);
            await loadUsers();
            if (typeof loadTenants === 'function') loadTenants();
            if (typeof loadDashboardStats === 'function') loadDashboardStats();
        } else {
            showBanner(`Error: ${data.message}`, 'error');
        }
    } catch (err) {
        hideLoading();
        showBanner('Error updating landlord: ' + err.message, 'error');
    }
}

function openUserModal() {
    const html = `
        <form onsubmit="handleCreateUser(event)" class="form" style="max-width:none;">
            <label>Full Legal Name
                <input type="text" id="newUserName" required placeholder="e.g. Juan De La Cruz">
            </label>
            <label>University or Work Email
                <input type="email" id="newUserEmail" required placeholder="juan@university.edu.ph">
            </label>
            <label>Mobile Contact Number
                <input type="text" id="newUserPhone" required placeholder="09171234567">
            </label>
            <label>System Access Role
                <select id="newUserRole">
                    <option value="3">Student Tenant (Role 3)</option>
                    <option value="2">Dorm Caretaker / Staff (Role 2)</option>
                    <option value="1">Landlord / Owner (Role 1)</option>
                </select>
            </label>
            <div class="actions" style="justify-content:flex-end; margin-top:1.5rem;">
                <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn"><i class="fa-solid fa-check"></i> Create User (POST)</button>
            </div>
        </form>
    `;
    openModal('Member A: Register New User Account', html);
}

async function handleCreateUser(e) {
    e.preventDefault();
    showLoading('Sending POST /api/users...');
    try {
        const payload = {
            full_name: document.getElementById('newUserName').value,
            email: document.getElementById('newUserEmail').value,
            phone: document.getElementById('newUserPhone').value,
            role_id: Number(document.getElementById('newUserRole').value)
        };
        const res = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        hideLoading();
        closeModal();
        if (data.success) {
            showBanner(`HTTP 201 Created: ${data.message}`);
            loadUsers();
        } else {
            showBanner(`HTTP ${res.status}: ${data.message}`, 'error');
        }
    } catch (err) {
        hideLoading();
        showBanner('Network error creating user', 'error');
    }
}

async function editUserPrompt(id, currentName, currentPhone, currentStatus, currentEmail = '', currentRoleId = 3) {
    const html = `
        <form onsubmit="handleUpdateUser(event, ${id})" class="form" style="max-width:none;">
            <label>Full Legal Name
                <input type="text" id="editUserName" value="${escapeHtml(currentName)}" required placeholder="e.g. Juan De La Cruz">
            </label>
            <label>Email Address
                <input type="email" id="editUserEmail" value="${escapeHtml(currentEmail)}" required placeholder="juan@university.edu.ph">
            </label>
            <label>Mobile Phone Number
                <input type="text" id="editUserPhone" value="${escapeHtml(currentPhone)}" required placeholder="09171234567">
            </label>
            <label>System Role
                <select id="editUserRole">
                    <option value="1" ${currentRoleId === 1 ? 'selected' : ''}>Landlord / Owner (Role 1)</option>
                    <option value="2" ${currentRoleId === 2 ? 'selected' : ''}>Dorm Caretaker / Staff (Role 2)</option>
                    <option value="3" ${currentRoleId === 3 ? 'selected' : ''}>Student Tenant (Role 3)</option>
                </select>
            </label>
            <label>Account Status
                <select id="editUserStatus">
                    <option value="ACTIVE" ${currentStatus === 'ACTIVE' ? 'selected' : ''}>ACTIVE</option>
                    <option value="INACTIVE" ${currentStatus === 'INACTIVE' ? 'selected' : ''}>INACTIVE</option>
                    <option value="SUSPENDED" ${currentStatus === 'SUSPENDED' ? 'selected' : ''}>SUSPENDED</option>
                </select>
            </label>
            <div class="actions" style="justify-content:flex-end; margin-top:1.5rem;">
                <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn"><i class="fa-solid fa-save"></i> Save Changes (PUT)</button>
            </div>
        </form>
    `;
    openModal(`Update User Profile #${id}`, html);
}

async function handleUpdateUser(e, id) {
    e.preventDefault();
    showLoading('Sending PUT /api/users/' + id);
    try {
        const payload = {
            full_name: document.getElementById('editUserName').value.trim(),
            email: document.getElementById('editUserEmail') ? document.getElementById('editUserEmail').value.trim() : undefined,
            phone: document.getElementById('editUserPhone').value.trim(),
            status: document.getElementById('editUserStatus').value,
            role_id: document.getElementById('editUserRole') ? Number(document.getElementById('editUserRole').value) : undefined
        };
        const res = await fetch(`/api/users/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        hideLoading();
        closeModal();
        if (data.success) {
            showBanner(`HTTP 200 OK: ${data.message}`);
            await loadUsers();
            if (typeof loadTenants === 'function') loadTenants();
            if (typeof loadDashboardStats === 'function') loadDashboardStats();
        } else {
            showBanner(`Error: ${data.message}`, 'error');
        }
    } catch (err) {
        hideLoading();
        showBanner('Error updating user', 'error');
    }
}

async function deleteUser(id, name) {
    if (!confirm(`Are you sure you want to delete user "${name}" (ID #${id})?`)) return;
    showLoading('Sending DELETE /api/users/' + id);
    try {
        const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
        const data = await res.json();
        hideLoading();
        if (data.success) {
            showBanner(`HTTP 200 OK: ${data.message}`);
            loadUsers();
        } else {
            showBanner(`HTTP ${res.status}: ${data.message}`, 'error');
        }
    } catch (err) {
        hideLoading();
        showBanner('Error deleting user', 'error');
    }
}

function openMemberAJoiModal() {
    loadJoinDemo('inner-users');
    switchTab('tab-joins');
}

