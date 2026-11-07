const { pool } = require('../config/db');
const { where, limit, inList } = require('./query');

const EDITABLE = {
  house_id: v => Number(v), room_number: v => String(v), monthly_rent: v => Number(v),
  bed_capacity: v => Number(v), cooling_type: v => String(v), storage_available: v => Boolean(v),
  amenities: v => JSON.stringify(v), photo_url: v => String(v), is_listed: v => Boolean(v)
};

exports.listForUser = async (user, filters = {}) => {
  const conditions = [], params = [];
  if (user.role === 'staff') {
    if (!user.houseIds.length) return [];
    conditions.push(`r.house_id IN (${inList(user.houseIds)})`);
    params.push(...user.houseIds);
  } else if (user.role === 'landlord') {
    conditions.push('(h.owner_user_id = ? OR h.owner_user_id IS NULL)');
    params.push(user.id);
  } else {
    return [];
  }
  if (filters.houseId) { conditions.push('r.house_id = ?'); params.push(Number(filters.houseId)); }
  if (filters.status === 'listed') conditions.push('r.is_listed = TRUE');
  if (filters.status === 'unlisted') conditions.push('r.is_listed = FALSE');
  const [rows] = await pool.query(
    `SELECT r.*, h.name AS house_name, v.available_beds,
            (SELECT COUNT(*) FROM tenancies t WHERE t.room_id = r.id AND t.status = 'active') AS active_tenancies
     FROM rooms r
     JOIN houses h ON h.id = r.house_id
     LEFT JOIN v_room_availability v ON v.room_id = r.id${where(conditions)}
     ORDER BY h.name, r.room_number LIMIT ${limit(filters.limit)}`, params);
  return rows;
};

// Join report: RIGHT JOIN from tenancies to rooms keeps every room, then the
// `tn.id IS NULL` filter leaves the rooms that have no active lease.
exports.vacancyReport = async (user) => {
  const conditions = [], params = [];
  if (user.role === 'staff') {
    if (!user.houseIds.length) return [];
    conditions.push(`r.house_id IN (${inList(user.houseIds)})`);
    params.push(...user.houseIds);
  } else if (user.role === 'landlord') {
    conditions.push('(h.owner_user_id = ? OR h.owner_user_id IS NULL)');
    params.push(user.id);
  } else {
    return [];
  }
  const [rows] = await pool.query(
    `SELECT h.name AS house_name, r.id AS room_id, r.room_number, r.bed_capacity,
            v.available_beds, (v.available_beds > 0) AS is_available
     FROM tenancies tn
     RIGHT JOIN rooms r ON r.id = tn.room_id AND tn.status = 'active'
     JOIN houses h ON h.id = r.house_id
     JOIN v_room_availability v ON v.room_id = r.id
     WHERE tn.id IS NULL AND r.is_listed = TRUE${conditions.length ? ' AND ' + conditions.join(' AND ') : ''}
     ORDER BY h.name, r.room_number`, params);
  return rows;
};

exports.findForUser = async (id, user) => {
  const [rows] = await pool.query(
    `SELECT r.*, h.name AS house_name, h.owner_user_id, v.available_beds FROM rooms r
     JOIN houses h ON h.id = r.house_id
     LEFT JOIN v_room_availability v ON v.room_id = r.id WHERE r.id = ?`, [id]);
  const room = rows[0];
  if (!room) return null;
  if (user.role === 'staff' && !user.houseIds.includes(room.house_id)) return null;
  if (user.role === 'landlord' && room.owner_user_id && room.owner_user_id !== user.id) return null;
  return room;
};

exports.create = async (data) => {
  const columns = Object.keys(EDITABLE).filter(c => data[c] !== undefined && data[c] !== null);
  if (!columns.length) throw Object.assign(new Error('No room fields provided'), { status: 400, expose: true });
  const [result] = await pool.execute(
    `INSERT INTO rooms (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
    columns.map(c => EDITABLE[c](data[c])));
  return exports.byId(result.insertId);
};

exports.patch = async (id, data) => {
  const columns = Object.keys(EDITABLE).filter(c => data[c] !== undefined && data[c] !== null);
  if (!columns.length) return exports.byId(id);
  await pool.execute(`UPDATE rooms SET ${columns.map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...columns.map(c => EDITABLE[c](data[c])), id]);
  return exports.byId(id);
};

exports.byId = async (id) => {
  const [rows] = await pool.execute('SELECT * FROM rooms WHERE id = ?', [id]);
  return rows[0] || null;
};

exports.houseId = async (id) => {
  const [rows] = await pool.execute('SELECT house_id FROM rooms WHERE id = ?', [id]);
  return rows[0]?.house_id ?? null;
};

// A room that has ever been reserved, leased or waitlisted keeps its history; only an
// unused room can be removed for real. Unlisting remains the soft-delete path.
exports.dependencies = async (id) => {
  const [rows] = await pool.execute(
    `SELECT
       (SELECT COUNT(*) FROM tenancies WHERE room_id = ?) AS tenancies,
       (SELECT COUNT(*) FROM reservations WHERE room_id = ?) AS reservations,
       (SELECT COUNT(*) FROM reservation_requests WHERE room_id = ?) AS requests,
       (SELECT COUNT(*) FROM waitlist WHERE room_id = ?) AS waitlist`,
    [id, id, id, id]);
  return rows[0];
};

exports.remove = async (id) => {
  await pool.execute('DELETE FROM rooms WHERE id = ?', [id]);
};
