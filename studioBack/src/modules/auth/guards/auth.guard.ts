import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import axios from 'axios';
import { getJWTHeaders, verifyJwtPayload as getTokenPayload } from '@/lib/jwt';
import jwksClient from 'jwks-rsa';
import { JwtHeader, SigningKeyCallback, verify } from 'jsonwebtoken';
import { z } from '@/lib/zod';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@/modules/auth/decorators/public.decorator';
import { Scope } from '@/modules/auth/decorators/scope.decorator';
import { appEnv } from '@/lib/env';

const isOauthTokenValid = async (token: string): Promise<boolean> => {
  try {
    const { data } = await axios.post<boolean>(
      `${appEnv.authServiceBackUrl}/oauth2/token/check`,
      {
        token,
      },
    );

    return data;
  } catch (e) {
    console.log(e);
    return false;
  }
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();

    let token = this.extractBearerToken(req);

    if (!token) {
      token = this.extractCookieToken(req);
    }

    if (!token) {
      throw new UnauthorizedException('Вы не авторизованы, токен не найден');
    }

    const headers = getJWTHeaders(token);

    switch (headers?.typ) {
      case 'local-user-token':
        await this.validateLocalUserToken(token, req);
        req.auth = { tokenType: 'local-user-token' };
        break;
      case 'service-token':
        await this.validateServiceToken(token);
        req.auth = { tokenType: 'service-token' };
        break;
      default:
        throw new UnauthorizedException(
          'Вы не авторизованы, неверный тип токена',
        );
    }

    return true;
  }

  private extractBearerToken(req: Request): string | null {
    const authHeader = req.header('Authorization');
    if (!authHeader) {
      return null;
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      return null;
    }
    return token;
  }

  private extractCookieToken(req: Request): string | null {
    const cookie: unknown = req.cookies['jwt'];
    if (typeof cookie !== 'string') return null;
    return cookie;
  }

  async validateLocalUserToken(token: string, req: Request) {
    const payload = getTokenPayload(token);

    if (!payload) {
      throw new UnauthorizedException('Вы не авторизованы, неизвестный ключ');
    }

    const isTokenValid = await isOauthTokenValid(payload.accessToken);

    if (!isTokenValid) {
      throw new UnauthorizedException('Сессия не найдена');
    }

    req.jwt = payload;
  }

  async validateServiceToken(token: string) {
    const client = jwksClient({
      jwksUri: `${appEnv.authServiceBackUrl}/.well-known/jwks.json`,
      cache: true,
    });

    const getKey = (header: JwtHeader, callback: SigningKeyCallback) => {
      client.getSigningKey(header.kid, function (err, key) {
        if (err) {
          callback(err);
          return;
        }

        let signingKey = '';

        if (!key) return;
        if ('publicKey' in key) signingKey = signingKey || key.publicKey;
        if ('rsaPublicKey' in key) signingKey = signingKey || key.rsaPublicKey;

        callback(null, signingKey);
      });
    };

    try {
      await new Promise((res, rej) => {
        verify(token, getKey, (errors, decoded) => {
          if (errors) {
            rej(errors);
            return;
          }

          const ServiceJWTPayload = z.object({
            id: z.number(),
            name: z.string(),
            scope: z.array(z.string()),
          });

          const parseResult = ServiceJWTPayload.safeParse(decoded);

          if (!parseResult.success) {
            rej(new Error('Токен не соответствуент типу ServiceJWTPayload'));
            return;
          }

          SetMetadata(Scope, parseResult.data.scope);

          res(decoded);
        });
      });
    } catch (e) {
      console.log(e);
      throw new UnauthorizedException('Не получилось верифицировать токен');
    }
  }
}

