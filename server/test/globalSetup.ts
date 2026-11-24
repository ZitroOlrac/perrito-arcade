// Deja la base de datos de test limpia y con el esquema al día antes de empezar
export default async function setup() {
  process.env.NODE_ENV = 'test';
  const { pool } = await import('../src/db/pool.js');
  const { migrate } = await import('../src/db/migrate.js');

  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(false);
  await pool.end();
}
