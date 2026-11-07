const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/houseController');

router.use(auth);
router.get('/', c.list);
router.get('/:id', requireRole('landlord', 'staff'), c.get);
router.post('/', requireRole('landlord'), c.create);
router.patch('/:id', requireRole('landlord'), c.update);
router.delete('/:id', requireRole('landlord'), c.remove);

module.exports = router;
