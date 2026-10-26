/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовый адрес API бэкенда (для Amvera: https://<backend>.amveranet/studio).
   *  Если не задан — используется относительный путь и прокси Vite (dev-режим). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
