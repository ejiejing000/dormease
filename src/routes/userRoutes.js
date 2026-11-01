/**
 * Member 1: Core Routes - Users & Security
 */
const express = require('express');
const router = express.Router();
const UserController = require('../controllers/UserController');
const { authorize } = require('../middleware/auth');

// Public login (server.js lets this one path through without a token)
router.post('/login', UserController.login);
// Who am I? (any logged-in user)
router.get('/me', UserController.me);

// Join Report (Keep specific routes above /:id)
router.get('/reports/roles-inner-join', authorize('LANDLORD', 'STAFF'), UserController.getRolesJoinReport);

// Standard REST CRUD endpoints: reading = landlord/staff, changing accounts = landlord only
router.get('/', authorize('LANDLORD', 'STAFF'), UserController.getAll);
router.get('/:id', authorize('LANDLORD', 'STAFF'), UserController.getById);
router.post('/', authorize('LANDLORD'), UserController.create);
router.put('/:id', authorize('LANDLORD'), UserController.update);
router.delete('/:id', authorize('LANDLORD'), UserController.delete);

module.exports = router;
