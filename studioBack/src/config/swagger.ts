import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function initSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Api')
    .setDescription('Api of template for all projects')
    .setVersion('1.0.0')
    .addTag('Template')
    .addBearerAuth()
    .addGlobalResponse({
      status: 500,
      description: 'Internal server error',
    })
    .build();

  const documentFactory = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => {
      return `${controllerKey.replace('Controller', '')}_${methodKey}`;
    },
  });

  SwaggerModule.setup('api-doc', app, documentFactory);
}
