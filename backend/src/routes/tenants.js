const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/tenantController');

// Official tenants are recorded by authorized landlord/staff accounts only.
// Account invitations are issued by the /invitations resource.
router.use(auth, requireRole('landlord', 'staff'));
router.get('/', c.list);
router.get('/:id', c.get);
router.post('/', c.create);
router.patch('/:id', c.update);
router.delete('/:id', c.remove);

module.exports = router;
