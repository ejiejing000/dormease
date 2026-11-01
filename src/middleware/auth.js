/**
 * Member 1: Authentication and authorization
 * - passwords are stored as "salt:hash" (scrypt, built into Node)
 * - login returns a signed token (HMAC-SHA256 with JWT_SECRET from .env)
 * - authenticate  -> 401 when the token is missing, wrong or expired
 * - authorize     -> 403 when the logged-in role is not allowed
 */
const crypto = require('crypto');
const UserModel = require('../models/UserModel');

const TOKEN_HOURS = 8;
const secret = () => process.env.JWT_SECRET || 'dormease_dev_secret_change_me';

function hashPassword(plain) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(plain), salt, 32).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
    if (!stored) return false;
    if (!stored.includes(':')) {
        // old demo accounts still have a plain password; accept it (login upgrades it to a hash)
        return stored === String(plain);
    }
    const [salt, hash] = stored.split(':');
    const test = crypto.scryptSync(String(plain), salt, 32);
    const real = Buffer.from(hash, 'hex');
    return real.length === test.length && crypto.timingSafeEqual(real, test);
}

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

function signToken(user) {
    const body = b64({ id: user.id, exp: Date.now() + TOKEN_HOURS * 3600 * 1000 });
    return `${body}.${sign(body)}`;
}

function verifyToken(token) {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const expected = sign(body);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp > Date.now() ? payload : null;
}

// 401 Unauthorized: who are you?
function authenticate(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    let payload = null;
    try { payload = verifyToken(token); } catch (e) { payload = null; }
    const user = payload ? UserModel.getById(payload.id) : null;
    if (!user || user.status !== 'ACTIVE') {
        return res.status(401).json({ success: false, message: 'Login required: missing, invalid or expired token.' });
    }
    req.user = user;
    return next();
}

// 403 Forbidden: you are known, but your role may not do this
function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Login required.' });
        }
        if (!allowedRoles.includes(req.user.role_name)) {
            return res.status(403).json({
                success: false,
                message: `Your role (${req.user.role_name}) is not allowed to do this. Allowed: ${allowedRoles.join(', ')}.`
            });
        }
        return next();
    };
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, authenticate, authorize };
