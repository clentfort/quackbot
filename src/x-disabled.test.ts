import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Database } from 'sqlite';
import { TWITTER, YOUTUBE, type Clip } from './types';

vi.mock('./upload-to-twitter', () => {
  throw new Error('Disabled X integration must not be initialized');
});
vi.mock('./upload-to-youtube', () => ({
  uploadToYoutube: vi.fn(async () => 'youtube-id'),
}));
vi.mock('./db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./db')>()),
  initDb: vi.fn(),
  shouldUploadToPlatform: vi.fn(async () => true),
  getPendingPlatforms: vi.fn(async () => [YOUTUBE, TWITTER]),
  getUploadsToday: vi.fn(async () => ({ youtube: 0, twitter: 0 })),
  saveUpload: vi.fn(),
}));
vi.mock('./logger', () => ({ logger: { log: vi.fn(), error: vi.fn() } }));
vi.mock('./hass', () => ({
  updateHassStatus: vi.fn(),
  sendHassNotification: vi.fn(),
}));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));
vi.mock('node:fs', () => ({ default: { readFileSync: vi.fn(() => '[]') } }));
vi.mock('./youtube-api', () => ({
  getLatestVideos: vi.fn(async () => [
    { videoId: 'new', title: 'New', publishedAt: '2026-10-14' },
  ]),
}));
vi.mock('./extract-quick-bits', () => ({
  extractQuickBitsChapter: vi.fn(async function* () {
    yield clip;
  }),
}));

const clip: Clip = {
  id: 'new',
  title: 'New',
  publishedAt: '2026-10-14',
  path: '/clip.mp4',
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('X_ENABLED', 'false');
  vi.stubEnv('X_API_KEY', undefined);
  vi.stubEnv('X_API_SECRET', undefined);
  vi.stubEnv('X_ACCESS_TOKEN', undefined);
  vi.stubEnv('X_ACCESS_TOKEN_SECRET', undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('X disabled', () => {
  it('does not initialize or upload to X, even if explicitly requested', async () => {
    const { uploadToPlatforms } = await import('./upload-to-platforms.js');
    expect(await uploadToPlatforms(clip)).toEqual([
      { platform: YOUTUBE, uploaded: true },
    ]);
    expect(await uploadToPlatforms(clip, [TWITTER])).toEqual([]);
  });

  it('schedules YouTube uploads only', async () => {
    const { main } = await import('./index.js');
    await main();
    const { saveUpload } = await import('./db.js');
    expect(saveUpload).toHaveBeenCalledTimes(1);
    expect(saveUpload).toHaveBeenCalledWith(
      undefined,
      clip.id,
      YOUTUBE,
      'youtube-id',
    );
  });

  it('treats YouTube-only uploads as complete without changing X history', async () => {
    const actual = await vi.importActual<typeof import('./db')>('./db');
    const database = {
      get: vi.fn(async (_sql: string, _id: string, platform: string) =>
        platform === YOUTUBE ? { platform_id: 'youtube-id' } : undefined,
      ),
    } as unknown as Database;
    expect(await actual.getPendingPlatforms(database, clip.id)).toEqual([]);
    expect(await actual.shouldProcessVideo(database, clip.id)).toBe(false);
    expect(await actual.isUploadedToAllPlatforms(database, clip.id)).toBe(true);
  });
});
