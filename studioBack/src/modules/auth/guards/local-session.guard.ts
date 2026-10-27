import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '@/modules/auth/decorators/public.decorator';
import { getTokenPayload } from '@/lib/jwt';
import { SessionInfo } from '@/modules/studio/guards/auth.guard';

/**
 * Guard для standalone-режима (вся платформа в одном контейнере).
 * Сессию подразделения/администратора устанавливает StudioAuthGuard
 * (JWT с приложенным APP_KEY) — здесь проверяется только её наличие
 * для непубличных маршрутов. Внешний OAuth-сервис не требуется.
 */
@Injectable()
export class LocalSessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();

    // студийная сессия (kind: admin | department), ставится StudioAuthGuard
    if ((req as any).session?.kind) return true;

    // express-session создаёт объект req.session для каждого запроса,
    // поэтому при выходе считаем авторизованным только студийную сессию
    // (kind: admin | department), а не факт существования req.session.
    const authHeader: string | undefined = (req as Request).headers?.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      try {
        const payload = getTokenPayload(token) as { session?: SessionInfo } | null;
        if (payload?.session?.kind) {
          (req as any).session = payload.session;
          return true;
        }
      } catch {
        /* не наш токен */
      }
    }

    throw new UnauthorizedException('Вы не авторизованы');
  }
}
