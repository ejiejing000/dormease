/**
 * Member B: Master Data Controller - Room & Amenity Management
 */
const RoomModel = require('../models/RoomModel');

class RoomController {
    // GET /api/rooms
    static getAll(req, res) {
        try {
            const { status, property_id, category_id, floor, aircon } = req.query;
            const rooms = RoomModel.getAll({ status, property_id, category_id, floor, aircon });
            return res.status(200).json({
                success: true,
                message: 'Rooms retrieved successfully',
                count: rooms.length,
                data: rooms
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve rooms',
                error: error.message
            });
        }
    }

    // GET /api/rooms/:id
    static getById(req, res) {
        try {
            const { id } = req.params;
            const room = RoomModel.getById(id);
            if (!room) {
                return res.status(404).json({
                    success: false,
                    message: `Room with ID ${id} not found`
                });
            }
            return res.status(200).json({
                success: true,
                message: 'Room details retrieved',
                data: room
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve room',
                error: error.message
            });
        }
    }

    // POST /api/rooms
    static create(req, res) {
        try {
            const { property_id, category_id, room_number, floor_number, aircon_equipped, status, amenity_ids } = req.body;
            if (!property_id || !category_id || !room_number) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: property_id, category_id, and room_number are mandatory.'
                });
            }
           const number = String(room_number).trim();
           if (RoomModel.roomNumberExists(Number(property_id), number)) {
               return res.status(409).json({
                   success: false,
                   message: `Room ${number} already exists in this property.`
               });
           }
            const newRoom = RoomModel.create({
                property_id: Number(property_id),
                category_id: Number(category_id),
                room_number: String(room_number).trim(),
                floor_number: floor_number ? Number(floor_number) : 1,
                aircon_equipped: !!aircon_equipped,
                status: status || 'AVAILABLE',
                amenity_ids: amenity_ids || []
            });

            return res.status(201).json({
                success: true,
                message: 'Room created successfully',
                data: newRoom
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to create room',
                error: error.message
            });
        }
    }

    // PUT /api/rooms/:id
    static update(req, res) {
        try {
            const { id } = req.params;
            const { category_id, room_number, floor_number, aircon_equipped, status, amenity_ids } = req.body;

            const existing = RoomModel.getById(id);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: `Room with ID ${id} not found.`
                });
            }

            const updatedRoom = RoomModel.update(id, {
                category_id: category_id ? Number(category_id) : undefined,
                room_number: room_number ? String(room_number).trim() : undefined,
                floor_number: floor_number !== undefined ? Number(floor_number) : undefined,
                aircon_equipped: aircon_equipped !== undefined ? !!aircon_equipped : undefined,
                status,
                amenity_ids
            });

            return res.status(200).json({
                success: true,
                message: 'Room updated successfully',
                data: updatedRoom
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to update room',
                error: error.message
            });
        }
    }

    // DELETE /api/rooms/:id
    static delete(req, res) {
        try {
            const { id } = req.params;
            const existing = RoomModel.getById(id);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: `Room with ID ${id} not found.`
                });
            }

            if (existing.status === 'OCCUPIED') {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete an OCCUPIED room with an active lease. Please terminate the lease first.'
                });
            }
           if (RoomModel.hasLeases(id)) {
               return res.status(400).json({
                   success: false,
                   message: 'Cannot delete a room that has lease records. Terminate or remove the lease first.'
               });
           }
            const deleted = RoomModel.delete(id);
            if (!deleted) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete room due to related data.'
                });
            }

            return res.status(200).json({
                success: true,
                message: `Room ${existing.room_number} deleted successfully.`
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to delete room. Check foreign key associations (utility meters, leases).',
                error: error.message
            });
        }
    }

    // GET /api/rooms/reports/amenities-left-join
    static getAmenitiesJoinReport(req, res) {
        try {
            const report = RoomModel.getRoomAmenitiesLeftJoinReport();
            return res.status(200).json({
                success: true,
                joinType: 'LEFT JOIN',
                description: 'All rooms with room categories and amenities (preserves rooms with zero assigned amenities)',
                count: report.length,
                data: report
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to generate LEFT JOIN report',
                error: error.message
            });
        }
    }

    // Lookups
    static getMetadata(req, res) {
        try {
            const properties = RoomModel.getProperties();
            const categories = RoomModel.getCategories();
            const amenities = RoomModel.getAllAmenities();
            return res.status(200).json({
                success: true,
                data: { properties, categories, amenities }
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = RoomController;
