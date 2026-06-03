import { Reflector } from '@nestjs/core';

export const Scope = Reflector.createDecorator<string[]>();
