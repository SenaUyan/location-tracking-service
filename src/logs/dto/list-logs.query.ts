import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class ListLogsQuery {
  @ApiPropertyOptional({ description: 'Only entries of this user' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  userId?: string;

  @ApiPropertyOptional({ description: 'Only entries into this area', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  areaId?: string;

  @ApiPropertyOptional({
    description: 'Entries at or after this time (ISO 8601)',
    example: '2026-11-17T00:00:00Z',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ description: 'Entries strictly before this time (ISO 8601)' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;

  @ApiPropertyOptional({ description: '`nextCursor` from the previous page' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  cursor?: string;
}
