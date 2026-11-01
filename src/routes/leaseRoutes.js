/**
 * Member C: Transactions Routes - Leases & Contracts
 */
const express = require('express');
const router = express.Router();
const LeaseController = require('../controllers/LeaseController');
const { authorize } = require('../middleware/auth');

// Join Reports and Metadata
router.get('/reports/tenancy-inner-join', LeaseController.getTenancyJoinReport);
router.get('/metadata/tenants', LeaseController.getTenants);
router.put('/tenants/:id', authorize('LANDLORD', 'STAFF'), LeaseController.updateTenant);

// REST CRUD
router.get('/', LeaseController.getAll);
router.get('/:id', LeaseController.getById);
router.post('/', authorize('LANDLORD', 'STAFF'), LeaseController.create);
router.put('/:id', authorize('LANDLORD', 'STAFF'), LeaseController.update);
router.delete('/:id', authorize('LANDLORD', 'STAFF'), LeaseController.delete);

module.exports = router;
