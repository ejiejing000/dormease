/**
 * Member A: Core Controller - User Management
 */
const UserModel = require('../models/UserModel');
const { hashPassword, verifyPassword, signToken } = require('../middleware/auth');

class UserController {
    // POST /api/users/login  (public) -> 200 with token, 400 missing fields, 401 wrong login, 403 inactive
    static login(req, res) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ success: false, message: 'Email and password are required.' });
            }
            const account = UserModel.getByEmail(String(email).trim().toLowerCase());
            if (!account || !verifyPassword(password, account.password_hash)) {
                return res.status(401).json({ success: false, message: 'Wrong email or password.' });
            }
            if (account.status !== 'ACTIVE') {
                return res.status(403).json({ success: false, message: 'This account is not active.' });
            }
            if (!account.password_hash.includes(':')) {
                UserModel.setPassword(account.id, hashPassword(password)); // upgrade old plain password
            }
            const user = UserModel.getById(account.id);
            UserModel.logAudit(user.id, 'LOGIN', 'users', user.id, `${user.full_name} logged in`);
            return res.status(200).json({
                success: true,
                message: 'Login successful',
                data: { token: signToken(user), user }
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Login failed', error: error.message });
        }
    }

    // GET /api/users/me  (logged in)
    static me(req, res) {
        return res.status(200).json({ success: true, data: req.user });
    }

    // GET /api/users
    static getAll(req, res) {
        try {
            const { role, status } = req.query;
            const users = UserModel.getAll({ role, status });
            return res.status(200).json({
                success: true,
                message: 'Users retrieved successfully',
                data: users
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve users',
                error: error.message
            });
        }
    }

    // GET /api/users/:id
    static getById(req, res) {
        try {
            const { id } = req.params;
            const user = UserModel.getById(id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: `User with ID ${id} not found`
                });
            }
            return res.status(200).json({
                success: true,
                message: 'User details retrieved',
                data: user
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }

    // POST /api/users
    static create(req, res) {
        try {
            const { role_id, full_name, email, phone, status, password } = req.body;

            // Field validation
            if (!role_id || !full_name || !email || !phone) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: role_id, full_name, email, and phone are mandatory.'
                });
            }

            // Email format check
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid email address format'
                });
            }

            // Check duplicate email
            const existing = UserModel.getByEmail(email);
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: `A user with email ${email} already exists.`
                });
            }

            if (password !== undefined && String(password).length < 8) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 8 characters.'
                });
            }

            const newUser = UserModel.create({
                role_id: Number(role_id),
                full_name: full_name.trim(),
                email: email.trim().toLowerCase(),
                phone: phone.trim(),
                status: status || 'ACTIVE',
                password_hash: hashPassword(password || 'dormease123')
            });

            return res.status(201).json({
                success: true,
                message: 'User created successfully',
                data: newUser
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to create user',
                error: error.message
            });
        }
    }

    // PUT /api/users/:id
    static update(req, res) {
        try {
            const { id } = req.params;
            const { full_name, email, phone, status, role_id } = req.body;

            const existing = UserModel.getById(id);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: `User with ID ${id} not found.`
                });
            }

            const updatedUser = UserModel.update(id, {
                full_name,
                email,
                phone,
                status,
                role_id: role_id ? Number(role_id) : undefined
            });

            return res.status(200).json({
                success: true,
                message: `User profile updated successfully`,
                data: updatedUser
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to update user',
                error: error.message
            });
        }
    }

    // DELETE /api/users/:id
    static delete(req, res) {
        try {
            const { id } = req.params;
            const existing = UserModel.getById(id);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: `User with ID ${id} not found.`
                });
            }

            const deleted = UserModel.delete(id);
            if (!deleted) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete user due to associated records (leases, readings, or properties).'
                });
            }

            return res.status(200).json({
                success: true,
                message: `User ${existing.full_name} has been successfully deleted.`
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to delete user. Check foreign key associations.',
                error: error.message
            });
        }
    }

    // GET /api/users/reports/roles-inner-join
    static getRolesJoinReport(req, res) {
        try {
            const reportData = UserModel.getRolesJoinReport();
            return res.status(200).json({
                success: true,
                joinType: 'INNER JOIN',
                description: 'Users matched with their explicit Role definitions and permissions',
                count: reportData.length,
                data: reportData
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to generate INNER JOIN report',
                error: error.message
            });
        }
    }
}

module.exports = UserController;
