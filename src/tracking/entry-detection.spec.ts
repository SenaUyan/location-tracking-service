import { AreaProximity, PreviousState, decideEntries, isStale } from './entry-detection';

const TTL_MS = 30 * 60 * 1000;
const t = (iso: string) => new Date(`2026-11-17T${iso}Z`);
const inside = (areaId: string): AreaProximity => ({
  areaId,
  inside: true,
  withinExitBuffer: true,
});
const inBuffer = (areaId: string): AreaProximity => ({
  areaId,
  inside: false,
  withinExitBuffer: true,
});
const NEVER_SEEN: PreviousState = { areaIds: [], lastLocationAt: null };

describe('entry detection', () => {
  describe('scenario 1 – first location of a user', () => {
    it('counts every area the user is inside as an entry', () => {
      const d = decideEntries(NEVER_SEEN, t('08:00:00'), [inside('depot')], TTL_MS);
      expect(d.enteredAreaIds).toEqual(['depot']);
      expect(d.nextAreaIds).toEqual(['depot']);
    });

    it('records nothing when the user is not inside any area', () => {
      const d = decideEntries(NEVER_SEEN, t('08:00:00'), [], TTL_MS);
      expect(d.enteredAreaIds).toEqual([]);
      expect(d.nextAreaIds).toEqual([]);
    });
  });

  describe('only transitions are entries', () => {
    it('does not log again while the user stays inside', () => {
      const prev = { areaIds: ['depot'], lastLocationAt: t('14:00:00') };
      const d = decideEntries(prev, t('14:00:05'), [inside('depot')], TTL_MS);
      expect(d.enteredAreaIds).toEqual([]);
      expect(d.nextAreaIds).toEqual(['depot']);
    });

    it('logs a new entry after the user left and came back', () => {
      const left = decideEntries(
        { areaIds: ['depot'], lastLocationAt: t('14:00:00') },
        t('14:00:05'),
        [],
        TTL_MS,
      );
      expect(left.nextAreaIds).toEqual([]);
      const back = decideEntries(
        { areaIds: left.nextAreaIds, lastLocationAt: t('14:00:05') },
        t('14:00:10'),
        [inside('depot')],
        TTL_MS,
      );
      expect(back.enteredAreaIds).toEqual(['depot']);
    });
  });

  describe('scenario 2 & 3 – out-of-order and duplicate locations', () => {
    const prev = { areaIds: [], lastLocationAt: t('14:00:10') };

    it('treats an older location as stale', () => {
      expect(isStale(prev, t('14:00:05'))).toBe(true);
    });

    it('treats a location with the same timestamp (retry / duplicate) as stale', () => {
      expect(isStale(prev, t('14:00:10'))).toBe(true);
    });

    it('accepts a newer location', () => {
      expect(isStale(prev, t('14:00:15'))).toBe(false);
    });

    it('never treats the first location as stale', () => {
      expect(isStale(NEVER_SEEN, t('00:00:00'))).toBe(false);
    });

    it('prevents the fake re-entry of the out-of-order example (:00 in, :10 out, :05 in)', () => {
      // :00 inside
      const s1 = decideEntries(NEVER_SEEN, t('14:00:00'), [inside('depot')], TTL_MS);
      expect(s1.enteredAreaIds).toEqual(['depot']);
      // :10 far outside
      const s2 = decideEntries(
        { areaIds: s1.nextAreaIds, lastLocationAt: t('14:00:00') },
        t('14:00:10'),
        [],
        TTL_MS,
      );
      // :05 arrives late → stale, must not produce a second entry
      expect(
        isStale({ areaIds: s2.nextAreaIds, lastLocationAt: t('14:00:10') }, t('14:00:05')),
      ).toBe(true);
    });
  });

  describe('scenario 4 – overlapping areas are independent', () => {
    it('logs one entry per area when entering two areas at once', () => {
      const d = decideEntries(
        NEVER_SEEN,
        t('10:00:00'),
        [inside('moda'), inside('kadikoy')],
        TTL_MS,
      );
      expect(d.enteredAreaIds).toEqual(['kadikoy', 'moda']);
    });

    it('only logs the inner area when already inside the outer one', () => {
      const prev = { areaIds: ['kadikoy'], lastLocationAt: t('10:00:00') };
      const d = decideEntries(prev, t('10:10:00'), [inside('kadikoy'), inside('moda')], TTL_MS);
      expect(d.enteredAreaIds).toEqual(['moda']);
      expect(d.nextAreaIds).toEqual(['kadikoy', 'moda']);
    });
  });

  describe('scenario 6 – GPS jitter on the boundary (exit buffer)', () => {
    it('keeps the user inside while jittering within the buffer – exactly one entry', () => {
      const jitter: AreaProximity[][] = [
        [inside('depot')], // 2m inside
        [inBuffer('depot')], // 3m outside
        [inside('depot')], // 1m inside
        [inBuffer('depot')], // 4m outside
        [inside('depot')], // 2m inside
      ];
      let state: PreviousState = NEVER_SEEN;
      let entries = 0;
      jitter.forEach((proximities, i) => {
        const at = new Date(t('14:00:00').getTime() + i * 5000);
        const d = decideEntries(state, at, proximities, TTL_MS);
        entries += d.enteredAreaIds.length;
        state = { areaIds: d.nextAreaIds, lastLocationAt: at };
      });
      expect(entries).toBe(1);
      expect(state.areaIds).toEqual(['depot']);
    });

    it('lets the user leave once they are beyond the buffer', () => {
      const prev = { areaIds: ['depot'], lastLocationAt: t('14:00:00') };
      const d = decideEntries(prev, t('14:00:05'), [], TTL_MS);
      expect(d.nextAreaIds).toEqual([]);
    });

    it('does not count being in the buffer as an entry (entering requires being inside)', () => {
      const d = decideEntries(NEVER_SEEN, t('14:00:00'), [inBuffer('depot')], TTL_MS);
      expect(d.enteredAreaIds).toEqual([]);
      expect(d.nextAreaIds).toEqual([]);
    });
  });

  describe('scenario 7 – long silence (STATE_TTL)', () => {
    const lastEvening = { areaIds: ['depot'], lastLocationAt: new Date('2026-11-16T18:00:00Z') };

    it('logs a new entry next morning even if the user was in the same area yesterday', () => {
      const d = decideEntries(
        lastEvening,
        new Date('2026-11-17T08:00:00Z'),
        [inside('depot')],
        TTL_MS,
      );
      expect(d.previousStateExpired).toBe(true);
      expect(d.enteredAreaIds).toEqual(['depot']);
    });

    it('keeps the state across short gaps (elevator, tunnel)', () => {
      const prev = { areaIds: ['depot'], lastLocationAt: t('14:00:00') };
      const d = decideEntries(prev, t('14:02:00'), [inside('depot')], TTL_MS);
      expect(d.previousStateExpired).toBe(false);
      expect(d.enteredAreaIds).toEqual([]);
    });

    it('does not keep an expired area alive through the exit buffer', () => {
      const d = decideEntries(
        lastEvening,
        new Date('2026-11-17T08:00:00Z'),
        [inBuffer('depot')],
        TTL_MS,
      );
      expect(d.nextAreaIds).toEqual([]);
    });
  });
});
