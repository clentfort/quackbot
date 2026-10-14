import { vi, describe, it, expect, beforeEach } from 'vitest';
import { uploadToPlatforms } from './upload-to-platforms';
import {
  initDb,
  shouldUploadToPlatform,
  logUploadError,
  saveUpload,
} from './db';
import { uploadToTwitter } from './upload-to-twitter';
import { uploadToYoutube } from './upload-to-youtube';
import { sendHassNotification } from './hass';
import { logger } from './logger';
import { TWITTER, YOUTUBE, type Clip } from './types';

vi.mock('./db');
vi.mock('./upload-to-twitter', () => ({ uploadToTwitter: vi.fn() }));
vi.mock('./upload-to-youtube', () => ({ uploadToYoutube: vi.fn() }));
vi.mock('./hass', () => ({ sendHassNotification: vi.fn() }));
vi.mock('./logger', () => ({ logger: { log: vi.fn(), error: vi.fn() } }));

const clip: Clip = {
  id: 'test',
  title: 'Test',
  publishedAt: '2026-09-01',
  path: '/clip.mp4',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(shouldUploadToPlatform).mockResolvedValue(true);
  vi.mocked(uploadToYoutube).mockResolvedValue('youtube-id');
  vi.mocked(uploadToTwitter).mockResolvedValue('tweet-id');
});

describe('uploadToPlatforms', () => {
  it('uploads only to requested platforms', async () => {
    expect(await uploadToPlatforms(clip, [YOUTUBE])).toEqual([
      { platform: YOUTUBE, uploaded: true },
    ]);
    expect(uploadToTwitter).not.toHaveBeenCalled();
    expect(saveUpload).toHaveBeenCalledWith(
      await initDb(),
      clip.id,
      YOUTUBE,
      'youtube-id',
    );
  });

  it('skips exhausted retries and existing uploads', async () => {
    vi.mocked(shouldUploadToPlatform).mockResolvedValue(false);
    expect(await uploadToPlatforms(clip)).toEqual([
      { platform: YOUTUBE, uploaded: false },
      { platform: TWITTER, uploaded: false },
    ]);
    expect(uploadToYoutube).not.toHaveBeenCalled();
    expect(uploadToTwitter).not.toHaveBeenCalled();
  });

  it('reports successful YouTube uploads even when X requires payment', async () => {
    const error = Object.assign(new Error('Request failed with code 402'), {
      code: 402,
    });
    vi.mocked(uploadToTwitter).mockRejectedValue(error);
    expect(await uploadToPlatforms(clip)).toEqual([
      { platform: YOUTUBE, uploaded: true },
      { platform: TWITTER, uploaded: false, blocked: true },
    ]);
    expect(logUploadError).toHaveBeenCalledWith(
      await initDb(),
      clip.id,
      TWITTER,
      error,
    );
    expect(sendHassNotification).toHaveBeenCalled();
  });

  it.each([401, 429])('blocks further uploads on HTTP %s', async (code) => {
    vi.mocked(uploadToTwitter).mockRejectedValue(
      Object.assign(new Error('Rejected'), { code }),
    );
    expect(await uploadToPlatforms(clip, [TWITTER])).toEqual([
      { platform: TWITTER, uploaded: false, blocked: true },
    ]);
  });

  it('does not block the platform for a clip-specific error', async () => {
    vi.mocked(uploadToTwitter).mockRejectedValue(new Error('Invalid media'));
    expect(await uploadToPlatforms(clip, [TWITTER])).toEqual([
      { platform: TWITTER, uploaded: false, blocked: false },
    ]);
  });

  it('does not hide database failures or lose the other platform’s success', async () => {
    vi.mocked(uploadToTwitter).mockRejectedValue(new Error('Invalid media'));
    vi.mocked(logUploadError).mockRejectedValue(new Error('Database failed'));
    expect(await uploadToPlatforms(clip)).toEqual([
      { platform: YOUTUBE, uploaded: true },
      { platform: TWITTER, uploaded: false, blocked: false },
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      'Error recording upload failure for twitter:',
      expect.any(Error),
    );
  });

  it('preserves results if sending a notification fails', async () => {
    vi.mocked(uploadToTwitter).mockRejectedValue(
      Object.assign(new Error('Payment required'), { code: 402 }),
    );
    vi.mocked(sendHassNotification).mockRejectedValue(new Error('Unavailable'));
    expect(await uploadToPlatforms(clip, [TWITTER])).toEqual([
      { platform: TWITTER, uploaded: false, blocked: true },
    ]);
  });
});
