const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/rateController');

router.use(auth, requireRole('landlord', 'staff'));
router.get('/', c.list);
router.get('/types', c.types);
router.get('/:id', c.get);
router.post('/', c.create);
router.post('/:id/tiers', c.addTier);

module.exports = router;
