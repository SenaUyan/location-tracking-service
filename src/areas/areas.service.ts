import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Area } from './area.entity';
import { CreateAreaDto } from './dto/create-area.dto';
import { ListAreasQuery } from './dto/list-areas.query';
import { validatePolygon } from './polygon.validation';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class AreasService {
  constructor(
    @InjectRepository(Area) private readonly areas: Repository<Area>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(dto: CreateAreaDto): Promise<Area> {
    const problems = validatePolygon(dto.geometry, this.config.areas.polygonMaxVertices);
    if (problems.length) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_POLYGON, 'Invalid polygon', {
        details: problems,
      });
    }

    const geojson = JSON.stringify(dto.geometry);

    // Geometric validity (self-intersections, "bow-tie" shapes, ...) is PostGIS' job.
    const [{ valid, reason }] = await this.areas.query(
      `SELECT ST_IsValid(g) AS valid, ST_IsValidReason(g) AS reason
         FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS g) s`,
      [geojson],
    );
    if (!valid) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_POLYGON, 'Invalid polygon', {
        details: [`polygon is not geometrically valid: ${reason}`],
      });
    }

    try {
      const [row] = await this.areas.query(
        `INSERT INTO areas (name, geometry)
         VALUES ($1, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326))
         RETURNING id, name, ST_AsGeoJSON(geometry)::json AS geometry, created_at AS "createdAt"`,
        [dto.name, geojson],
      );
      return row as Area;
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
      ) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.AREA_NAME_CONFLICT,
          `An area named "${dto.name}" already exists`,
        );
      }
      throw err;
    }
  }

  async list(query: ListAreasQuery) {
    const [items, total] = await this.areas.findAndCount({
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
