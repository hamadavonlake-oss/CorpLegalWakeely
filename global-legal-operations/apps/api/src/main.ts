import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigModule } from '@nestjs/config';
import { API_PREFIX, APP_VERSION } from '@glo/shared';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global config is loaded in AppModule, register feature config here if needed
  ConfigModule.forRoot({ isGlobal: true });

  // Global prefix
  app.setGlobalPrefix(API_PREFIX);

  // CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Global Legal Operations API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, document);

  const port = process.env.PORT ?? 3001;
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`API running on http://localhost:${port}/${API_PREFIX}`);
  // eslint-disable-next-line no-console
  console.log(`Swagger docs at http://localhost:${port}/${API_PREFIX}/docs`);
}

bootstrap();
