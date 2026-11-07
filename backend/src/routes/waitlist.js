const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/waitlistController');

router.use(auth);
router.get('/', c.list);
router.post('/', c.create);
router.patch('/:id', requireRole('landlord', 'staff'), c.setStatus);

module.exports = router;
