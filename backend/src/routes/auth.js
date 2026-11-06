const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const auth = require('../middleware/auth');
const c = require('../controllers/authController');

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

router.post('/login', loginLimit, c.login);
router.get('/me', auth, c.me);
router.post('/change-password', auth, c.changePassword);
router.post('/logout', auth, c.logout);

module.exports = router;
