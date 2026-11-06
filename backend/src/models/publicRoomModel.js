const { pool } = require('../config/db');
const { where, limit, offset, inList } = require('./query');

const PUBLIC_COLUMNS =
  'id, room_number, monthly_rent, bed_capacity, cooling_type, storage_available, amenities, photo_url, ' +
  'house_id, house_name, house_address, available_beds, is_available';

exports.listPublic = async (filters = {}) => {
  const conditions = [], params = [];
  if (filters.houseId) { conditions.push('house_id = ?'); params.push(Number(filters.houseId)); }
  if (filters.minRent) { conditions.push('monthly_rent >= ?'); params.push(Number(filters.minRent)); }
  if (filters.maxRent) { conditions.push('monthly_rent <= ?'); params.push(Number(filters.maxRent)); }
  if (filters.coolingType) { conditions.push('cooling_type = ?'); params.push(filters.coolingType); }
  if (filters.availableOnly) conditions.push('available_beds > 0');
  if (filters.q) {
    conditions.push('(room_number LIKE ? OR house_name LIKE ? OR house_address LIKE ?)');
    const like = `%${filters.q}%`;
    params.push(like, like, like);
  }
  const sort = { price_asc: 'monthly_rent ASC', price_desc: 'monthly_rent DESC', newest: 'id DESC' }[filters.sort] || 'house_name, room_number';
  const perPage = limit(filters.perPage, 50);
  const skip = offset((Math.max(1, Number(filters.page) || 1) - 1) * perPage);
  const [rows] = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM v_public_rooms${where(conditions)} ORDER BY ${sort} LIMIT ${perPage} OFFSET ${skip}`,
    params);
  const amenities = await amenityMap(rows.map(row => row.id));
  return rows.map(row => exports.publicShape(row, amenities[row.id]));
};

exports.findPublic = async (id) => {
  const [rows] = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM v_public_rooms WHERE id = ?`, [id]);
  if (!rows[0]) return null;
  const amenities = await amenityMap([rows[0].id]);
  return exports.publicShape(rows[0], amenities[rows[0].id]);
};

// Amenities are stored relationally for filtering and reporting and mirrored in the legacy
// JSON column; the relation wins when it has rows so both stores agree.
async function amenityMap(roomIds) {
  if (!roomIds.length) return {};
  const [rows] = await pool.query(
    `SELECT m.room_id, a.name FROM room_amenity_map m
     INNER JOIN room_amenities a ON a.id = m.amenity_id
     WHERE m.room_id IN (${inList(roomIds)}) ORDER BY a.name`, roomIds);
  return rows.reduce((acc, row) => {
    (acc[row.room_id] ||= []).push(row.name);
    return acc;
  }, {});
}

exports.publicShape = (row, relationalAmenities = null) => ({
  id: row.id,
  roomNumber: row.room_number,
  monthlyRent: Number(row.monthly_rent),
  bedCapacity: row.bed_capacity,
  availableBeds: row.available_beds,
  isAvailable: Boolean(row.is_available),
  coolingType: row.cooling_type,
  storageAvailable: Boolean(row.storage_available),
  amenities: relationalAmenities?.length
    ? relationalAmenities
    : (typeof row.amenities === 'string' ? JSON.parse(row.amenities) : (row.amenities || [])),
  photoUrl: row.photo_url,
  house: { id: row.house_id, name: row.house_name, address: row.house_address }
});
