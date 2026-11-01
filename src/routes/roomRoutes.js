/**
 * Member B: Master Data Routes - Rooms & Amenities
 */
const express = require('express');
const router = express.Router();
const RoomController = require('../controllers/RoomController');
const { authorize } = require('../middleware/auth');

// Join Report and Lookups first
router.get('/reports/amenities-left-join', RoomController.getAmenitiesJoinReport);
router.get('/metadata/lookups', RoomController.getMetadata);

// REST CRUD
router.get('/', RoomController.getAll);
router.get('/:id', RoomController.getById);
router.post('/', authorize('LANDLORD', 'STAFF'), RoomController.create);
router.put('/:id', authorize('LANDLORD', 'STAFF'), RoomController.update);
router.delete('/:id', authorize('LANDLORD', 'STAFF'), RoomController.delete);

module.exports = router;
