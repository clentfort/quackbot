import 'dotenv/config';

import { env } from 'node:process';

import axios from 'axios';
import * as he from 'he';
import { exec } from 'youtube-dl-exec';

const CHANNEL_ID = env.CHANNEL_ID!;
const YOUTUBE_API_KEY = env.YOUTUBE_API_KEY!;

interface YoutubeId {
  id: { videoId: string };
}

interface YoutubeSnippet {
  snippet: {
    publishedAt: string;
    title: string;
    description: string;
  };
}

interface YoutubeContentDetails {
  contentDetails: { duration: string };
}

export interface Video {
  videoId: string;
  title: string;
  publishedAt: string;
}

export interface Chapter {
  end: number;
  title: string;
  duration: number;
  start: number;
}

// Fetch latest videos from the channel
export async function getLatestVideos(): Promise<Array<Video>> {
  const url = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${CHANNEL_ID}&order=date&part=snippet&type=video&maxResults=5`;
  const response = await axios.get<{
    items: Array<YoutubeId & YoutubeSnippet>;
  }>(url);

  return response.data.items.map(
    ({ id: { videoId }, snippet: { title, publishedAt } }) => ({
      videoId,
      title: he.decode(title),
      publishedAt,
    }),
  );
}

// Fetch video metadata including chapter details
async function getVideoDetails(videoId: string) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
  const response = await axios.get<{
    items: Array<YoutubeId & YoutubeSnippet & YoutubeContentDetails>;
  }>(url);
  return response.data.items[0];
}

// Download a video using youtube-dl
export async function downloadVideo(videoUrl: string, output: string) {
  return exec(videoUrl, { output, quiet: true, format: 'mp4' });
}

export async function getVideoChapters(videoId: string): Promise<Chapter[]> {
  const videoData = await getVideoDetails(videoId);
  const videoDuration = parseDuration(videoData.contentDetails.duration);
  return parseChaptersFromDescription(
    videoData.snippet.description,
    videoDuration,
  );
}

// Parse ISO 8601 duration to seconds
export function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match || duration === 'PT') { // Ensure at least one component is present
    throw new Error('Invalid duration format. Duration must include at least one time component (H, M, or S).');
  }
  // Extract H, M, S and default to '0' if not present
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  return hours * 3600 + minutes * 60 + seconds;
}

// Parse chapters from the video description
export function parseChaptersFromDescription(
  description: string,
  videoDuration: number,
): Chapter[] {
  // Regex to capture HH:MM:SS or MM:SS, then optional multiple hyphens/dashes with spaces, then title
  const chapterRegex = /(\d{1,2}:)?(\d{1,2}:\d{2})\s*(?:(?:[-–—]+\s*)+)?(.+)/g;
  const chapters: Chapter[] = [];
  let match: RegExpExecArray | null;

  while ((match = chapterRegex.exec(description)) !== null) {
    const timeParts = match[2].split(':').map(Number);
    let hours = 0;
    let minutes, seconds;

    if (timeParts.length === 3) { // HH:MM:SS
      [hours, minutes, seconds] = timeParts;
    } else { // MM:SS
      [minutes, seconds] = timeParts;
    }
    const start = (hours * 3600) + (minutes * 60) + seconds;
    const title = match[3].trim();
    chapters.push({ title, start, end: 0, duration: 0 });
  }

  // Filter out any chapters that might have parsed incorrectly (e.g., start time beyond video duration)
  const validChapters = chapters.filter(chap => chap.start <= videoDuration);

  for (let i = 0; i < validChapters.length; i++) {
    validChapters[i].end = validChapters[i + 1]?.start ?? videoDuration;
    // Ensure end time does not exceed video duration, especially for the last chapter.
    if (validChapters[i].end > videoDuration) {
      validChapters[i].end = videoDuration;
    }
    validChapters[i].duration = validChapters[i].end - validChapters[i].start;
  }

  return validChapters;
}
