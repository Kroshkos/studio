import { appEnv } from '@/lib/env';

export function initDotEnv() {
  if (appEnv.isInited) console.log('.env проинициализирован');
}
