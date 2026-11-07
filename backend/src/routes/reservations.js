const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/reservationController');

router.use(auth);
router.get('/', c.list);
router.get('/:id', c.get);
router.post('/', requireRole('landlord', 'staff'), c.create);

// The action comes from the URL itself, so each route names it: without this the handler reads
// req.params.action, Express never fills it for a literal path, and every action below 400s.
const action = (name) => (req, res, next) => { req.params.action = name; next(); };

// Tenants may only cancel their own reservation; the model re-checks ownership.
router.post('/:id/approve', requireRole('landlord', 'staff'), action('approve'), c.setStatus);
router.post('/:id/reject', requireRole('landlord', 'staff'), action('reject'), c.setStatus);
router.post('/:id/hold', requireRole('landlord', 'staff'), action('hold'), c.setStatus);
router.post('/:id/cancel', action('cancel'), c.setStatus);

module.exports = router;
