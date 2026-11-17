import { Queue } from 'bullmq';
import { AppConfig } from '../config/app-config';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { LocationsService } from './locations.service';

describe('LocationsService', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  const config = {
    locations: { maxFutureSkewSeconds: 300, maxLocationAgeSeconds: 86400 },
  } as AppConfig;
  let queue: { add: jest.Mock };
  let service: LocationsService;

  beforeEach(() => {
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    service = new LocationsService(queue as unknown as Queue, config);
  });

  const dto = (timestamp: string, latitude = 40.98, longitude = 29.02) => ({
    userId: 'u1',
    latitude,
    longitude,
    timestamp,
  });

  const expectCode = async (promise: Promise<unknown>, code: ErrorCode) => {
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).code).toBe(code);
    expect(queue.add).not.toHaveBeenCalled();
    return err as AppException;
  };

  it('enqueues a valid location with a deterministic job id', async () => {
    await expect(service.ingest(dto('2026-11-17T11:59:55Z'), now)).resolves.toEqual({
      status: 'accepted',
    });
    expect(queue.add).toHaveBeenCalledWith(
      'process-location',
      expect.objectContaining({ userId: 'u1', timestamp: '2026-11-17T11:59:55.000Z' }),
      expect.objectContaining({ jobId: `loc_u1_${Date.parse('2026-11-17T11:59:55Z')}` }),
    );
  });

  it('normalizes timezone offsets to UTC', async () => {
    await service.ingest(dto('2026-11-17T14:59:55+03:00'), now);
    expect(queue.add.mock.calls[0][1].timestamp).toBe('2026-11-17T11:59:55.000Z');
  });

  it('tolerates small clock skew', async () => {
    await expect(service.ingest(dto('2026-11-17T12:04:00Z'), now)).resolves.toBeDefined();
  });

  it('rejects timestamps too far in the future and returns the server time', async () => {
    const err = await expectCode(
      service.ingest(dto('2026-11-17T12:10:00Z'), now),
      ErrorCode.TIMESTAMP_IN_FUTURE,
    );
    expect(err.extra.serverTime).toBe(now.toISOString());
    expect(err.getStatus()).toBe(422);
  });

  it('rejects timestamps older than the maximum age', async () => {
    await expectCode(service.ingest(dto('2026-11-16T11:59:00Z'), now), ErrorCode.TIMESTAMP_TOO_OLD);
  });

  it('rejects (0, 0) – a failed GPS fix', async () => {
    await expectCode(
      service.ingest(dto('2026-11-17T11:59:55Z', 0, 0), now),
      ErrorCode.INVALID_COORDINATES,
    );
  });

  it('accepts 0 latitude when longitude is not 0 (the equator is real)', async () => {
    await expect(service.ingest(dto('2026-11-17T11:59:55Z', 0, 32.5), now)).resolves.toBeDefined();
  });
});
