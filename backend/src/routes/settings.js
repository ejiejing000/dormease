const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/settingController');

router.use(auth, requireRole('landlord'));
router.get('/', c.list);
router.put('/:key', c.update);
router.delete('/:key', c.remove);

module.exports = router;
