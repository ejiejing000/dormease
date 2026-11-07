const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/roomController');

router.use(auth, requireRole('landlord', 'staff'));
router.get('/', c.list);
router.get('/vacancy-report', c.vacancyReport);
router.post('/', c.create);
router.get('/:id', c.get);
router.patch('/:id', c.update);
router.post('/:id/listing', c.setListed);
router.delete('/:id', c.remove);

module.exports = router;
