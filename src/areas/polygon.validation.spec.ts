import { validatePolygon } from './polygon.validation';

const square = [
  [29.0, 41.0],
  [29.1, 41.0],
  [29.1, 41.1],
  [29.0, 41.1],
  [29.0, 41.0],
];

describe('validatePolygon', () => {
  it('accepts a closed polygon', () => {
    expect(validatePolygon({ type: 'Polygon', coordinates: [square] }, 1000)).toEqual([]);
  });

  it('accepts holes', () => {
    const hole = [
      [29.04, 41.04],
      [29.06, 41.04],
      [29.06, 41.06],
      [29.04, 41.04],
    ];
    expect(validatePolygon({ type: 'Polygon', coordinates: [square, hole] }, 1000)).toEqual([]);
  });

  it.each([
    ['not an object', null],
    ['wrong type', { type: 'Point', coordinates: [29, 41] }],
    ['no rings', { type: 'Polygon', coordinates: [] }],
  ])('rejects %s', (_label, input) => {
    expect(validatePolygon(input, 1000).length).toBeGreaterThan(0);
  });

  it('rejects an unclosed ring', () => {
    const errors = validatePolygon({ type: 'Polygon', coordinates: [square.slice(0, 4)] }, 1000);
    expect(errors).toContain(
      'exterior ring must be closed (first and last positions must be identical)',
    );
  });

  it('rejects rings with fewer than 4 positions', () => {
    const errors = validatePolygon(
      {
        type: 'Polygon',
        coordinates: [
          [
            [29, 41],
            [29.1, 41],
            [29, 41],
          ],
        ],
      },
      1000,
    );
    expect(errors.join()).toMatch(/at least 4 positions/);
  });

  it('hints at swapped [lat, lng] order when a latitude is out of range', () => {
    const swapped = square.map(([lng, lat]) => [lat, lng + 100]);
    expect(validatePolygon({ type: 'Polygon', coordinates: [swapped] }, 1000).join()).toMatch(
      /GeoJSON order is \[lng, lat\]/,
    );
  });

  it('rejects non numeric positions', () => {
    const errors = validatePolygon({ type: 'Polygon', coordinates: [[['a', 1], ...square]] }, 1000);
    expect(errors.join()).toMatch(/two finite numbers/);
  });

  it('enforces the maximum number of vertices', () => {
    expect(validatePolygon({ type: 'Polygon', coordinates: [square] }, 4).join()).toMatch(
      /maximum allowed is 4/,
    );
  });
});
