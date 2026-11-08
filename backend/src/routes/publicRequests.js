const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const c = require('../controllers/publicRequestController');

// Deliberately no auth(): a visitor can ask for a room without an account.
const requestLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false });

router.post('/reservation-requests', requestLimit, c.submitRequest);
router.get('/reservation-requests/status', c.requestStatus);

module.exports = router;
