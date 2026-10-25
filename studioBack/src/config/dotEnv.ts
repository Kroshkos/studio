import * as fs from 'fs';
import * as path from 'path';
import { config as loadDotEnv } from 'dotenv';
import { appEnv } from "@/lib/env";

export function initDotEnv() {
  // Загружаем .env из корня бэкенда, если файл существует.
  // Без этого шага переменные окружения (ADMIN_LOGIN, DATABASE_URL и т.д.)
  // будут доступны только при запуске через внешние инструменты.
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    loadDotEnv({ path: envPath });
  }

  if (appEnv.isInited) console.log('.env проинициализирован');
}
