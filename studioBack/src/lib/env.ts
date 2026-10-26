const envPick = (key: string, fallback?: string): string => {
  if (!process.env[key]) {
    // В продакшене (например, на Amvera) обязательные переменные должны быть
    // заданы через панель «Переменные окружения». Fallback уместен только для
    // локальной разработки.
    if (fallback !== undefined) {
      console.warn(
        `[env] Переменная ${key} не задана — используется значение по умолчанию (только для dev)`,
      );
      return fallback;
    }
    throw new Error(`Не указано обязательное поле в .env: ${key}`);
  }

  return process.env[key];
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const envPickInt = (key: string): number => {
  const data = envPick(key);

  if (isNaN(+data)) throw new Error(`Поле ${key} должно быть числом`);

  return +data;
};

class AppEnv {
  readonly isInited: boolean = false;
  readonly appId: string;
  readonly appName: string;
  readonly appKey: string;
  readonly baseUrl: string;
  readonly frontUrl: string;
  readonly authServiceUrl: string;
  readonly authServiceBackUrl: string;

  constructor() {
    this.appId = envPick('APP_ID', 'studio-local');
    this.appName = envPick('APP_NAME', 'video-studio');
    this.appKey = envPick('APP_KEY', 'dev-only-insecure-key');
    this.baseUrl = envPick('BASE_URL', 'http://localhost:3001');
    // FRONT_URL поддерживает список origins через запятую (например, превью и
    // продакшен-домены Amvera). Пустое значение включает CORS для всех источников.
    this.frontUrl = envPick('FRONT_URL', '*');
    this.authServiceUrl = envPick('AUTH_SERVICE_URL', 'http://localhost:3002');
    this.authServiceBackUrl = envPick('AUTH_SERVICE_BACK_URL', 'http://localhost:3003');

    this.isInited = true;
  }
}

export const appEnv = new AppEnv();
