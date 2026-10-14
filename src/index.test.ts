import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import * as db from './db';
import * as extractQuickBits from './extract-quick-bits';
import * as uploads from './upload-to-platforms';
import * as youtubeApi from './youtube-api';
import * as loggerModule from './logger';
import { TWITTER, YOUTUBE } from './types';
import type { Video } from './youtube-api';

vi.mock('./db', async (importOriginal) => ({
  ...(await importOriginal<typeof db>()),
  initDb: vi.fn(),
  getPendingPlatforms: vi.fn(),
  getUploadsToday: vi.fn(),
}));
vi.mock('./extract-quick-bits');
vi.mock('./upload-to-platforms');
vi.mock('./youtube-api');
vi.mock('./logger', () => ({ logger: { log: vi.fn(), error: vi.fn() } }));
vi.mock('./hass', () => ({ updateHassStatus: vi.fn() }));
vi.mock('node:fs');
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));
vi.mock('./upload-to-twitter', () => ({ uploadToTwitter: vi.fn() }));
vi.mock('./upload-to-youtube', () => ({ uploadToYoutube: vi.fn() }));

const video = (id: string): Video => ({
  videoId: id,
  title: `Video ${id}`,
  publishedAt: '2026-09-01T00:00:00Z',
});

describe('main', () => {
  let main: typeof import('./index').main;
  let limit: number;

  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 14, 12));
    const app = await import('./index.js');
    main = app.main;
    limit = app.MAX_VIDEOS_PER_DAY;

    vi.mocked(youtubeApi.getLatestVideos).mockResolvedValue([]);
    vi.mocked(fs.readFileSync).mockReturnValue('[]');
    vi.mocked(db.getPendingPlatforms).mockResolvedValue([YOUTUBE, TWITTER]);
    vi.mocked(db.getUploadsToday).mockResolvedValue({ youtube: 0, twitter: 0 });
    vi.mocked(extractQuickBits.extractQuickBitsChapter).mockImplementation(
      async function* (source) {
        yield {
          id: source.videoId,
          title: source.title,
          publishedAt: source.publishedAt,
          path: '/clip.mp4',
        };
        return undefined;
      },
    );
    vi.mocked(uploads.uploadToPlatforms).mockImplementation(
      async (_clip, platforms) =>
        (platforms ?? [YOUTUBE, TWITTER]).map((platform) => ({
          platform,
          uploaded: true,
        })),
    );
  });

  afterEach(() => vi.useRealTimers());

  it('does not process an empty list', async () => {
    await main();
    expect(extractQuickBits.extractQuickBitsChapter).not.toHaveBeenCalled();
  });

  it('skips videos with no eligible platforms', async () => {
    vi.mocked(youtubeApi.getLatestVideos).mockResolvedValue([video('done')]);
    vi.mocked(db.getPendingPlatforms).mockResolvedValue([]);
    await main();
    expect(extractQuickBits.extractQuickBitsChapter).not.toHaveBeenCalled();
  });

  it('continues to new YouTube videos when old X uploads fail', async () => {
    const oldestFirst = Array.from({ length: limit }, (_, i) =>
      video(`old-${i}`),
    );
    oldestFirst.push(video('new'));
    vi.mocked(youtubeApi.getLatestVideos).mockResolvedValue(
      oldestFirst.reverse(),
    );
    vi.mocked(db.getPendingPlatforms).mockImplementation(async (_db, id) =>
      id === 'new' ? [YOUTUBE] : [TWITTER],
    );
    vi.mocked(uploads.uploadToPlatforms).mockImplementation(
      async (_clip, platforms) =>
        platforms!.map((platform) => ({
          platform,
          uploaded: platform === YOUTUBE,
        })),
    );
    await main();
    expect(uploads.uploadToPlatforms).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new' }),
      [YOUTUBE],
    );
  });

  it('counts only successful uploads and enforces a separate limit per platform', async () => {
    vi.mocked(youtubeApi.getLatestVideos).mockResolvedValue(
      Array.from({ length: limit + 2 }, (_, i) => video(`${i}`)).reverse(),
    );
    vi.mocked(uploads.uploadToPlatforms).mockImplementation(
      async (_clip, platforms) =>
        platforms!.map((platform) => ({
          platform,
          uploaded: platform === YOUTUBE,
        })),
    );
    await main();
    const calls = vi.mocked(uploads.uploadToPlatforms).mock.calls;
    expect(
      calls.filter(([, platforms]) => platforms!.includes(YOUTUBE)),
    ).toHaveLength(limit);
    expect(
      calls.filter(([, platforms]) => platforms!.includes(TWITTER)),
    ).toHaveLength(limit + 2);
  });

  it('continues YouTube uploads after a payment error blocks X for the run', async () => {
    vi.mocked(youtubeApi.getLatestVideos).mockResolvedValue([
      video('new'),
      video('old'),
    ]);
    vi.mocked(uploads.uploadToPlatforms).mockImplementation(
      async (_clip, platforms) =>
        platforms!.map((platform) => ({
          platform,
          uploaded: platform === YOUTUBE,
          blocked: platform === TWITTER,
        })),
    );
    await main();
    expect(uploads.uploadToPlatforms).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'new' }),
      [YOUTUBE],
    );
  });

  it('uses persisted counts so a restart cannot reset the daily limit', async () => {
    vi.mocked(youtubeApi.getLatestVideos).mockResolvedValue([video('pending')]);
    vi.mocked(db.getUploadsToday).mockResolvedValue({
      youtube: limit,
      twitter: 0,
    });
    await main();
    expect(uploads.uploadToPlatforms).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pending' }),
      [TWITTER],
    );
  });

  it('does not process videos when all platform limits are reached', async () => {
    vi.mocked(youtubeApi.getLatestVideos).mockResolvedValue([video('pending')]);
    vi.mocked(db.getUploadsToday).mockResolvedValue({
      youtube: limit,
      twitter: limit,
    });
    await main();
    expect(extractQuickBits.extractQuickBitsChapter).not.toHaveBeenCalled();
  });

  it('includes and deduplicates the static backlog on the last run', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 23));
    vi.mocked(youtubeApi.getLatestVideos).mockResolvedValue([video('recent')]);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify([video('extra'), video('recent')]),
    );
    await main();
    expect(extractQuickBits.extractQuickBitsChapter).toHaveBeenCalledTimes(2);
    expect(extractQuickBits.extractQuickBitsChapter).toHaveBeenCalledWith(
      video('extra'),
    );
  });

  it('logs extraction errors and continues to the next video', async () => {
    vi.mocked(youtubeApi.getLatestVideos).mockResolvedValue([
      video('good'),
      video('bad'),
    ]);
    const error = new Error('Extraction failed');
    vi.mocked(extractQuickBits.extractQuickBitsChapter).mockImplementationOnce(
      async function* () {
        throw error;
      },
    );
    await main();
    expect(loggerModule.logger.error).toHaveBeenCalledWith(
      'Error handling video bad - Video bad:',
      error,
    );
    expect(uploads.uploadToPlatforms).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'good' }),
      [YOUTUBE, TWITTER],
    );
  });

  it('prevents overlapping runs', async () => {
    let finish!: (videos: Video[]) => void;
    vi.mocked(youtubeApi.getLatestVideos).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = main();
    await main();
    finish([]);
    await first;
    expect(youtubeApi.getLatestVideos).toHaveBeenCalledTimes(1);
  });
});
