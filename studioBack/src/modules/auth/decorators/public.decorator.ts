import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

export const Public = (isEnabled = true) =>
  SetMetadata(IS_PUBLIC_KEY, isEnabled);
