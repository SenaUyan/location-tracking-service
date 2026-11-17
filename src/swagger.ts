import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { API_KEY_HEADER } from './common/guards/api-key.guard';

export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
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
}
