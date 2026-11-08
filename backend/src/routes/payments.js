const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/paymentController');

router.use(auth);
router.get('/', c.list);
router.post('/', requireRole('landlord', 'staff'), c.record);
router.get('/:id', c.get);
router.get('/:id/receipt', c.receipt);

module.exports = router;
