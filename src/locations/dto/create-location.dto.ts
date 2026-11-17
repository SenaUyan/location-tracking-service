import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNumber, IsString, Length, Matches, Max, Min } from 'class-validator';

export class CreateLocationDto {
  @ApiProperty({ example: 'user-42', description: '1-64 chars: letters, digits, "-", "_", "."' })
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message: 'userId may only contain letters, digits, ".", "_" and "-"',
  })
  userId: string;

  @ApiProperty({ example: 40.9901, minimum: -90, maximum: 90 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 29.0303, minimum: -180, maximum: 180 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({
    example: '2026-11-17T14:00:05Z',
    description: 'Device time of the GPS fix, ISO 8601 **with timezone** (Z or ±hh:mm)',
  })
  @IsISO8601({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/i, { message: 'timestamp must include a timezone (Z or ±hh:mm)' })
  timestamp: string;
}
