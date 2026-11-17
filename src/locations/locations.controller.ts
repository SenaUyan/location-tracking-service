import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { CreateLocationDto } from './dto/create-location.dto';
import { LocationsService } from './locations.service';

@ApiTags('locations')
@ApiSecurity('api-key')
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Post()
  @RequireRole('ingest')
  @RateLimit('user')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Submit the current location of a user',
    description:
      'Validated synchronously, processed asynchronously. 202 means the location was accepted ' +
      'into the processing queue; resulting area entries appear in GET /logs shortly after.',
  })
  @ApiResponse({ status: 202, description: 'Accepted for processing' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR' })
  @ApiResponse({
    status: 422,
    description:
      'TIMESTAMP_IN_FUTURE / TIMESTAMP_TOO_OLD (include `serverTime`) / INVALID_COORDINATES',
  })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED (per userId)' })
  create(@Body() dto: CreateLocationDto) {
    return this.locations.ingest(dto);
  }
}
