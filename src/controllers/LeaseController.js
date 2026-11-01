/**
 * Member C: Transactions Controller - Lease & Tenancy Management
 */
const LeaseModel = require('../models/LeaseModel');
const RoomModel = require('../models/RoomModel');

class LeaseController {
    // GET /api/leases
    static getAll(req, res) {
        try {
            const { status, room_id, tenant_id } = req.query;
            const leases = LeaseModel.getAll({ status, room_id, tenant_id });
            return res.status(200).json({
                success: true,
                message: 'Leases retrieved successfully',
                count: leases.length,
                data: leases
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve leases',
                error: error.message
            });
        }
    }

    // GET /api/leases/:id
    static getById(req, res) {
        try {
            const { id } = req.params;
            const lease = LeaseModel.getById(id);
            if (!lease) {
                return res.status(404).json({
                    success: false,
                    message: `Lease with ID ${id} not found`
                });
            }
            return res.status(200).json({
                success: true,
                message: 'Lease contract details retrieved',
                data: lease
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve lease',
                error: error.message
            });
        }
    }

    // POST /api/leases
    static create(req, res) {
        try {
            const { room_id, tenant_id, lease_start_date, lease_end_date, monthly_rent_amount, security_deposit, check_in_date } = req.body;

            if (!room_id || !tenant_id || !lease_start_date || !lease_end_date || !monthly_rent_amount) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required lease fields: room_id, tenant_id, lease_start_date, lease_end_date, monthly_rent_amount are required.'
                });
            }

            // Verify room exists and is not occupied
            const room = RoomModel.getById(room_id);
            if (!room) {
                return res.status(404).json({
                    success: false,
                    message: `Room ID ${room_id} does not exist.`
                });
            }

            if (room.status === 'OCCUPIED') {
                return res.status(400).json({
                    success: false,
                    message: `Room ${room.room_number} is currently OCCUPIED and cannot be leased.`
                });
            }

            // Security deposit must be at least 2 months of rent
            if (security_deposit !== undefined && security_deposit !== null && security_deposit !== '') {
                const minimumDeposit = Number(monthly_rent_amount) * 2;
                if (Number(security_deposit) < minimumDeposit) {
                    return res.status(400).json({
                        success: false,
                        message: `Security deposit must be at least 2 months of rent (${minimumDeposit}).`
                    });
                }
            }

	    const newLease = LeaseModel.create({
                room_id: Number(room_id),
                tenant_id: Number(tenant_id),
                lease_start_date,
                lease_end_date,
                monthly_rent_amount: Number(monthly_rent_amount),
                security_deposit: security_deposit ? Number(security_deposit) : Number(monthly_rent_amount) * 2,
                check_in_date
            });

            return res.status(201).json({
                success: true,
                message: 'Lease contract generated and room status updated to OCCUPIED',
                data: newLease
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to create lease contract',
                error: error.message
            });
        }
    }

    // PUT /api/leases/:id
    static update(req, res) {
        try {
            const { id } = req.params;
            const { lease_end_date, monthly_rent_amount, lease_status, check_out_date } = req.body;

            const existing = LeaseModel.getById(id);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: `Lease with ID ${id} not found.`
                });
            }

            const updatedLease = LeaseModel.update(id, {
                lease_end_date,
                monthly_rent_amount: monthly_rent_amount ? Number(monthly_rent_amount) : undefined,
                lease_status,
                check_out_date
            });

            return res.status(200).json({
                success: true,
                message: 'Lease contract updated successfully',
                data: updatedLease
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to update lease',
                error: error.message
            });
        }
    }

    // DELETE /api/leases/:id
    static delete(req, res) {
        try {
            const { id } = req.params;
            const existing = LeaseModel.getById(id);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: `Lease with ID ${id} not found.`
                });
            }

            const deleted = LeaseModel.delete(id);
            if (!deleted) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete lease contract due to associated billing invoices.'
                });
            }

            return res.status(200).json({
                success: true,
                message: `Lease #${id} deleted and Room ${existing.room_number} freed back to AVAILABLE.`
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to delete lease. Active invoices exist.',
                error: error.message
            });
        }
    }

    // GET /api/leases/reports/tenancy-inner-join
    static getTenancyJoinReport(req, res) {
        try {
            const report = LeaseModel.getLeaseTenancyInnerJoinReport();
            return res.status(200).json({
                success: true,
                joinType: 'INNER JOIN',
                description: 'Leases matched strictly with active Student Tenants, Room specifications, and Properties',
                count: report.length,
                data: report
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to generate INNER JOIN report',
                error: error.message
            });
        }
    }

    // GET /api/leases/metadata/tenants
    static getTenants(req, res) {
        try {
            const tenants = LeaseModel.getAllTenants();
            return res.status(200).json({
                success: true,
                count: tenants.length,
                data: tenants
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // PUT /api/leases/tenants/:id
    static updateTenant(req, res) {
        try {
            const { id } = req.params;
            const updated = LeaseModel.updateTenant(id, req.body);
            if (!updated) {
                return res.status(404).json({
                    success: false,
                    message: `Tenant with ID ${id} not found.`
                });
            }
            return res.status(200).json({
                success: true,
                message: 'Tenant details updated successfully',
                data: updated
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = LeaseController;
