const { route, badIf, guard } = require('../utils/http');
const { httpError } = require('../utils/validate');
const { canAccessHouse } = require('../utils/scope');
const houseModel = require('../models/houseModel');
const audit = require('../utils/audit');

exports.list = route(async (body, req) => houseModel.listForUser(req.user, req.query));

exports.get = route(async (body, req) => {
  const house = await houseModel.byId(req.params.id);
  if (!house || !await canAccessHouse(req.user, house.id)) throw httpError(404, 'House not found');
  return house;
});

exports.create = route(async (body, req) => {
  guard(badIf(!body.name, 400, 'name is required'), badIf(!body.address, 400, 'address is required'));
  const house = await houseModel.create({
    name: String(body.name).slice(0, 120),
    address: String(body.address).slice(0, 255),
    description: body.description ? String(body.description).slice(0, 2000) : null,
    owner_user_id: req.user.id
  });
  await audit.log(req, 'house.create', 'houses', house.id, { name: house.name });
  return house;
}, 201);

exports.update = route(async (body, req) => {
  if (!await canAccessHouse(req.user, Number(req.params.id))) throw httpError(404, 'House not found');
  const house = await houseModel.patch(req.params.id, body);
  await audit.log(req, 'house.update', 'houses', Number(req.params.id), body);
  return house;
});

exports.remove = route(async (body, req) => {
  if (!await canAccessHouse(req.user, Number(req.params.id))) throw httpError(404, 'House not found');
  const house = await houseModel.deactivate(Number(req.params.id));
  await audit.log(req, 'house.delete', 'houses', house.id, { soft_delete: true });
  return { id: house.id, is_active: Boolean(house.is_active), deleted: true };
});
