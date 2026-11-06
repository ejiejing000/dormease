const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/staffController');

router.use(auth);
router.get('/', requireRole('landlord', 'staff'), c.list);
router.get('/coverage', requireRole('landlord'), c.coverage);
router.get('/:id', requireRole('landlord'), c.get);
// Creating, scoping or disabling staff accounts is landlord-only.
router.post('/', requireRole('landlord'), c.create);
router.patch('/:id', requireRole('landlord'), c.update);
router.delete('/:id', requireRole('landlord'), c.remove);
router.put('/:id/houses', requireRole('landlord'), c.assignHouses);
router.post('/:id/password', requireRole('landlord'), c.setPassword);
router.post('/:id/deactivate', requireRole('landlord'), c.deactivate);

module.exports = router;
