import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { conflict, notFound, unauthorized } from '../errors.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { handler } from './handler.js';
import { config } from '../config.js';

const credentials = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Mínimo 3 caracteres')
    .max(20, 'Máximo 20 caracteres')
    .regex(/^[a-zA-Z0-9_ñÑ]+$/, 'Solo letras, números y guion bajo'),
  password: z.string().min(6, 'Mínimo 6 caracteres').max(72),
});

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: 'player' | 'admin';
  created_at: Date;
  bones: number;
  equipped_skin: string;
  palette?: Record<string, string>;
}

const publicUser = (u: UserRow) => ({
  id: u.id,
  username: u.username,
  role: u.role,
  createdAt: u.created_at.toISOString(),
  bones: u.bones,
  skin: u.equipped_skin,
  palette: u.palette ?? {},
});

const SELECT_USER = `SELECT u.*, s.palette FROM users u JOIN skins s ON s.slug = u.equipped_skin`;

export const authRouter = Router();

// frena a quien intente adivinar contraseñas a lo bruto
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.env === 'test',
  message: { error: 'Demasiados intentos, prueba en unos minutos', code: 'RATE_LIMIT' },
});

authRouter.post(
  '/register',
  authLimiter,
  handler(async (req, res) => {
    const { username, password } = credentials.parse(req.body);
    const hash = await bcrypt.hash(password, 10);

    try {
      const { rows } = await query<UserRow>(`INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING *`, [
        username,
        hash,
      ]);
      const user = rows[0];
      res.status(201).json({
        token: signToken({ sub: user.id, username: user.username, role: user.role }),
        user: publicUser(user),
      });
    } catch (err: any) {
      if (err.code === '23505') throw conflict('Ese nombre ya está cogido', 'USERNAME_TAKEN');
      throw err;
    }
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  handler(async (req, res) => {
    const { username, password } = credentials.parse(req.body);
    const { rows } = await query<UserRow>(`${SELECT_USER} WHERE lower(u.username) = lower($1)`, [username]);
    const user = rows[0];

    // mismo mensaje si no existe o si falla la contraseña, para no dar pistas
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw unauthorized('Usuario o contraseña incorrectos');
    }

    res.json({
      token: signToken({ sub: user.id, username: user.username, role: user.role }),
      user: publicUser(user),
    });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  handler(async (req, res) => {
    const { rows } = await query<UserRow>(`${SELECT_USER} WHERE u.id = $1`, [req.user!.sub]);
    if (!rows[0]) throw notFound('El usuario ya no existe');
    res.json({ user: publicUser(rows[0]) });
  }),
);
