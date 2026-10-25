import { appEnv } from '@/lib/env';
import { InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
export let SERVICE_APP_TOKEN: string | null = null;

export async function initServiceToken() {
  // TODO: Сделать клиент для сервисов
  try {
    const response = await axios.post<{ token: string }>(
      `${appEnv.authServiceBackUrl}/auth/authorize-oauth-client`,
      {
        clientId: appEnv.appId,
        clientSecret: appEnv.appKey,
      },
    );

    SERVICE_APP_TOKEN = response.data.token;
    console.log('Сервис успешно авторизован.');
    // Не логируем сам токен — это секрет
  } catch (e) {
    if (axios.isAxiosError(e)) {
      console.log(e.name, e.message, e.status);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      throw new InternalServerErrorException(e.response?.data.message);
    }

    console.log(e);
    throw new InternalServerErrorException('Неизвестная ошибка сервера');
  }
  return '';
}
