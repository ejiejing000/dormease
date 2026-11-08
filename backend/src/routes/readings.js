const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/readingController');

router.use(auth);
router.get('/', c.list);
router.post('/', requireRole('landlord', 'staff'), c.create);

module.exports = router;
