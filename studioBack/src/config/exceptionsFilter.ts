import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from 'generated/prisma';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Если это HttpException (например, NotFoundException)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      return response.status(status).json(res);
    }

    // Prisma ошибка (например, уникальный индекс нарушен)
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return response.status(409).json({
          statusCode: 409,
          message: 'Нарушение уникального ограничения',
        });
      }
      if (exception.code === 'P2025') {
        return response.status(404).json({
          statusCode: 404,
          message: 'Ресурс не найден',
        });
      }
    }
    console.log('Ошибка запроса: ', `${exception as any}`);
    // Всё остальное превращаем в 500
    return response
      .status(500)
      .json(
        new InternalServerErrorException(
          'Неизвестная серверная ошибка',
        ).getResponse(),
      );
  }
}
