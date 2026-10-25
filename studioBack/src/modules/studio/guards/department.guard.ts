import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { getDepartmentTokenPayload } from '@/lib/jwt';

// Guard для эндпоинтов подразделения: принимает только department-token
@Injectable()
export class DepartmentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;
    if (!authHeader) throw new UnauthorizedException('Токен не предоставлен');

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Некорректный заголовок Authorization');
    }

    const payload = getDepartmentTokenPayload(token);
    if (!payload) {
      throw new UnauthorizedException('Сессия истекла, войдите заново');
    }

    request.department = payload; // { departmentId, departmentName }
    return true;
  }
}
