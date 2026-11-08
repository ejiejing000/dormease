const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const c = require('../controllers/billPreviewController');

router.post('/', auth, c.preview);

module.exports = router;
