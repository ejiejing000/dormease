const IN_PAGES_DIR = location.pathname.includes('/pages/');
const BASE = IN_PAGES_DIR ? '' : 'pages/';
const ROOT = IN_PAGES_DIR ? '../' : '';

const ROLE_LINKS = {
  tenant: [['tenant-dashboard', 'My Dashboard'], ['lease', 'My Room'], ['bills', 'My Bills'], ['tickets', 'Maintenance'], ['notifications', 'Messages']],
  staff: [['dashboard', 'Dashboard'], ['reservation-requests', 'Requests'], ['reservations', 'Reservations'], ['tenants', 'Tenants'], ['invitations', 'Invitations'], ['rooms', 'Rooms'], ['lease', 'Leases'], ['readings', 'Readings'], ['bills', 'Bills'], ['payments', 'Payments'], ['tickets', 'Tickets'], ['rates', 'Rates']],
  landlord: [['dashboard', 'Dashboard'], ['reservation-requests', 'Requests'], ['reservations', 'Reservations'], ['houses', 'Houses'], ['rooms', 'Rooms'], ['staff', 'Staff'], ['tenants', 'Tenants'], ['invitations', 'Invitations'], ['lease', 'Leases'], ['rates', 'Rates'], ['readings', 'Readings'], ['bills', 'Bills'], ['payments', 'Payments'], ['tickets', 'Tickets'], ['reports', 'Reports'], ['audit', 'Audit Log']]
};

function currentPage() {
  return (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '');
}

function anchors(items) {
  const page = currentPage();
  return items.map(([file, label, href]) => {
    const url = href || `${BASE}${file}.html`;
    const active = file === page || url.endsWith(`${page}.html`);
    return `<a href="${url}"${active ? ' class="active"' : ''}>${label}</a>`;
  }).join('');
}

function renderNav() {
  const nav = document.querySelector('#top-nav');
  if (!nav) return;
  const user = typeof getUser === 'function' ? getUser() : null;
  const role = user && ROLE_LINKS[user.role] ? user.role : null;

  const publicItems = [
    ['index', 'Home', `${ROOT}index.html`],
    ['browse-rooms', 'Browse Rooms', `${ROOT}browse-rooms.html`],
    ['about', 'About', `${ROOT}about.html`]
  ];

  const manage = role ? anchors(ROLE_LINKS[role].map(([file, label]) => [file, label])) : '';
  const account = role
    ? `<a href="${BASE}${role === 'tenant' ? 'tenant-dashboard' : 'dashboard'}.html" class="who">${escapeHtml(user.full_name)} · ${role}</a><a href="${BASE}login.html" id="logout-link">Sign out</a>`
    : `<a href="${BASE}login.html" class="cta">Login</a>`;

  nav.innerHTML = anchors(publicItems) + manage + account;
  const logout = nav.querySelector('#logout-link');
  if (logout) {
    logout.addEventListener('click', (event) => {
      event.preventDefault();
      clearSession();
      location.href = `${ROOT}index.html`;
    });
  }
}

document.addEventListener('DOMContentLoaded', renderNav);
