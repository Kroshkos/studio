import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { getAdminTokenPayload } from '@/lib/jwt';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;
    if (!authHeader) throw new UnauthorizedException('Токен не предоставлен');

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Некорректный заголовок Authorization');
    }

    // Проверяем подпись, тип токена (admin-token) и наличие поля admin: true
    const payload = getAdminTokenPayload(token);
    if (!payload || payload.admin !== true) {
      throw new UnauthorizedException('Недействительный админ-токен');
    }

    request.admin = payload;
    return true;
  }
}