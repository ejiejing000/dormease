const API_BASE = (location.origin && location.origin !== 'null' && location.port === '9000')
  ? `${location.protocol}//${location.host}/api`
  : 'http://localhost:9000/api';

const TOKEN_KEY = 'dormease_token';
const USER_KEY = 'dormease_user';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } }
function setSession(payload) {
  localStorage.setItem(TOKEN_KEY, payload.token);
  localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
}
function clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }

const PUBLIC_PAGES = ['index.html', 'browse-rooms.html', 'room-details.html', 'request-status.html', 'login.html', 'set-password.html', 'about.html'];

function isPublicPage() {
  const page = location.pathname.split('/').pop() || 'index.html';
  return PUBLIC_PAGES.includes(page);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error('Cannot reach the DormEase API. Start it with `npm run dev` in backend/.');
  }
  const payload = await response.json().catch(() => ({ success: false, message: 'Invalid server response' }));
  if (response.status === 401 && !isPublicPage()) {
    clearSession();
    location.href = `login.html?next=${encodeURIComponent(location.pathname.split('/').pop())}`;
    throw new Error('Your session expired. Please sign in again.');
  }
  if (!response.ok || payload.success === false) throw new Error(payload.message || 'Request failed');
  return payload.data;
}

// Frontend hiding is convenience only; the backend re-checks every role and ownership rule.
function requireRole(...roles) {
  const user = getUser();
  if (!getToken() || !user) { location.href = 'login.html'; return null; }
  if (roles.length && !roles.includes(user.role)) {
    showMessage('Your account does not have access to this page.', true);
    return null;
  }
  return user;
}

function showMessage(message, isError = false) {
  const el = document.querySelector('#message');
  if (!el) return;
  el.textContent = message;
  el.className = isError ? 'error' : 'muted';
}

function formatMoney(value) {
  const n = Number(value || 0);
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function qs(name) { return new URLSearchParams(location.search).get(name); }
