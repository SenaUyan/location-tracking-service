/**
 * Pure area-entry detection rules (no I/O), so every business decision is unit-testable.
 *
 * Vocabulary
 * - inside:           the point is covered by the polygon, boundary included (ST_Covers).
 * - withinExitBuffer: the point is at most EXIT_BUFFER_METERS away from the polygon.
 *
 * Rules
 * 1. Stale:      a location not newer than the last processed one never changes state
 *                (out-of-order delivery, client retries / duplicates).
 * 2. Expiry:     if the last processed location is older than STATE_TTL, the previous state is
 *                forgotten – the user is treated as seen for the first time (new session).
 * 3. Entry:      an area the user is inside now, but was not in before, is an entry.
 *                No previous state → every area the user is inside counts as an entry.
 * 4. Hysteresis: entering is immediate, leaving requires moving more than EXIT_BUFFER_METERS
 *                away. A user that was in an area and is now outside but still within the buffer
 *                is kept "in" the area, so GPS jitter on the boundary creates no fake re-entries.
 * Areas are independent: overlapping areas each get their own entry.
 */

export interface PreviousState {
  areaIds: readonly string[];
  /** Device timestamp of the last processed location, null if never processed. */
  lastLocationAt: Date | null;
}

export interface AreaProximity {
  areaId: string;
  inside: boolean;
  withinExitBuffer: boolean;
}

export interface EntryDecision {
  /** Areas the user just entered → one log row each. */
  enteredAreaIds: string[];
  /** Areas to store as the user's new state. */
  nextAreaIds: string[];
  /** True when the previous state was ignored because of STATE_TTL. */
  previousStateExpired: boolean;
}

/** Rule 1 */
export function isStale(previous: PreviousState, timestamp: Date): boolean {
  return (
    previous.lastLocationAt !== null && timestamp.getTime() <= previous.lastLocationAt.getTime()
  );
}

/** Rules 2-4. Callers must check `isStale` first. */
export function decideEntries(
  previous: PreviousState,
  timestamp: Date,
  proximities: readonly AreaProximity[],
  stateTtlMs: number,
): EntryDecision {
  const previousStateExpired =
    previous.lastLocationAt !== null &&
    timestamp.getTime() - previous.lastLocationAt.getTime() > stateTtlMs;

  const wasIn = new Set(previousStateExpired ? [] : previous.areaIds);

  const insideNow = proximities.filter((p) => p.inside).map((p) => p.areaId);
  const keptByBuffer = proximities
    .filter((p) => !p.inside && p.withinExitBuffer && wasIn.has(p.areaId))
    .map((p) => p.areaId);

  return {
    enteredAreaIds: insideNow.filter((id) => !wasIn.has(id)).sort(),
    nextAreaIds: [...new Set([...insideNow, ...keptByBuffer])].sort(),
    previousStateExpired,
  };
}
