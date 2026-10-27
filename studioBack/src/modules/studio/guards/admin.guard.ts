import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SessionInfo } from './auth.guard';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const session: SessionInfo | undefined = request.session;
    if (!session || session.kind !== 'admin') {
      throw new UnauthorizedException('Требуются права администратора');
    }
    return true;
  }
}
