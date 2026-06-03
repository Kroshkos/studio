import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const request: unknown = ctx.switchToHttp().getRequest();

    if (typeof request === 'object' && request !== null && 'jwt' in request) {
      return request.jwt;
    }

    return undefined;
  },
);
