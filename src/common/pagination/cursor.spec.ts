import { decodeCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  it('round-trips', () => {
    const c = { enteredAt: '2026-11-17T10:00:00.000Z', id: '42' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it.each([
    '',
    'not-base64-json',
    Buffer.from('["x","1"]').toString('base64url'),
    Buffer.from('["2026-11-17T10:00:00Z","1; DROP"]').toString('base64url'),
  ])('rejects tampered cursor %p', (raw) => expect(decodeCursor(raw)).toBeNull());
});
