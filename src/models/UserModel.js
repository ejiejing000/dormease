/**
 * Member A: Core Slice - User & Role Model
 * Tables: users, roles (logAudit helper writes audit_logs; Member 6 reads them)
 */
const db = require('../database/db');

class UserModel {
    // List all users with their role name
    static getAll({ role, status } = {}) {
        let sql = `
            SELECT u.id, u.role_id, r.role_name, u.full_name, u.email, u.phone, u.status, u.created_at
            FROM users u
            INNER JOIN roles r ON u.role_id = r.id
            WHERE 1=1
        `;
        const params = [];
        if (role) {
            sql += ` AND r.role_name = ?`;
            params.push(role);
        }
        if (status) {
            sql += ` AND u.status = ?`;
            params.push(status);
        }
        sql += ` ORDER BY u.id ASC`;
        return db.query(sql, params);
    }

    // Get user by ID
    static getById(id) {
        const sql = `
            SELECT u.id, u.role_id, r.role_name, u.full_name, u.email, u.phone, u.status, u.created_at
            FROM users u
            INNER JOIN roles r ON u.role_id = r.id
            WHERE u.id = ?
        `;
        return db.get(sql, [id]);
    }

    // Get user by email for authentication / duplicate checks
    static getByEmail(email) {
        const sql = `SELECT * FROM users WHERE email = ?`;
        return db.get(sql, [email]);
    }

    // Create a new user
    static create({ role_id, full_name, email, password_hash, phone, status = 'ACTIVE' }) {
        const sql = `
            INSERT INTO users (role_id, full_name, email, password_hash, phone, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const result = db.run(sql, [role_id, full_name, email, password_hash || 'dormease123', phone, status]);
        this.logAudit(result.lastInsertRowid, 'CREATE_USER', 'users', result.lastInsertRowid, `Created user ${full_name}`);
        return this.getById(result.lastInsertRowid);
    }

    // Save a new password hash for a user
    static setPassword(id, passwordHash) {
        return db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, id]);
    }

    // Update user
    static update(id, { full_name, email, phone, status, role_id }) {
        const current = this.getById(id);
        if (!current) return null;

        const updatedFullName = full_name !== undefined ? full_name : current.full_name;
        const updatedEmail = email !== undefined ? email : current.email;
        const updatedPhone = phone !== undefined ? phone : current.phone;
        const updatedStatus = status !== undefined ? status : current.status;
        const updatedRoleId = role_id !== undefined ? role_id : current.role_id;

        const sql = `
            UPDATE users
            SET full_name = ?, email = ?, phone = ?, status = ?, role_id = ?
            WHERE id = ?
        `;
        db.run(sql, [updatedFullName, updatedEmail, updatedPhone, updatedStatus, updatedRoleId, id]);
        this.logAudit(id, 'UPDATE_USER', 'users', id, `Updated user details for ID ${id}`);
        return this.getById(id);
    }

    // Delete user
    static delete(id) {
        const current = this.getById(id);
        if (!current) return false;

        const sql = `DELETE FROM users WHERE id = ?`;
        const result = db.run(sql, [id]);
        this.logAudit(null, 'DELETE_USER', 'users', id, `Deleted user ${current.full_name} (${current.email})`);
        return result.changes > 0;
    }

    // Member A's Join Report: Users and Roles INNER JOIN
    static getRolesJoinReport() {
        const sql = `
            SELECT u.id, u.full_name, u.email, u.phone, u.status, r.role_name, r.description AS role_description, u.created_at
            FROM users u
            INNER JOIN roles r ON u.role_id = r.id
            ORDER BY u.id ASC
        `;
        return db.query(sql);
    }

    // Audit Logger helper
    static logAudit(userId, actionType, entityName, recordId, details) {
        try {
            const sql = `INSERT INTO audit_logs (user_id, action_type, entity_name, record_id, details) VALUES (?, ?, ?, ?, ?)`;
            db.run(sql, [userId, actionType, entityName, recordId, details]);
        } catch (err) {
            console.error('Audit logging error:', err.message);
        }
    }
}

module.exports = UserModel;
