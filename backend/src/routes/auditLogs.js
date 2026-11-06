const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/auditController');

router.use(auth, requireRole('landlord'));
router.get('/', c.list);

module.exports = router;
