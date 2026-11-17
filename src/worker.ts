import './telemetry/worker-role';
import './telemetry/instrumentation';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttpApp } from './bootstrap';
import { APP_CONFIG, AppConfig } from './config/app-config';
import { WorkerModule } from './worker/worker.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(WorkerModule, { bufferLogs: true });
  configureHttpApp(app);
  const config = app.get<AppConfig>(APP_CONFIG);
  // Only /health and /metrics are served; the real work is consuming the queue.
  await app.listen(config.workerPort);
}

void bootstrap();
