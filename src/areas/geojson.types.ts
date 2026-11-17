/** [longitude, latitude] – GeoJSON order (RFC 7946), NOT lat/lng. */
export type Position = [number, number];

export interface Polygon {
  type: 'Polygon';
  /** First ring is the exterior boundary, following rings (optional) are holes. */
  coordinates: Position[][];
}
