const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/reservationRequestController');

router.use(auth, requireRole('landlord', 'staff'));
router.get('/', c.list);
router.get('/:id', c.get);
router.post('/:id/approve', c.approve);
router.post('/:id/reject', c.reject);

module.exports = router;
