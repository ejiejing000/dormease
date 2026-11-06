const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/reportController');

router.use(auth, requireRole('landlord', 'staff'));
router.get('/', c.list);
router.get('/summary', c.summary);
router.get('/occupancy', c.occupancy);
router.get('/collections', c.collections);
router.get('/income', c.income);
router.get('/tenants/:tenantId', c.tenantStatement);

module.exports = router;
