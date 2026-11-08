const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/invitationController');

const acceptLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

// Public, single-use invitation endpoints used by the set-password page.
router.post('/accept', acceptLimit, c.accept);
router.get('/coverage', auth, requireRole('landlord', 'staff'), c.coverage);
router.get('/:token', c.info);

// Managing invitations is internal; the model scopes tenants for staff accounts.
router.use(auth, requireRole('landlord', 'staff'));
router.get('/', c.list);
router.post('/', c.create);
router.patch('/:id/revoke', c.revoke);
router.delete('/:id', c.remove);

module.exports = router;
