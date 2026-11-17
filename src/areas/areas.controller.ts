import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { AreasService } from './areas.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { ListAreasQuery } from './dto/list-areas.query';

@ApiTags('areas')
@ApiSecurity('api-key')
@RequireRole('admin')
@RateLimit('client')
@Controller('areas')
export class AreasController {
  constructor(private readonly areas: AreasService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Define a new polygon area' })
  @ApiResponse({ status: 201, description: 'Area created' })
  @ApiResponse({ status: 400, description: 'INVALID_POLYGON / VALIDATION_ERROR' })
  @ApiResponse({
    status: 409,
    description: 'AREA_NAME_CONFLICT – name already used (case-insensitive)',
  })
  create(@Body() dto: CreateAreaDto) {
    return this.areas.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List defined areas (page based pagination, newest first)' })
  list(@Query() query: ListAreasQuery) {
    return this.areas.list(query);
  }
}
