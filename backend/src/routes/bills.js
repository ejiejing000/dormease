const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const c = require('../controllers/billController');

router.use(auth);
router.get('/', c.list);
router.get('/ledger', c.ledger);
router.get('/:id', c.get);
router.post('/generate', requireRole('landlord', 'staff'), c.generate);
router.post('/generate-all', requireRole('landlord', 'staff'), c.generateAll);
router.patch('/:id', requireRole('landlord', 'staff'), c.update);
router.post('/:id/void', requireRole('landlord', 'staff'), c.void);
router.delete('/:id', requireRole('landlord', 'staff'), c.remove);

module.exports = router;
