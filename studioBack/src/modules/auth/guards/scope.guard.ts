import { Scope } from '@/modules/auth/decorators/scope.decorator';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable } from 'rxjs';

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    const { auth } = req;

    if (!auth) {
      return true;
    }

    const tokenScope = this.reflector.get(Scope, context.getHandler());

    if (auth.tokenType !== 'service-token') {
      // Пропускаем все остальные токены
      return true;
    }

    const scope = this.reflector.get(Scope, context.getHandler());

    if (!scope?.length || !tokenScope?.length) {
      throw new ForbiddenException('Токен не имеет доступа к этому запросу');
    }

    const scopeSet = new Set<string>(scope);

    return tokenScope.some((s) => {
      return scopeSet.has(s);
    });
  }
}
