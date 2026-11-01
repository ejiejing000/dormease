/**
 * DormEase client - Shared helpers, tabs, loading, banner, modal
 * Owner: Member 1
 * Plain script: shares globals with the other js/*.js files.
 */

/**
 * DormEase Client Application
 * Signature Design System + Ultramarine 7-Tone Palette
 * Connects frontend views with Express MVC REST endpoints
 */

// Global State
let currentTab = 'tab-dashboard';
let allRoomsCache = [];

// Helper: Extract Initials from Name
function getInitials(name) {
    if (!name) return 'DE';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// =========================================================================
// Login state (Member 1): token kept in sessionStorage, added to every /api call
// =========================================================================
let authUser = null;

function getToken() {
    try { return sessionStorage.getItem('dormeaseToken'); } catch (e) { return null; }
}
function setToken(token) {
    try {
        if (token) sessionStorage.setItem('dormeaseToken', token);
        else sessionStorage.removeItem('dormeaseToken');
    } catch (e) { /* storage blocked: the login just will not survive a reload */ }
}

// Wrap fetch once so every screen file sends the token without changing its own code
(function wrapFetch() {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function (url, options = {}) {
        const isApi = typeof url === 'string' && url.startsWith('/api/');
        const token = getToken();
        if (isApi && token) {
            options = Object.assign({}, options, {
                headers: Object.assign({}, options.headers || {}, { Authorization: 'Bearer ' + token })
            });
        }
        const res = await nativeFetch(url, options);
        if (isApi && url !== '/api/users/login') {
            if (res.status === 401) {
                setToken(null);
                showLoginScreen('Your session ended. Please log in again.');
            } else if (res.status === 403) {
                showBanner('403 Forbidden: your role is not allowed to do that.', 'error');
            }
        }
        return res;
    };
})();

function showLoginScreen(message) {
    document.getElementById('loginScreen').classList.remove('hidden');
    const err = document.getElementById('loginError');
    err.textContent = message || '';
    err.classList.toggle('hidden', !message);
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Logging in...';
    try {
        const res = await fetch('/api/users/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('loginEmail').value.trim(),
                password: document.getElementById('loginPassword').value
            })
        });
        const json = await res.json();
        if (json.success) {
            setToken(json.data.token);
            location.reload();
        } else {
            showLoginScreen(json.message || 'Login failed.');
        }
    } catch (err) {
        showLoginScreen('Cannot reach the server. Is it running?');
    }
    btn.disabled = false;
    btn.textContent = 'Log in';
}

function logout() {
    setToken(null);
    location.reload();
}

async function restoreSession() {
    if (!getToken()) return false;
    try {
        const res = await fetch('/api/users/me');
        const json = await res.json();
        if (!json.success) return false;
        authUser = json.data;
        document.getElementById('topbarLandlordName').textContent = authUser.full_name;
        document.getElementById('topbarAvatar').textContent = getInitials(authUser.full_name);
        document.getElementById('topbarRole').textContent = authUser.role_name;
        return true;
    } catch (err) {
        return false;
    }
}

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    setupTabNavigation();
    if (!(await restoreSession())) {
        showLoginScreen();
        return;
    }
    loadDashboardStats();
    loadUsers();
    loadRooms();
    loadLeases();
    loadTenants();
    loadReadings();
    loadInvoices();
    if (typeof loadReservations === 'function') loadReservations();
    if (typeof loadAuditLogs === 'function') loadAuditLogs();
});

// Tab Navigation
function setupTabNavigation() {
    const navItems = document.querySelectorAll('.nav .nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.nav .nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    const btn = document.querySelector(`.nav [data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');

    const pane = document.getElementById(tabId);
    if (pane) pane.classList.add('active');

    currentTab = tabId;
    if (tabId === 'tab-dashboard') loadDashboardStats();
    if (tabId === 'tab-users') loadUsers();
    if (tabId === 'tab-leases') { loadLeases(); loadTenants(); }
    if (tabId === 'tab-joins') loadJoinDemo('full-outer');
    if (tabId === 'tab-rooms') renderRoomCards(allRoomsCache);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Instant Global Search Filter
function handleGlobalSearch(e) {
    const term = e.target.value.toLowerCase().trim();
    if (currentTab === 'tab-rooms' && allRoomsCache.length > 0) {
        const filtered = allRoomsCache.filter(r =>
            r.room_number.toLowerCase().includes(term) ||
            r.property_name.toLowerCase().includes(term) ||
            r.category_name.toLowerCase().includes(term)
        );
        renderRoomCards(filtered);
    } else {
        const activePane = document.querySelector('.tab-pane.active');
        if (!activePane) return;
        const rows = activePane.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    }
}

// Room Filters
function filterRoomsByBudget(e) {
    const budget = Number(e.target.value);
    if (!budget) {
        renderRoomCards(allRoomsCache);
        return;
    }
    const filtered = allRoomsCache.filter(r => Number(r.base_rate) <= budget);
    renderRoomCards(filtered);
}

function filterByAmenity(amenity) {
    if (amenity === 'Aircon') {
        renderRoomCards(allRoomsCache.filter(r => r.aircon_equipped));
    } else {
        renderRoomCards(allRoomsCache);
    }
}

// UI Feedback Handlers
function showLoading(msg = 'Executing SQLite Query...') {
    const el = document.getElementById('loadingOverlay');
    el.querySelector('p').textContent = msg;
    el.classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

function showBanner(message, type = 'success') {
    const banner = document.getElementById('feedbackBanner');
    const text = document.getElementById('feedbackText');
    const icon = document.getElementById('feedbackIcon');

    banner.className = `feedback-banner ${type}`;
    text.textContent = message;
    icon.className = type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation';

    banner.classList.remove('hidden');
    setTimeout(() => {
        banner.classList.add('hidden');
    }, 4500);
}

function hideBanner() {
    document.getElementById('feedbackBanner').classList.add('hidden');
}

// Generic Modal Handlers
function openModal(title, htmlContent) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = htmlContent;
    document.getElementById('modalContainer').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modalContainer').classList.add('hidden');
}

