const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/tenancyController');

router.use(auth);
router.get('/', c.list);
router.get('/register', c.register);
router.get('/:id', c.get);
router.post('/', requireRole('landlord', 'staff'), c.create);
router.patch('/:id', requireRole('landlord', 'staff'), c.update);
router.post('/:id/end', requireRole('landlord', 'staff'), c.end);

module.exports = router;
