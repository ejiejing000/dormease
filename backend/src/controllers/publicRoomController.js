const { route, badIf, guard } = require('../utils/http');
const { httpError, id: isId } = require('../utils/validate');
const roomModel = require('../models/publicRoomModel');
const { pool } = require('../config/db');

exports.listRooms = route(async (body, req) => {
  const cooling = req.query.coolingType;
  guard(badIf(cooling && !['fan', 'aircon', 'none'].includes(cooling), 400, 'coolingType must be fan, aircon or none'));
  return roomModel.listPublic({
    ...req.query,
    houseId: req.query.houseId,
    availableOnly: ['1', 'true', 'yes'].includes(String(req.query.availableOnly || '').toLowerCase())
  });
});

exports.filters = route(async () => {
  const [houses] = await pool.execute(
    'SELECT id, name, address FROM houses WHERE is_active = TRUE ORDER BY name');
  const [ranges] = await pool.execute(
    'SELECT MIN(monthly_rent) AS min_rent, MAX(monthly_rent) AS max_rent FROM rooms WHERE is_listed = TRUE');
  return { houses, price: ranges[0] };
});

exports.room = route(async (body, req) => {
  guard(badIf(!isId(req.params.id), 400, 'Room id is not valid'));
  const room = await roomModel.findPublic(req.params.id);
  if (!room) throw httpError(404, 'Room is not available for browsing');
  const [reviews] = await pool.execute(
    `SELECT COUNT(*) AS requests FROM reservation_requests WHERE room_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    [room.id]);
  return { ...room, interest_last_30_days: Number(reviews[0].requests) };
});
