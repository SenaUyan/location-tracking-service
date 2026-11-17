import './telemetry/instrumentation';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureHttpApp } from './bootstrap';
import { APP_CONFIG, AppConfig } from './config/app-config';
import { API_KEY_HEADER } from './common/guards/api-key.guard';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureHttpApp(app);

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Location Tracking Service')
      .setDescription(
        'Receives user locations and records entries into polygon areas.\n\n' +
          'Authenticate with the `x-api-key` header: the **ingest** key may only POST /locations, ' +
          'the **admin** key may call everything.',
      )
      .setVersion('1.0.0')
      .addApiKey({ type: 'apiKey', in: 'header', name: API_KEY_HEADER }, 'api-key')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);

  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port);
}

void bootstrap();
