const express = require('express');
const router = express.Router();
const c = require('../controllers/publicRoomController');

// Deliberately no auth(): the public room catalogue is readable by visitors.
router.get('/rooms', c.listRooms);
router.get('/rooms/:id', c.room);
router.get('/houses', c.filters);

module.exports = router;
