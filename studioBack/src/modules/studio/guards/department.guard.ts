import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SessionInfo } from './auth.guard';

// Допускает и администратора, и подразделение
@Injectable()
export class DepartmentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const session: SessionInfo | undefined = request.studioSession;
    if (!session) {
      throw new UnauthorizedException('Требуется авторизация');
    }
    return true;
  }
}
