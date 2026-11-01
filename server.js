/**
 * DormEase: Integrated Student Boarding House Room Reservation
 * and Utility Billing Management System
 * Main Express Application Server (Node.js MVC Architecture)
 */
require('dotenv').config();
const express = require('express');
const path = require('path');

// Initialize database
const db = require('./src/database/db');

// Import Routes for all 6 Member Slices
const userRoutes = require('./src/routes/userRoutes');       // Member A: Core
const roomRoutes = require('./src/routes/roomRoutes');       // Member B: Master Data
const leaseRoutes = require('./src/routes/leaseRoutes');     // Member C: Transactions
const utilityRoutes = require('./src/routes/utilityRoutes'); // Member D: Unique Feature 1 (Tier Engine)
const invoiceRoutes = require('./src/routes/invoiceRoutes'); // Member E: Unique Feature 2 (Receipts & Invoices)
const reportRoutes = require('./src/routes/reportRoutes');   // Member F: Join Reports & Reservations

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'src/public')));

// Request logger for audit & defense demonstrations
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Login gate: every /api call needs a token (401), except health check and login.
// Each route file then adds authorize(...roles) where a role restriction applies (403).
const { authenticate } = require('./src/middleware/auth');
app.use('/api', (req, res, next) => {
    if (req.path === '/health' || (req.method === 'POST' && req.path === '/users/login')) return next();
    return authenticate(req, res, next);
});

// API Routes Mounting (Strict MVC Routing)
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/leases', leaseRoutes);
app.use('/api/readings', utilityRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/reports', reportRoutes);

// Healthcheck & System Info endpoint
app.get('/api/health', (req, res) => {
    return res.status(200).json({
        success: true,
        project: 'DormEase Integrated Boarding House & Utility Billing Management System',
        status: 'ONLINE',
        track: 'Merged Track (DBMS1 + SIA)',
        version: '1.0.0',
        membersCount: 6,
        tablesCount: 16,
        timestamp: new Date().toISOString()
    });
});

// Fallback for SPA routing to index.html
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        return res.sendFile(path.join(__dirname, 'src/public/index.html'));
    }
    next();
});

// Centralized 404 handler for API endpoints
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Endpoint ${req.method} ${req.url} does not exist.`
    });
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal server error occurred',
        error: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message
    });
});

// Start Server
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`================================================================`);
        console.log(` DormEase System Running at: http://localhost:${PORT}`);
        console.log(` Database: SQLite Native Driver (16 Tables Active)`);
        console.log(` Track: Merged DBMS1 + SIA Course Project (6 Members)`);
        console.log(`================================================================`);
    });
}

module.exports = app;
