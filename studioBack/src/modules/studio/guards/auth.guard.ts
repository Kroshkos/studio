import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { getTokenPayload } from '@/lib/jwt';

export type SessionInfo = {
  kind: 'admin' | 'department';
  id?: string;
  name?: string;
  login?: string;
};

@Injectable()
export class StudioAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;
    if (!authHeader) throw new UnauthorizedException('Токен не предоставлен');

    const token = authHeader.split(' ')[1];
    let payload: any = null;
    try {
      payload = getTokenPayload(token);
    } catch {
      payload = null;
    }
    if (!payload || !payload.session) {
      throw new UnauthorizedException('Недействительный токен');
    }

    // Не перезаписываем req.session (его создаёт express-session и у него
    // есть методы вроде touch()) — кладём студийную сессию в отдельное поле.
    request.studioSession = payload.session as SessionInfo;
    return true;
  }
}
