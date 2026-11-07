const {pool}=require('../config/db');
module.exports=async function expireHolds(){
 await pool.execute(`UPDATE reservations SET status='expired' WHERE status='held' AND hold_expires_at IS NOT NULL AND hold_expires_at<=NOW()`);
};
