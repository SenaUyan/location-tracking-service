import './telemetry/instrumentation';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureHttpApp } from './bootstrap';
import { APP_CONFIG, AppConfig } from './config/app-config';
import { buildSwaggerDocument } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureHttpApp(app);

  SwaggerModule.setup('docs', app, buildSwaggerDocument(app));

  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port);
}

void bootstrap();
