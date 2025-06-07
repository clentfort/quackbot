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
      title: he.decode(title), // he.decode was part of the "original" I saw
      publishedAt,
    }),
  );
}

// Fetch video metadata including chapter details (not originally exported)
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

// Reverted parseDuration
export function parseDuration(duration: string): number {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) {
    throw new Error('Invalid duration format.');
  }
  // Original logic likely used || 0 for handling NaN from parseInt if a component was missing
  const hours = parseInt(match[1]); // e.g., "1H" -> 1, undefined -> NaN
  const minutes = parseInt(match[2]); // e.g., "1M" -> 1, undefined -> NaN
  const seconds = parseInt(match[3]); // e.g., "1S" -> 1, undefined -> NaN

  // (NaN || 0) is 0. (1 || 0) is 1.
  return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0);
}

// Reverted parseChaptersFromDescription
export function parseChaptersFromDescription(
  description: string,
  videoDuration: number,
): Chapter[] {
  const chapterRegex = /(\d{1,2}:\d{2}) (.+)/g; // Simpler regex
  const chapters: Chapter[] = [];
  let match: RegExpExecArray | null;

  while ((match = chapterRegex.exec(description)) !== null) {
    const timeString = match[1]; // e.g., "0:00" or "01:30"
    const title = match[2]; // Might capture extra things, no .trim()

    // Original simple regex (\d{1,2}:\d{2}) only produces MM:SS like parts
    const [minutes, seconds] = timeString.split(':').map(Number);
    const start = minutes * 60 + seconds;

    chapters.push({ title, start, end: 0, duration: 0 });
  }

  for (let i = 0; i < chapters.length; i++) {
    chapters[i].end = chapters[i + 1]?.start ?? videoDuration;
    chapters[i].duration = chapters[i].end - chapters[i].start;
    // No clamping of end time to videoDuration
    // No filtering of chapters starting after videoDuration
  }
  return chapters;
}
