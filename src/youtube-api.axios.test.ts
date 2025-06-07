import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { exec } from 'youtube-dl-exec';
import {
  getLatestVideos,
  getVideoDetails,
  downloadVideo,
  getVideoChapters,
  // Assuming parseDuration and parseChaptersFromDescription are tested elsewhere
  // and work correctly. We can use them here or mock them if their direct
  // use complicates these specific unit tests. For now, let's assume they work.
} from './youtube-api'; // Assuming youtube-api.ts is in src/

// Mock axios
vi.mock('axios');

// Mock youtube-dl-exec
vi.mock('youtube-dl-exec', () => ({
  exec: vi.fn(),
}));

// Mock node:process to control environment variables
vi.mock('node:process', () => ({
  env: {
    CHANNEL_ID: 'test_channel_id',
    YOUTUBE_API_KEY: 'test_youtube_api_key',
    // Add other env vars if youtube-api.ts uses them directly at the top level
  },
}));


describe('YouTube API Functions (Network Mocks)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getLatestVideos', () => {
    it('should fetch and return latest videos successfully', async () => {
      const mockResponse = {
        data: {
          items: [
            { id: { videoId: 'vid1' }, snippet: { title: 'Video 1', publishedAt: '2023-01-01T00:00:00Z' } },
            { id: { videoId: 'vid2' }, snippet: { title: 'Video 2 &amp; Stuff', publishedAt: '2023-01-02T00:00:00Z' } },
          ],
        },
      };
      (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const videos = await getLatestVideos();

      expect(axios.get).toHaveBeenCalledWith(
        `https://www.googleapis.com/youtube/v3/search?key=test_youtube_api_key&channelId=test_channel_id&order=date&part=snippet&type=video&maxResults=5`
      );
      expect(videos).toEqual([
        { videoId: 'vid1', title: 'Video 1', publishedAt: '2023-01-01T00:00:00Z' },
        { videoId: 'vid2', title: 'Video 2 & Stuff', publishedAt: '2023-01-02T00:00:00Z' }, // he.decode mock might be needed if not implicitly handled
      ]);
       // Test he.decode implicitly by checking the title of video 2
      expect(videos[1].title).toBe('Video 2 & Stuff'); // Assuming he.decode handles &amp;
    });

    it('should handle API error for getLatestVideos', async () => {
      (axios.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API Error'));
      await expect(getLatestVideos()).rejects.toThrow('API Error');
    });
  });

  // getVideoDetails is tested indirectly via getVideoChapters.
  // No direct tests here as it's not an exported function.

  describe('downloadVideo', () => {
    it('should call youtube-dl-exec with correct parameters', async () => {
      (exec as ReturnType<typeof vi.fn>).mockResolvedValue({ stdout: 'downloaded', stderr: '' });
      const videoUrl = 'https://www.youtube.com/watch?v=vid1';
      const outputPath = './videos/vid1.mp4';

      await downloadVideo(videoUrl, outputPath);

      expect(exec).toHaveBeenCalledWith(videoUrl, { output: outputPath, quiet: true, format: 'mp4' });
    });

    it('should handle errors from youtube-dl-exec', async () => {
      (exec as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Download failed'));
      const videoUrl = 'https://www.youtube.com/watch?v=vid1';
      const outputPath = './videos/vid1.mp4';

      await expect(downloadVideo(videoUrl, outputPath)).rejects.toThrow('Download failed');
    });
  });

  describe('getVideoChapters', () => {
    it('should fetch video details and parse chapters', async () => {
      const videoId = 'vidWithChapters';
      const mockVideoDetailsResponse = {
        data: {
          items: [
            {
              snippet: { title: 'Test Video', description: '0:00 Intro\n1:00 Chapter 1', publishedAt: '2023-01-01T00:00:00Z' },
              contentDetails: { duration: 'PT2M30S' }, // 2 minutes 30 seconds = 150 seconds
            },
          ],
        },
      };
      (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockVideoDetailsResponse);

      // parseDuration and parseChaptersFromDescription are already tested.
      // We rely on their correctness here.
      const chapters = await getVideoChapters(videoId);

      expect(axios.get).toHaveBeenCalledWith(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=test_youtube_api_key`
      );
      expect(chapters).toEqual([
        { title: 'Intro', start: 0, end: 60, duration: 60 },
        { title: 'Chapter 1', start: 60, end: 150, duration: 90 },
      ]);
    });

    it('should handle error when fetching video details for getVideoChapters', async () => {
      const videoId = 'vidError';
      (axios.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API Error for details'));

      await expect(getVideoChapters(videoId)).rejects.toThrow('API Error for details');
    });

    it('should handle video with no chapters in description', async () => {
      const videoId = 'vidNoChapters';
       const mockVideoDetailsResponse = {
        data: {
          items: [
            {
              snippet: { title: 'Test Video No Chapters', description: 'Just a plain description.', publishedAt: '2023-01-01T00:00:00Z' },
              contentDetails: { duration: 'PT1M' }, // 60 seconds
            },
          ],
        },
      };
      (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockVideoDetailsResponse);
      const chapters = await getVideoChapters(videoId);
      expect(chapters).toEqual([]);
    });
  });
});
