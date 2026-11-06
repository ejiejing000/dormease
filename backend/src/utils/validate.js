exports.httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

exports.id = value => Number.isInteger(Number(value)) && Number(value) > 0;
exports.money = value => Number.isFinite(Number(value)) && Number(value) >= 0;
exports.email = value => typeof value === 'string' && /^\S+@\S+\.\S+$/.test(value.trim());
exports.phone = value => typeof value === 'string' && /^[0-9+()\-\s]{7,20}$/.test(value.trim());
exports.date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
