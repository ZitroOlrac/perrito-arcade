import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

const env = process.env.NODE_ENV ?? 'development';

export const config = {
  env,
  port: Number(process.env.PORT ?? 4000),
  // los tests borran la base de datos entera, así que nunca usan DATABASE_URL
  databaseUrl:
    env === 'test'
      ? required('TEST_DATABASE_URL', 'postgres://arcade:arcade@localhost:5432/arcade_test')
      : required('DATABASE_URL'),
  // en desarrollo vale un secreto fijo; en producción hay que definirlo sí o sí
  jwtSecret: required('JWT_SECRET', env === 'production' ? undefined : 'dev-secret-cambiar'),
  jwtExpiresIn: '7d',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  // una partida abierta más tiempo que esto ya no se acepta
  maxSessionMinutes: 30,
};
