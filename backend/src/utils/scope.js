const { pool } = require('../config/db');

// Every protected read and write resolves the house that owns the record before touching it.
// An out-of-scope house is reported as "not found" so ids cannot be probed by guessing.
async function canAccessHouse(user, houseId) {
  if (!Number.isInteger(houseId) || houseId <= 0) return false;
  if (user.role === 'staff') return user.houseIds.includes(houseId);
  if (user.role !== 'landlord') return false;
  if (user.houseIds.includes(houseId)) return true;
  const [rows] = await pool.execute(
    'SELECT id FROM houses WHERE id = ? AND (owner_user_id = ? OR owner_user_id IS NULL)', [houseId, user.id]);
  return rows.length > 0;
}

// Utility rate rights are per staff assignment; a landlord always has them on their own houses.
async function canManageRates(user, houseId) {
  if (user.role === 'landlord') return await canAccessHouse(user, houseId);
  if (user.role !== 'staff') return false;
  const assignment = user.assignments.find(a => a.house_id === houseId);
  return Boolean(assignment && assignment.can_manage_rates);
}

module.exports = { canAccessHouse, canManageRates };
