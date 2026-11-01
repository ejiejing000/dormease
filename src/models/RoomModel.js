/**
 * Member B: Master Data Slice - Rooms & Amenities Model
 * Tables: properties, room_categories, rooms, amenities, room_amenities
 */
const db = require('../database/db');
const UserModel = require('./UserModel');

class RoomModel {
    // List all rooms with property name, category name, base rate
    static getAll({ status, property_id, category_id, floor, aircon } = {}) {
        let sql = `
            SELECT r.id, r.room_number, r.floor_number, r.aircon_equipped, r.status,
                   p.id AS property_id, p.property_name, p.address AS property_address,
                   c.id AS category_id, c.category_name, c.base_rate, c.max_occupants
            FROM rooms r
            INNER JOIN properties p ON r.property_id = p.id
            INNER JOIN room_categories c ON r.category_id = c.id
            WHERE 1=1
        `;
        const params = [];
        if (status) {
            sql += ` AND r.status = ?`;
            params.push(status);
        }
        if (property_id) {
            sql += ` AND r.property_id = ?`;
            params.push(property_id);
        }
        if (category_id) {
            sql += ` AND r.category_id = ?`;
            params.push(category_id);
        }
        if (floor) {
            sql += ` AND r.floor_number = ?`;
            params.push(floor);
        }
        if (aircon) {
            sql += ` AND r.aircon_equipped = ?`;
            params.push(aircon);
        }
        sql += ` ORDER BY r.floor_number ASC, r.room_number ASC`;
        return db.query(sql, params);
    }

    // Get room by ID with attached amenities
    static getById(id) {
        const sql = `
            SELECT r.id, r.property_id, r.category_id, r.room_number, r.floor_number, r.aircon_equipped, r.status,
                   p.property_name, p.address AS property_address,
                   c.category_name, c.base_rate, c.max_occupants
            FROM rooms r
            INNER JOIN properties p ON r.property_id = p.id
            INNER JOIN room_categories c ON r.category_id = c.id
            WHERE r.id = ?
        `;
        const room = db.get(sql, [id]);
        if (!room) return null;

        // Fetch amenities for this room
        const amenitiesSql = `
            SELECT a.id, a.amenity_name, a.icon, a.is_free
            FROM amenities a
            INNER JOIN room_amenities ra ON a.id = ra.amenity_id
            WHERE ra.room_id = ?
        `;
        room.amenities = db.query(amenitiesSql, [id]);
        return room;
    }
        // Check if a room number is already used in a property
       static roomNumberExists(property_id, room_number) {
           const row = db.get(
               'SELECT id FROM rooms WHERE property_id = ? AND room_number = ?',
               [property_id, room_number]
           );
           return !!row;
       }
    // Create a new room
    static create({ property_id, category_id, room_number, floor_number = 1, aircon_equipped = 0, status = 'AVAILABLE', amenity_ids = [] }) {
        const sql = `
            INSERT INTO rooms (property_id, category_id, room_number, floor_number, aircon_equipped, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const result = db.run(sql, [property_id, category_id, room_number, floor_number, aircon_equipped ? 1 : 0, status]);
        const roomId = result.lastInsertRowid;

        // Associate amenities if provided
        if (Array.isArray(amenity_ids) && amenity_ids.length > 0) {
            for (const amenityId of amenity_ids) {
                db.run('INSERT OR IGNORE INTO room_amenities (room_id, amenity_id) VALUES (?, ?)', [roomId, amenityId]);
            }
        }

        UserModel.logAudit(null, 'CREATE_ROOM', 'rooms', roomId, `Created Room ${room_number} in Property ${property_id}`);
        return this.getById(roomId);
    }

    // Update room
    static update(id, { category_id, room_number, floor_number, aircon_equipped, status, amenity_ids }) {
        const current = this.getById(id);
        if (!current) return null;

        const updatedCat = category_id !== undefined ? category_id : current.category_id;
        const updatedNum = room_number !== undefined ? room_number : current.room_number;
        const updatedFloor = floor_number !== undefined ? floor_number : current.floor_number;
        const updatedAircon = aircon_equipped !== undefined ? (aircon_equipped ? 1 : 0) : current.aircon_equipped;
        const updatedStatus = status !== undefined ? status : current.status;

        const sql = `
            UPDATE rooms
            SET category_id = ?, room_number = ?, floor_number = ?, aircon_equipped = ?, status = ?
            WHERE id = ?
        `;
        db.run(sql, [updatedCat, updatedNum, updatedFloor, updatedAircon, updatedStatus, id]);

        if (Array.isArray(amenity_ids)) {
            db.run('DELETE FROM room_amenities WHERE room_id = ?', [id]);
            for (const aId of amenity_ids) {
                db.run('INSERT OR IGNORE INTO room_amenities (room_id, amenity_id) VALUES (?, ?)', [id, aId]);
            }
        }

        UserModel.logAudit(null, 'UPDATE_ROOM', 'rooms', id, `Updated Room ${id} (${updatedNum})`);
        return this.getById(id);
    }
    // Check if any lease (active or old) refers to this room
    static hasLeases(id) {
        const row = db.get('SELECT COUNT(*) AS count FROM leases WHERE room_id = ?', [id]);
        return row.count > 0;
    }
    // Delete room
    static delete(id) {
        const current = this.getById(id);
        if (!current) return false;

        const sql = `DELETE FROM rooms WHERE id = ?`;
        const result = db.run(sql, [id]);
        UserModel.logAudit(null, 'DELETE_ROOM', 'rooms', id, `Deleted Room ${current.room_number}`);
        return result.changes > 0;
    }

    // Member B's Join Report: LEFT JOIN between Rooms, Categories, and Amenities
    static getRoomAmenitiesLeftJoinReport() {
        const sql = `
            SELECT r.id AS room_id, r.room_number, r.floor_number, r.status,
                   c.category_name, c.base_rate, c.max_occupants,
                   GROUP_CONCAT(a.amenity_name, ', ') AS amenities_list
            FROM rooms r
            LEFT JOIN room_categories c ON r.category_id = c.id
            LEFT JOIN room_amenities ra ON r.id = ra.room_id
            LEFT JOIN amenities a ON ra.amenity_id = a.id
            GROUP BY r.id
            ORDER BY r.room_number ASC
        `;
        return db.query(sql);
    }

    // Master Reference Lookups
    static getCategories() {
        return db.query('SELECT * FROM room_categories ORDER BY base_rate ASC');
    }

    static getProperties() {
        return db.query('SELECT * FROM properties ORDER BY property_name ASC');
    }

    static getAllAmenities() {
        return db.query('SELECT * FROM amenities ORDER BY amenity_name ASC');
    }
}

module.exports = RoomModel;
