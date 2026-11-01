/**
 * Member C: Transactions Slice - Leases & Tenants Model
 * Tables: tenants, reservations, leases
 */
const db = require('../database/db');
const UserModel = require('./UserModel');

class LeaseModel {
    // List all leases with tenant name, room number, and dates
    static getAll({ status, room_id, tenant_id } = {}) {
        let sql = `
            SELECT l.id, l.room_id, l.tenant_id, l.lease_start_date, l.lease_end_date,
                   l.monthly_rent_amount, l.security_deposit, l.lease_status,
                   l.check_in_date, l.check_out_date, l.created_at,
                   r.room_number, p.property_name,
                   u.full_name AS tenant_name, u.email AS tenant_email, u.phone AS tenant_phone,
                   t.student_id_number, t.university_or_company
            FROM leases l
            INNER JOIN rooms r ON l.room_id = r.id
            INNER JOIN properties p ON r.property_id = p.id
            INNER JOIN tenants t ON l.tenant_id = t.id
            INNER JOIN users u ON t.user_id = u.id
            WHERE 1=1
        `;
        const params = [];
        if (status) {
            sql += ` AND l.lease_status = ?`;
            params.push(status);
        }
        if (room_id) {
            sql += ` AND l.room_id = ?`;
            params.push(room_id);
        }
        if (tenant_id) {
            sql += ` AND l.tenant_id = ?`;
            params.push(tenant_id);
        }
        sql += ` ORDER BY l.id DESC`;
        return db.query(sql, params);
    }

    // Get lease by ID
    static getById(id) {
        const sql = `
            SELECT l.id, l.room_id, l.tenant_id, l.lease_start_date, l.lease_end_date,
                   l.monthly_rent_amount, l.security_deposit, l.lease_status,
                   l.check_in_date, l.check_out_date, l.created_at,
                   r.room_number, p.property_name,
                   u.full_name AS tenant_name, u.email AS tenant_email, u.phone AS tenant_phone,
                   t.student_id_number, t.university_or_company, t.emergency_contact_name, t.emergency_contact_phone
            FROM leases l
            INNER JOIN rooms r ON l.room_id = r.id
            INNER JOIN properties p ON r.property_id = p.id
            INNER JOIN tenants t ON l.tenant_id = t.id
            INNER JOIN users u ON t.user_id = u.id
            WHERE l.id = ?
        `;
        return db.get(sql, [id]);
    }

    // Create a new lease contract and mark room as OCCUPIED
    static create({ room_id, tenant_id, lease_start_date, lease_end_date, monthly_rent_amount, security_deposit, check_in_date }) {
        const sql = `
            INSERT INTO leases (room_id, tenant_id, lease_start_date, lease_end_date, monthly_rent_amount, security_deposit, lease_status, check_in_date)
            VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
        `;
        const result = db.run(sql, [
            room_id,
            tenant_id,
            lease_start_date,
            lease_end_date,
            monthly_rent_amount,
            security_deposit,
            check_in_date || lease_start_date
        ]);

        // Auto-update room status to OCCUPIED
        db.run(`UPDATE rooms SET status = 'OCCUPIED' WHERE id = ?`, [room_id]);

        UserModel.logAudit(null, 'CREATE_LEASE', 'leases', result.lastInsertRowid, `Created Lease ${result.lastInsertRowid} for Room ${room_id}`);
        return this.getById(result.lastInsertRowid);
    }

    // Update lease terms
    static update(id, { lease_end_date, monthly_rent_amount, lease_status, check_out_date }) {
        const current = this.getById(id);
        if (!current) return null;

        const updatedEndDate = lease_end_date !== undefined ? lease_end_date : current.lease_end_date;
        const updatedRent = monthly_rent_amount !== undefined ? monthly_rent_amount : current.monthly_rent_amount;
        const updatedStatus = lease_status !== undefined ? lease_status : current.lease_status;
        const updatedCheckout = check_out_date !== undefined ? check_out_date : current.check_out_date;

        const sql = `
            UPDATE leases
            SET lease_end_date = ?, monthly_rent_amount = ?, lease_status = ?, check_out_date = ?
            WHERE id = ?
        `;
        db.run(sql, [updatedEndDate, updatedRent, updatedStatus, updatedCheckout, id]);

        // If status changed to TERMINATED or EXPIRED, free up the room
        if (updatedStatus === 'TERMINATED' || updatedStatus === 'EXPIRED') {
            db.run(`UPDATE rooms SET status = 'AVAILABLE' WHERE id = ?`, [current.room_id]);
        }

        UserModel.logAudit(null, 'UPDATE_LEASE', 'leases', id, `Updated Lease ${id} to status ${updatedStatus}`);
        return this.getById(id);
    }

    // Delete or cancel lease
    static delete(id) {
        const current = this.getById(id);
        if (!current) return false;

        const sql = `DELETE FROM leases WHERE id = ?`;
        const result = db.run(sql, [id]);

        // Free up the room
        db.run(`UPDATE rooms SET status = 'AVAILABLE' WHERE id = ?`, [current.room_id]);

        UserModel.logAudit(null, 'DELETE_LEASE', 'leases', id, `Deleted Lease ${id} and set Room ${current.room_number} to AVAILABLE`);
        return result.changes > 0;
    }

    // Member C's Join Report: Leases, Tenants, and Rooms INNER JOIN
    static getLeaseTenancyInnerJoinReport() {
        const sql = `
            SELECT l.id AS lease_id, l.monthly_rent_amount, l.security_deposit,
                   l.lease_start_date, l.lease_end_date, l.lease_status,
                   r.room_number, p.property_name,
                   u.full_name AS tenant_name, u.phone AS tenant_phone,
                   t.student_id_number, t.university_or_company,
                   t.emergency_contact_name, t.emergency_contact_phone
            FROM leases l
            INNER JOIN tenants t ON l.tenant_id = t.id
            INNER JOIN users u ON t.user_id = u.id
            INNER JOIN rooms r ON l.room_id = r.id
            INNER JOIN properties p ON r.property_id = p.id
            ORDER BY l.lease_start_date DESC
        `;
        return db.query(sql);
    }

    // Tenant Directory Helper
    static getAllTenants() {
        const sql = `
            SELECT t.id, t.user_id, u.full_name, u.email, u.phone,
                   t.university_or_company, t.student_id_number,
                   t.emergency_contact_name, t.emergency_contact_phone,
                   l.id AS active_lease_id, r.room_number, l.monthly_rent_amount, l.lease_status
            FROM tenants t
            INNER JOIN users u ON t.user_id = u.id
            LEFT JOIN leases l ON t.id = l.tenant_id AND l.lease_status = 'ACTIVE'
            LEFT JOIN rooms r ON l.room_id = r.id
            ORDER BY u.full_name ASC
        `;
        return db.query(sql);
    }

    // Update Tenant Details
    static updateTenant(id, { university_or_company, student_id_number, emergency_contact_name, emergency_contact_phone } = {}) {
        const current = db.get(`SELECT * FROM tenants WHERE id = ?`, [id]);
        if (!current) return null;

        const updatedUni = university_or_company !== undefined ? university_or_company : current.university_or_company;
        const updatedStudentId = student_id_number !== undefined ? student_id_number : current.student_id_number;
        const updatedEmergName = emergency_contact_name !== undefined ? emergency_contact_name : current.emergency_contact_name;
        const updatedEmergPhone = emergency_contact_phone !== undefined ? emergency_contact_phone : current.emergency_contact_phone;

        const sql = `
            UPDATE tenants
            SET university_or_company = ?,
                student_id_number = ?,
                emergency_contact_name = ?,
                emergency_contact_phone = ?
            WHERE id = ?
        `;
        db.run(sql, [updatedUni, updatedStudentId, updatedEmergName, updatedEmergPhone, id]);
        return db.get(`
            SELECT t.id, t.user_id, u.full_name, u.email, u.phone,
                   t.university_or_company, t.student_id_number,
                   t.emergency_contact_name, t.emergency_contact_phone
            FROM tenants t
            INNER JOIN users u ON t.user_id = u.id
            WHERE t.id = ?
        `, [id]);
    }
}

module.exports = LeaseModel;
