const envPick = (key: string): string => {
  if (!process.env[key])
    throw new Error(`Не указано обязательное поле в .env: ${key}`);

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
    this.appId = envPick('APP_ID');
    this.appName = envPick('APP_NAME');
    this.appKey = envPick('APP_KEY');
    this.baseUrl = envPick('BASE_URL');
    this.frontUrl = envPick('FRONT_URL');
    this.authServiceUrl = envPick('AUTH_SERVICE_URL');
    this.authServiceBackUrl = envPick('AUTH_SERVICE_BACK_URL');

    this.isInited = true;
  }
}

export const appEnv = new AppEnv();
