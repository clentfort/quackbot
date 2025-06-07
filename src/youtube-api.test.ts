import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios'; // Needed for mocking axios.get
import { exec } from 'youtube-dl-exec'; // Needed for mocking exec

import {
  parseDuration,
  parseChaptersFromDescription,
  getLatestVideos,
  downloadVideo,
  getVideoChapters,
} from './youtube-api';

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
  },
}));

describe('parseDuration', () => {
  // Valid inputs
  it('should parse valid ISO 8601 durations', () => {
    expect(parseDuration('PT1H')).toBe(3600);
    expect(parseDuration('PT1M')).toBe(60);
    expect(parseDuration('PT1S')).toBe(1);
    expect(parseDuration('PT1H1M1S')).toBe(3661);
    expect(parseDuration('PT10M30S')).toBe(630);
  });

  // Invalid inputs
  it('should handle invalid ISO 8601 durations', () => {
    expect(() => parseDuration('P1D')).toThrow('Invalid duration format.');
    expect(parseDuration('PT')).toBe(0);
    expect(() => parseDuration('invalid-string')).toThrow('Invalid duration format.');
  });
});

describe('parseChaptersFromDescription', () => {
  it('should return an empty array if no chapters are found', () => {
    const description = "This is a video description without any chapters.";
    const videoDuration = 300; // 5 minutes
    expect(parseChaptersFromDescription(description, videoDuration)).toEqual([]);
  });

  it('should parse a single chapter', () => {
    const description = "0:00 Intro";
    const videoDuration = 300;
    const expectedChapters = [
      { start: 0, title: "Intro", end: 300, duration: 300 },
    ];
    expect(parseChaptersFromDescription(description, videoDuration)).toEqual(expectedChapters);
  });

  it('should parse multiple chapters', () => {
    const description = `
      0:00 Intro
      1:30 Main Content
      4:00 Outro
    `;
    const videoDuration = 300; // 5 minutes
    const expectedChapters = [
      { start: 0, title: "Intro", end: 90, duration: 90 },
      { start: 90, title: "Main Content", end: 240, duration: 150 },
      { start: 240, title: "Outro", end: 300, duration: 60 },
    ];
    expect(parseChaptersFromDescription(description, videoDuration)).toEqual(expectedChapters);
  });

  it('should parse chapters with varying title formats (reverted regex behavior)', () => {
    const description = `
      00:00 - Welcome!
      01:15 -- Section 1
      02:30 (Part 2) The Middle
      03:45 END
    `;
    const videoDuration = 300; // 5 minutes
    const expectedChapters = [
      { start: 0, title: "- Welcome!", end: 75, duration: 75 },
      { start: 75, title: "-- Section 1", end: 150, duration: 75 },
      { start: 150, title: "(Part 2) The Middle", end: 225, duration: 75 },
      { start: 225, title: "END", end: 300, duration: 75 },
    ];
    expect(parseChaptersFromDescription(description, videoDuration)).toEqual(expectedChapters);
  });

  it('should return an empty array for descriptions with no timestamps', () => {
    const description = "This video covers several topics but has no timestamps in the description.";
    const videoDuration = 300;
    expect(parseChaptersFromDescription(description, videoDuration)).toEqual([]);
  });

  it('should handle chapters at the very beginning and very end of video duration', () => {
    const description = `
      0:00 Start of the video
      5:00 End of the video
    `;
    const videoDuration = 300; // 5 minutes
    const expectedChapters = [
      { start: 0, title: "Start of the video", end: 300, duration: 300 },
      { start: 300, title: "End of the video", end: 300, duration: 0 },
    ];
    expect(parseChaptersFromDescription(description, videoDuration)).toEqual(expectedChapters);
  });
});

// --- Merged from youtube-api.axios.test.ts ---
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
        { videoId: 'vid2', title: 'Video 2 & Stuff', publishedAt: '2023-01-02T00:00:00Z' },
      ]);
      expect(videos[1].title).toBe('Video 2 & Stuff');
    });

    it('should handle API error for getLatestVideos', async () => {
      (axios.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API Error'));
      await expect(getLatestVideos()).rejects.toThrow('API Error');
    });
  });

  // getVideoDetails is tested indirectly via getVideoChapters.

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
              contentDetails: { duration: 'PT2M30S' }, // 150 seconds
            },
          ],
        },
      };
      (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockVideoDetailsResponse);

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
