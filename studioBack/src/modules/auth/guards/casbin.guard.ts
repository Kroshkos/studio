import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Inject,
} from '@nestjs/common';
import { Request } from 'express';
import { Enforcer } from 'casbin';
import { Reflector } from '@nestjs/core';
import { SKIP_CASBIN_KEY } from '../decorators/skip-casbin.decorator';
import { IS_PUBLIC_KEY } from '@/modules/auth/decorators/public.decorator';

@Injectable()
export class CasbinGuard implements CanActivate {
  constructor(
    @Inject('CASBIN_ENFORCER') private readonly enforcer: Enforcer,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CASBIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest<Request>();

    // `req.jwt` уже заполнен AuthGuard‑ом (если пользователь аутентифицирован)
    // Если токена нет – считаем, что это пользователь
    const role = req.jwt?.user.roleName ?? 'user';

    const allowed = await this.enforcer.enforce(
      role,
      req.path, // объект (полный путь без query‑string)
      req.method.toUpperCase(), // действие (GET, POST, …)
    );

    if (!allowed) {
      throw new ForbiddenException('Недостаточно прав доступа');
    }

    return true;
  }
}
