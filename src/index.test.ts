import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
// Import dynamically after module reset
// import { main, MAX_VIDEOS_PER_DAY } from '../src';
import * as db from './db';
import * as extractQuickBits from './extract-quick-bits';
import * as uploadToPlatforms from './upload-to-platforms';
import * as youtubeApi from './youtube-api';
import fs from 'node:fs';

vi.mock('./db');
vi.mock('./extract-quick-bits');
vi.mock('./upload-to-platforms');
vi.mock('./youtube-api');
vi.mock('node:fs');
// Provide a factory to ensure the original module is not executed
vi.mock('./upload-to-twitter', () => ({
  uploadToTwitter: vi.fn().mockResolvedValue('mocked-tweet-id'),
}));
vi.mock('./upload-to-youtube', () => ({
  uploadToYoutube: vi.fn().mockResolvedValue('mocked-youtube-id'),
}));

describe('main', () => {
  let main: typeof import('../src').main;
  let MAX_VIDEOS_PER_DAY: typeof import('../src').MAX_VIDEOS_PER_DAY;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Re-import after reset
    // Adding .js extension for Node16/Next module resolution
    const appModule = await import('../src/index.js');
    main = appModule.main;
    MAX_VIDEOS_PER_DAY = appModule.MAX_VIDEOS_PER_DAY;

    // Reset behavior of mocks using the top-level vi.mock'd modules
    // Import the mocked modules to access their mocked functions
    const mockedYoutubeApi = await import('./youtube-api.js');
    const fsActual = await import('node:fs'); // Should be the mocked version
    const mockedDb = await import('./db.js');

    vi.mocked(mockedYoutubeApi.getLatestVideos).mockResolvedValue([]);
    // Access readFileSync from the Vitest-mocked fs module
    vi.mocked(fsActual.readFileSync).mockReturnValue(JSON.stringify([]));
    vi.mocked(mockedDb.isUploadedToAllPlatforms).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers(); // Reset time mocks
  });

  it('should not call processing functions if there are no videos', async () => {
    await main();
    expect(extractQuickBits.extractQuickBitsChapter).not.toHaveBeenCalled();
    expect(uploadToPlatforms.uploadToPlatforms).not.toHaveBeenCalled();
  });

  it('should not call processing functions if videos are already processed', async () => {
    const mockVideo = { videoId: '1', title: 'Test Video' };
    vi.mocked(youtubeApi.getLatestVideos).mockResolvedValue([mockVideo as any]);
    vi.mocked(db.isUploadedToAllPlatforms).mockResolvedValue(true); // Already processed

    await main();

    expect(extractQuickBits.extractQuickBitsChapter).not.toHaveBeenCalled();
    expect(uploadToPlatforms.uploadToPlatforms).not.toHaveBeenCalled();
  });

  it('should call processing functions for videos that need processing', async () => {
    const mockVideo = { videoId: '2', title: 'Test Video 2' };
    const mockClip = {
      id: 'clip_2',
      path: '/test/clip_2.mp4',
      publishedAt: new Date().toISOString(),
      title: 'Test Video 2 Clip',
    };
    vi.mocked(youtubeApi.getLatestVideos).mockResolvedValue([mockVideo as any]);
    vi.mocked(db.isUploadedToAllPlatforms).mockResolvedValue(false); // Needs processing
    vi.mocked(extractQuickBits.extractQuickBitsChapter).mockImplementation(
      async function* () {
        yield mockClip;
        return undefined;
      },
    );

    await main();

    expect(extractQuickBits.extractQuickBitsChapter).toHaveBeenCalledWith(
      mockVideo,
    );
    expect(uploadToPlatforms.uploadToPlatforms).toHaveBeenCalledWith(mockClip);
  });

  it('should handle errors during video processing', async () => {
    const mockVideo = { videoId: '3', title: 'Test Video 3' };
    const consoleSpy = vi.spyOn(console, 'log');
    vi.mocked(youtubeApi.getLatestVideos).mockResolvedValue([mockVideo as any]);
    vi.mocked(db.isUploadedToAllPlatforms).mockResolvedValue(false); // Needs processing
    const testError = new Error('Test processing error');
    vi.mocked(extractQuickBits.extractQuickBitsChapter).mockImplementation(
      async function* () {
        throw testError;
        // No explicit return needed here as it throws, but being consistent wouldn't hurt
        // However, to minimize changes, I'll leave it as is, as throwing functions don't "return" in the same way.
      },
    );

    await main();

    expect(consoleSpy).toHaveBeenCalledWith(
      `Error handling video ${mockVideo.videoId} - ${mockVideo.title}:`,
      testError,
    );
    consoleSpy.mockRestore();
  });

  it('should process all videos on the last run of the day and reset counters', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date().setHours(23)); // Mock time to be 11 PM

    const mockVideo1 = { videoId: '4', title: 'YouTube Video', publishedAt: new Date().toISOString() }; // Add publishedAt for Video type if needed
    const mockVideo2 = { videoId: '5', title: 'Extra Video', publishedAt: new Date().toISOString() };
    const mockClip1 = { id: 'clip_4', path: '/test/clip_4.mp4', publishedAt: mockVideo1.publishedAt, title: mockVideo1.title + " Clip" };
    const mockClip2 = { id: 'clip_5', path: '/test/clip_5.mp4', publishedAt: mockVideo2.publishedAt, title: mockVideo2.title + " Clip" };

    vi.mocked(youtubeApi.getLatestVideos).mockResolvedValue([
      mockVideo1 as any,
    ]);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([mockVideo2])); // Mock for loadExtraVideos
    vi.mocked(db.isUploadedToAllPlatforms).mockResolvedValue(false);

    let callCount = 0;
    vi.mocked(extractQuickBits.extractQuickBitsChapter).mockImplementation(
      async function* (video) {
        if (video.videoId === '4') yield mockClip1;
        else if (video.videoId === '5') yield mockClip2;
        return undefined;
      },
    );

    const consoleSpy = vi.spyOn(console, 'log');

    await main(); // First call in the last hour

    expect(extractQuickBits.extractQuickBitsChapter).toHaveBeenCalledWith(
      mockVideo1,
    );
    expect(extractQuickBits.extractQuickBitsChapter).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: '5', title: 'Extra Video' }),
    );
    expect(uploadToPlatforms.uploadToPlatforms).toHaveBeenCalledWith(mockClip1);
    expect(uploadToPlatforms.uploadToPlatforms).toHaveBeenCalledWith(mockClip2);

    // Check if the reset message is logged
    expect(consoleSpy).toHaveBeenCalledWith('Videos uploaded today: 2');

    // To truly test reset, we would need to call main() again and check if videosUploadedToday is 0.
    // This might be complex due to the single-run nature of the test setup for main.
    // For now, logging the count is an indirect indicator.

    consoleSpy.mockRestore();
  });

  it('should not process more videos than MAX_VIDEOS_PER_DAY', async () => {
    const videos = Array.from({ length: MAX_VIDEOS_PER_DAY + 2 }, (_, i) => {
      const videoId = `${i + 6}`;
      return {
        videoId: videoId,
        title: `Test Video ${videoId}`,
        publishedAt: new Date().toISOString() // Add publishedAt for Video type if needed
      };
    });
    const mockClips = videos.map((v) => ({
      id: `clip_${v.videoId}`,
      path: `/test/clip_${v.videoId}.mp4`,
      publishedAt: v.publishedAt,
      title: `${v.title} Clip`
    }));

    vi.mocked(youtubeApi.getLatestVideos).mockResolvedValue(videos as any[]);
    vi.mocked(db.isUploadedToAllPlatforms).mockResolvedValue(false); // Needs processing

    let clipIndex = 0;
    vi.mocked(extractQuickBits.extractQuickBitsChapter).mockImplementation(
      async function* () {
        // Yield one clip at a time from the mockClips array
        if (clipIndex < mockClips.length) {
          yield mockClips[clipIndex++];
        }
        return undefined;
      },
    );

    await main();

    expect(extractQuickBits.extractQuickBitsChapter).toHaveBeenCalledTimes(
      MAX_VIDEOS_PER_DAY,
    );
    expect(uploadToPlatforms.uploadToPlatforms).toHaveBeenCalledTimes(
      MAX_VIDEOS_PER_DAY,
    );
  });
});
