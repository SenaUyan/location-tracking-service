import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/require-role.decorator';
import { prometheusExporter } from './instrumentation';

/**
 * Prometheus scrape endpoint. Not authenticated by design (scrapers rarely send API keys):
 * in production it should only be reachable from the internal network.
 */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  @Public()
  @Get()
  scrape(@Req() req: Request, @Res() res: Response): void {
    prometheusExporter.getMetricsRequestHandler(req, res);
  }
}
