import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, AppConfig, buildAppConfig } from '../config/app-config';
import { envValidationSchema } from '../config/env.validation';
import { buildDataSourceOptions } from '../database/typeorm-options';
import { RedisModule } from '../redis/redis.module';

/**
 * Infrastructure shared by the API and the worker processes:
 * config, structured logging, PostgreSQL, Redis and the BullMQ connection.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isDev = config.get('NODE_ENV') === 'development';
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL'),
            // Pretty logs locally, JSON (machine searchable) everywhere else.
            transport: isDev ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
            genReqId: (req, res) => {
              const id = (req.headers['x-request-id'] as string) ?? randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            redact: ['req.headers["x-api-key"]', 'req.headers.authorization'],
            autoLogging: {
              ignore: (req) => req.url?.startsWith('/health') || req.url === '/metrics',
            },
          },
        };
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        buildDataSourceOptions(config.database.url, config.database.poolSize),
    }),
    BullModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        connection: { url: config.redis.url },
      }),
    }),
    RedisModule,
  ],
  providers: [{ provide: APP_CONFIG, inject: [ConfigService], useFactory: buildAppConfig }],
  exports: [APP_CONFIG],
})
export class CoreModule {}
