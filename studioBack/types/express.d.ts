import { JWTPayload } from '@/lib/jwt';

declare module '@types/express' {
  export interface Request {
    user?: JWTPayload;
    jwt?: JWTPayload;
    auth?: {
      tokenType?: 'service-token' | 'local-user-token' | 'root-user-token';
    };
  }
}
