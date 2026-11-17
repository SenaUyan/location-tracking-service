import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsObject, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import type { Polygon } from '../geojson.types';

export class CreateAreaDto {
  @ApiProperty({ example: 'Kadikoy', minLength: 1, maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiProperty({
    description:
      'GeoJSON Polygon (RFC 7946). ⚠️ Coordinates are **[longitude, latitude]**, NOT [lat, lng]. ' +
      'Rings must be closed (first position = last position). Holes are allowed as extra rings.',
    example: {
      type: 'Polygon',
      coordinates: [
        [
          [29.015, 40.975],
          [29.045, 40.975],
          [29.045, 41.0],
          [29.015, 41.0],
          [29.015, 40.975],
        ],
      ],
    },
  })
  @IsDefined()
  @IsObject()
  geometry: Polygon;
}
