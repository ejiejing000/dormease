const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const c = require('../controllers/notificationController');

router.use(auth);
router.get('/', c.list);
router.post('/', c.create);
router.patch('/all/read', c.markAllRead);
router.delete('/read', c.clearRead);
router.patch('/:id/read', c.markRead);
router.delete('/:id', c.remove);

module.exports = router;
