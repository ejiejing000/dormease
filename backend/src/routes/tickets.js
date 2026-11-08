const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/ticketController');

router.use(auth);
router.get('/', c.list);
router.get('/history-report', requireRole('landlord', 'staff'), c.historyReport);
router.get('/:id', c.get);
// Tenants submit tickets for their own active tenancy; the model verifies ownership.
router.post('/', c.create);
router.patch('/:id', c.update);
router.patch('/:id/status', requireRole('landlord', 'staff'), c.setStatus);
router.delete('/:id', requireRole('landlord', 'staff'), c.remove);

module.exports = router;
