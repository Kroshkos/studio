import Jwt from 'jsonwebtoken';
import { z } from './zod';
import zod from 'zod';

export const CurrentUserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  roleName: z.string().nullable(),
  personId: z.number().nullable(),
});

export const JWTPayload = z.object({
  user: CurrentUserSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
});

export type JWTPayload = zod.infer<typeof JWTPayload>;
export type ICurrentUser = zod.infer<typeof CurrentUserSchema>;

export const getAppKey = () => {
  const key = process.env['APP_KEY'];

  if (!key) throw new Error('APP_KEY не найден. Настройте .env');

  return key;
};

export const getJWTHeaders = (token: string) => {
  const decoded = Jwt.decode(token, { complete: true });

  if (!decoded) return null;

  const { header } = decoded;

  return header;
};

export const getJWTPayload = (token: string) => {
  const decoded = Jwt.decode(token, { complete: true });

  if (!decoded) return null;

  const { payload } = decoded;

  return payload;
};

// Полезная нагрузка админ-токена (выдаётся в POST /studio/admin/login)
export const AdminJWTPayload = z.object({
  admin: z.literal(true),
  login: z.string(),
});

export type AdminJWTPayload = zod.infer<typeof AdminJWTPayload>;

export const getAdminTokenPayload = (token: string): AdminJWTPayload | null => {
  const key = getAppKey();

  try {
    // Проверяем заголовок: принимаем только токены типа admin-token,
    // чтобы пользовательский local-user-token нельзя было использовать как админский
    const header = Jwt.decode(token, { complete: true })?.header;
    if (!header || header['typ'] !== 'admin-token') return null;

    const payload = Jwt.verify(token, key);
    const parseResult = AdminJWTPayload.safeParse(payload);
    if (parseResult.success) {
      return parseResult.data;
    }
    return null;
  } catch (e) {
    console.log('Ошибка верификации админ-токена:', e);
    return null;
  }
};

export const createToken = (payload: object, type = 'local-user-token') => {
  const key = getAppKey();

  return Jwt.sign(payload, key, {
    header: {
      kid: 'app-key',
      typ: type,
      alg: 'HS256',
    },
  });
};

export const getTokenPayload = (token: string) => {
  const key = getAppKey();

  try {
    const payload = Jwt.verify(token, key);
    const parseResult = JWTPayload.safeParse(payload);
    if (parseResult.success) {
      return parseResult.data;
    }
    throw new Error('Токен не соответствуент типу JWTPayload');
  } catch (e) {
    console.log('Ошибка верификации токена:', e);
    return null;
  }
};
