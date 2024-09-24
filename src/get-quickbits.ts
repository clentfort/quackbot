import fs from 'node:fs';
import { env } from 'node:process';

import 'dotenv/config';

import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import { exec } from 'youtube-dl-exec';

const CHANNEL_ID = env.CHANNEL_ID!;
const YOUTUBE_API_KEY = env.YOUTUBE_API_KEY!;

interface Chapter {
  end: number;
  title: string;
  duration: number;
  start: number;
}

// Fetch latest videos from the channel
async function getLatestVideos() {
  const url = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${CHANNEL_ID}&order=date&part=snippet&type=video&maxResults=5`;
  const response = await axios.get(url);
  return response.data.items;
}

// Download a video using youtube-dl
async function downloadVideo(videoUrl: string, output: string) {
  return exec(videoUrl, { output, quiet: true, format: 'mp4' });
}

// Extract a specific chapter using ffmpeg
async function extractChapter(
  inputFilePath: string,
  outputFilePath: string,
  startTime: string,
  duration: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputFilePath)
      .setStartTime(startTime)
      .setDuration(duration)
      .output(outputFilePath)
      .on('end', () => {
        console.log('Chapter extracted successfully.');
        resolve();
      })
      .on('error', (err) =>
        reject(new Error(`Error extracting chapter: ${err.message}`)),
      )
      .run();
  });
}

// Fetch video metadata including chapter details
async function getVideoDetails(videoId: string) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
  const response = await axios.get(url);
  return response.data.items[0];
}

// Parse ISO 8601 duration to seconds
function parseDuration(duration: string): number {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) {
    throw new Error('Invalid duration format.');
  }
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

// Find chapters by name (fuzzy search)
function findChapterByName(
  chapters: Chapter[],
  targetNames: string[],
): Chapter | undefined {
  const normalizedNames = targetNames.map((name) => name.toLowerCase());

  return chapters.find((chapter) =>
    normalizedNames.some((target) =>
      chapter.title.toLowerCase().includes(target),
    ),
  );
}

// Find the shortest chapter near the middle of the video
function findShortestMiddleChapter(
  chapters: Chapter[],
  videoDuration: number,
): Chapter | null {
  const middle = videoDuration / 2;
  let closestChapter: Chapter | null = null;
  let smallestDuration = Number.MAX_SAFE_INTEGER;

  chapters.forEach((chapter) => {
    const duration = chapter.end - chapter.start;
    const distanceFromMiddle = Math.abs(chapter.start - middle);
    if (duration < smallestDuration && distanceFromMiddle < videoDuration / 4) {
      smallestDuration = duration;
      closestChapter = chapter;
    }
  });

  return closestChapter;
}

// Main function to find "Quick Bits" chapter or fallback
async function findQuickBitsChapter(videoId: string): Promise<Chapter | null> {
  try {
    const videoData = await getVideoDetails(videoId);
    const videoDuration = parseDuration(videoData.contentDetails.duration);
    const chapters = parseChaptersFromDescription(
      videoData.snippet.description,
      videoDuration,
    );

    if (!chapters.length)
      throw new Error('No chapters found in the video description.');

    const quickBitsNames = ['quick bits intro', 'quick bits', 'quick intro'];
    const quickBitsChapter = findChapterByName(chapters, quickBitsNames);

    return (
      quickBitsChapter || findShortestMiddleChapter(chapters, videoDuration)
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error finding chapter:', error.message);
    }
    return null;
  }
}

// Parse chapters from the video description
function parseChaptersFromDescription(
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
    chapters[i].end = chapters[i + 1]?.start || videoDuration;
    chapters[i].duration = chapters[i].end - chapters[i].start;
  }

  return chapters;
}

export async function* getQuickbits() {
  const videos = await getLatestVideos();
  for (const video of videos) {
    const videoId = video.id.videoId;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const videoTitle = video.snippet.title;
    const downloadedFilePath = `./videos/${videoId}.mp4`;
    const quickBitsOutputPath = `./videos/${videoId}_quick_bits.mp4`;

    console.log(`Processing video: ${videoTitle}`);

    // Download video and find chapter concurrently
    const [chapter] = await Promise.all([
      findQuickBitsChapter(videoId),
      downloadVideo(videoUrl, downloadedFilePath),
    ]);

    if (!chapter) {
      console.log('No "Quick Bits" chapter found.');
      continue;
    }

    console.log('Extracting "Quick Bits" chapter...');
    await extractChapter(
      downloadedFilePath,
      quickBitsOutputPath,
      String(chapter.start - 2),
      String(chapter.duration + 4),
    );

    yield {
      videoId,
      videoTitle,
      quickBitsOutputPath,
    };

    console.log('Removing downloaded files...');

    // Clean up files
    await Promise.all([
      fs.promises.unlink(downloadedFilePath),
      fs.promises.unlink(quickBitsOutputPath),
    ]);
  }
}
