import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { ListLogsQuery } from './dto/list-logs.query';
import { LogsService } from './logs.service';

@ApiTags('logs')
@ApiSecurity('api-key')
@RequireRole('admin')
@RateLimit('client')
@Controller('logs')
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @Get()
  @ApiOperation({
    summary: 'List recorded area entries (cursor pagination, newest first)',
    description:
      'Pass `nextCursor` of a response as `cursor` to get the next page. `null` = last page.',
  })
  list(@Query() query: ListLogsQuery) {
    return this.logs.list(query);
  }
}
