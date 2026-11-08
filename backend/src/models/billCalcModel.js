const { pool } = require('../config/db');
const { httpError } = require('../utils/validate');

const monthStart = billingMonth => String(billingMonth).slice(0, 7) + '-01';

exports.unitsFromReadings = async (tenancyId, billingMonth) => {
  const [rows] = await pool.execute(
    `SELECT ut.code, (mr.current_reading - mr.previous_reading) AS units
     FROM meter_readings mr JOIN utility_types ut ON ut.id = mr.utility_type_id
     WHERE mr.tenancy_id = ? AND mr.reading_period = ?`, [tenancyId, monthStart(billingMonth)]);
  return rows.reduce((acc, r) => ({ ...acc, [r.code.toLowerCase()]: Number(r.units) }), {});
};

exports.activeRoommates = async (tenancyId) => {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM tenancies WHERE room_id = (SELECT room_id FROM tenancies WHERE id = ?) AND status='active'`,
    [tenancyId]);
  return Math.max(1, Number(rows[0].n));
};

// rooms.monthly_rent is a per-bed rate, so rent is charged in full to each tenancy and only
// shared utilities are divided between the people occupying the room.
exports.breakdown = async (input) => {
  const { tenancyId, billingMonth } = input;
  if (!tenancyId || !billingMonth) throw httpError(400, 'tenancyId and billingMonth are required');
  const [tenancies] = await pool.execute(
    `SELECT tn.*, r.monthly_rent, r.house_id, r.room_number, h.name AS house_name
     FROM tenancies tn JOIN rooms r ON r.id = tn.room_id JOIN houses h ON h.id = r.house_id
     WHERE tn.id = ?`, [tenancyId]);
  const tenancy = tenancies[0];
  if (!tenancy) throw httpError(404, 'Tenancy not found');

  const [[{ days }]] = await pool.execute('SELECT DAY(LAST_DAY(?)) AS days', [monthStart(billingMonth)]);
  const daysInPeriod = Number(input.daysInPeriod) || Number(days) || 30;
  const occupiedDays = input.occupiedDays === undefined || input.occupiedDays === null
    ? daysInPeriod
    : Math.max(0, Number(input.occupiedDays));
  const proration = Math.min(1, Math.max(0, occupiedDays / daysInPeriod));
  const rent = Number((Number(tenancy.monthly_rent) * proration).toFixed(2));

  const units = await exports.unitsFromReadings(tenancyId, billingMonth);
  const waterUnits = Number(input.waterUnits ?? units.water ?? 0);
  const electricityUnits = Number(input.electricityUnits ?? units.power ?? units.electricity ?? 0);
  const roommates = Math.max(1, Number(input.roommates ?? await exports.activeRoommates(tenancyId)) || 1);

  const utility = async (code, used) => {
    const [rates] = await pool.execute(
      `SELECT ur.id, ur.fixed_charge FROM utility_rates ur
       JOIN utility_types ut ON ut.id = ur.utility_type_id
       WHERE ur.house_id = ? AND ut.code = ? AND ur.effective_from <= ?
       ORDER BY ur.effective_from DESC, ur.id DESC LIMIT 1`,
      [tenancy.house_id, code, monthStart(billingMonth)]);
    if (!rates[0]) return { gross: 0, share: 0, fixed: 0, tiered: 0, units: used, rateId: null };
    const fixed = Number(rates[0].fixed_charge);
    const [[tier]] = await pool.execute('SELECT tiered_utility_cost(?,?) AS amount', [rates[0].id, used]);
    const tiered = Number(tier.amount || 0);
    const gross = Number((fixed + tiered).toFixed(2));
    return { gross, share: Number((gross / roommates).toFixed(2)), fixed, tiered, units: used, rateId: rates[0].id };
  };

  const water = await utility('WATER', waterUnits);
  const electricity = await utility('POWER', electricityUnits);
  const total = Number((rent + water.share + electricity.share).toFixed(2));

  return {
    tenancyId: Number(tenancyId),
    billingMonth,
    houseName: tenancy.house_name,
    roomNumber: tenancy.room_number,
    roommates,
    proration,
    rent,
    water: water.share,
    electricity: electricity.share,
    waterDetail: water,
    electricityDetail: electricity,
    total,
    items: [
      { description: `Monthly rent (${tenancy.room_number})`, quantity: 1, unit_price: Number(tenancy.monthly_rent), amount: rent },
      ...(water.gross ? [{ description: `Water share of ${water.gross} (${water.units} units, ${roommates} occupant(s))`, quantity: 1, unit_price: water.share, amount: water.share }] : []),
      ...(electricity.gross ? [{ description: `Electricity share of ${electricity.gross} (${electricity.units} units, ${roommates} occupant(s))`, quantity: 1, unit_price: electricity.share, amount: electricity.share }] : [])
    ]
  };
};

exports.preview = async (input) => {
  const { waterDetail, electricityDetail, ...result } = await exports.breakdown(input);
  return { ...result, waterGross: waterDetail.gross, electricityGross: electricityDetail.gross };
};
