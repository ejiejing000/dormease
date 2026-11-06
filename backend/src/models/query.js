exports.where = (conditions) => (conditions.length ? ' WHERE ' + conditions.join(' AND ') : '');

exports.limit = (value, fallback = 200) => Math.min(500, Math.max(1, Number(value) || fallback));

exports.offset = value => Math.max(0, Number(value) || 0);

exports.inList = (values) => values.map(() => '?').join(',');
