// Uso: npm run make-admin -- <usuario>
import { pool } from '../db/pool.js';

const username = process.argv[2];
if (!username) {
  console.error('Uso: npm run make-admin -- <usuario>');
  process.exit(1);
}

const { rowCount } = await pool.query(`UPDATE users SET role = 'admin' WHERE lower(username) = lower($1)`, [username]);
console.log(rowCount ? `${username} ahora es admin (tiene que volver a iniciar sesión)` : `No existe ${username}`);
await pool.end();
