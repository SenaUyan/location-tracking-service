import type { Polygon, Position } from './geojson.types';

/**
 * Structural validation of a GeoJSON Polygon (RFC 7946). Geometric validity
 * (self-intersection etc.) is checked afterwards by PostGIS (ST_IsValid).
 * Returns a list of human readable problems; empty list = valid.
 */
export function validatePolygon(input: unknown, maxVertices: number): string[] {
  if (typeof input !== 'object' || input === null) return ['geometry must be a GeoJSON object'];
  const geometry = input as Partial<Polygon>;

  if (geometry.type !== 'Polygon') return ['geometry.type must be "Polygon"'];
  if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
    return ['geometry.coordinates must be a non-empty array of linear rings'];
  }

  const errors: string[] = [];
  let totalVertices = 0;

  geometry.coordinates.forEach((ring, r) => {
    const label = r === 0 ? 'exterior ring' : `hole #${r}`;
    if (!Array.isArray(ring)) {
      errors.push(`${label} must be an array of positions`);
      return;
    }
    totalVertices += ring.length;
    if (ring.length < 4) {
      errors.push(`${label} must have at least 4 positions (a closed triangle: A, B, C, A)`);
    }
    ring.forEach((pos, i) => {
      const problem = positionProblem(pos);
      if (problem) errors.push(`${label}, position ${i}: ${problem}`);
    });
    if (ring.length >= 2 && isPosition(ring[0]) && isPosition(ring[ring.length - 1])) {
      const [first, last] = [ring[0], ring[ring.length - 1]];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        errors.push(`${label} must be closed (first and last positions must be identical)`);
      }
    }
  });

  if (totalVertices > maxVertices) {
    errors.push(`polygon has ${totalVertices} positions, maximum allowed is ${maxVertices}`);
  }
  return errors;
}

function isPosition(pos: unknown): pos is Position {
  return (
    Array.isArray(pos) &&
    pos.length === 2 &&
    pos.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

function positionProblem(pos: unknown): string | null {
  if (!isPosition(pos)) return 'must be [longitude, latitude] with two finite numbers';
  const [lng, lat] = pos;
  if (lng < -180 || lng > 180)
    return `longitude ${lng} out of range [-180, 180] (GeoJSON order is [lng, lat])`;
  if (lat < -90 || lat > 90)
    return `latitude ${lat} out of range [-90, 90] (GeoJSON order is [lng, lat])`;
  return null;
}
