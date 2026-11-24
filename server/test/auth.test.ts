import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, resetData } from './helpers.js';
import { pool } from '../src/db/pool.js';

beforeEach(resetData);
afterAll(() => pool.end());

describe('registro', () => {
  it('crea el usuario y devuelve un token', async () => {
    const res = await api().post('/api/auth/register').send({ username: 'toby', password: 'secreto123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ username: 'toby', role: 'player' });
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('no deja repetir nombre aunque cambien mayúsculas', async () => {
    await api().post('/api/auth/register').send({ username: 'Toby', password: 'secreto123' });
    const res = await api().post('/api/auth/register').send({ username: 'toby', password: 'otra123456' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USERNAME_TAKEN');
  });

  it('valida el formato del nombre y la contraseña', async () => {
    const res = await api().post('/api/auth/register').send({ username: 'a b', password: '123' });
    expect(res.status).toBe(400);
    const fields = res.body.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['username', 'password']));
  });
});

describe('login', () => {
  beforeEach(async () => {
    await api().post('/api/auth/register').send({ username: 'canela', password: 'secreto123' });
  });

  it('entra con las credenciales correctas', async () => {
    const res = await api().post('/api/auth/login').send({ username: 'CANELA', password: 'secreto123' });
    expect(res.status).toBe(200);
    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.body.user.username).toBe('canela');
  });

  it('da el mismo error si falla la contraseña o el usuario no existe', async () => {
    const wrongPass = await api().post('/api/auth/login').send({ username: 'canela', password: 'nopenope' });
    const noUser = await api().post('/api/auth/login').send({ username: 'nadie', password: 'nopenope' });
    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPass.body.error).toBe(noUser.body.error);
  });

  it('rechaza tokens falsos', async () => {
    const res = await api().get('/api/auth/me').set('Authorization', 'Bearer esto.no.vale');
    expect(res.status).toBe(401);
  });
});

it('JSON mal formado devuelve 400 y no 500', async () => {
  const res = await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{"username":');
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('BAD_JSON');
});
