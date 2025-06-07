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
export function parseDuration(duration: string): number { // Added export
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) {
    throw new Error('Invalid duration format.');
  }
  const hours = parseInt(match[1]) ?? 0;
  const minutes = parseInt(match[2]) ?? 0;
  const seconds = parseInt(match[3]) ?? 0;
  return hours * 3600 + minutes * 60 + seconds;
}

// Parse chapters from the video description
export function parseChaptersFromDescription( // Added export
  description: string,
  videoDuration: number,
): Chapter[] {
  const chapterRegex = /(\d{1,2}:\d{2}) (.+)/g;
  const chapters: Chapter[] = [];
  let match: RegExpExecArray | null;

  while ((match = chapterRegex.exec(description)) !== null) {
    const [minutes, seconds] = match[1].split(':').map(Number);
    const start = minutes * 60 + seconds;
    chapters.push({ title: match[2], start, end: 0, duration: 0 });
  }

  for (let i = 0; i < chapters.length; i++) {
    chapters[i].end = chapters[i + 1]?.start ?? videoDuration;
    chapters[i].duration = chapters[i].end - chapters[i].start;
  }

  return chapters;
}
