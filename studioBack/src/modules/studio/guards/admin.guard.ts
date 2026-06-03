import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { getTokenPayload } from '@/lib/jwt';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    if (!authHeader) throw new UnauthorizedException('Токен не предоставлен');

    const token = authHeader.split(' ')[1];
    const payload = getTokenPayload(token);
    if (!payload) throw new UnauthorizedException('Недействительный токен');

    // можно дополнительно проверить наличие поля admin: true
    request.admin = payload;
    return true;
  }
}