import fs from 'node:fs';
import path from 'node:path';

import ffmpeg from 'fluent-ffmpeg';
import { Clip } from './types';
import { Chapter, downloadVideo, getVideoChapters, Video } from './youtube-api';
import { hasSound } from './has-sound';

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
      // Crop to 9:16 aspect ratio, content centered
      .videoFilter('crop=ih*9/16:ih')
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
function findShortestMiddleChapter(chapters: Chapter[]): Chapter | null {
  const videoDuration = chapters.at(-1)!.end;
  const middle = videoDuration / 2;
  let closestChapter: Chapter | null = null;
  let smallestDuration = Number.MAX_SAFE_INTEGER;

  chapters.forEach((chapter) => {
    const duration = chapter.duration;
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
  const chapters = await getVideoChapters(videoId);

  if (!chapters.length) {
    console.log('No chapters found in the video description.');
    return null;
  }

  const quickBitsNames = [
    'quick bits intro',
    'quick bits',
    'quick intro',
    'quaint blips',
  ];
  const quickBitsChapter = findChapterByName(chapters, quickBitsNames);

  return quickBitsChapter ?? findShortestMiddleChapter(chapters);
}

async function removeFilesWithPrefix(prefix: string, directory: string) {
  // Read all files in the directory
  const files = await fs.promises.readdir(directory);

  // Filter the files that start with the given prefix (YouTube video ID)
  const filesToDelete = files.filter((file) => file.startsWith(prefix));

  if (filesToDelete.length === 0) {
    return;
  }
  await Promise.allSettled(
    filesToDelete.map((file) => fs.promises.unlink(path.join(directory, file))),
  );
}

export async function* extractQuickBitsChapter({
  videoId,
  title,
  publishedAt,
}: Video): AsyncGenerator<Clip, undefined> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const videoPath = `./videos/${videoId}.mp4`;
  const clipPath = `./videos/${videoId}_quick_bits.mp4`;

  try {
    console.log(`Processing video: ${title}`);
    // Download video and find chapter concurrently
    const [chapter] = await Promise.all([
      findQuickBitsChapter(videoId),
      downloadVideo(videoUrl, videoPath),
    ]);

    if (!chapter) {
      console.log('No "Quick Bits" chapter found.', videoUrl);
      return;
    }

    const doesFullVideoHaveSound = await hasSound(videoPath);
    if (!doesFullVideoHaveSound) {
      console.log('Video has no audio. Skipping...');
      return;
    }

    console.log('Extracting "Quick Bits" chapter...');
    await extractChapter(
      videoPath,
      clipPath,
      String(chapter.start - 2),
      String(chapter.duration + 4),
    );

    const doesClipHaveSound = await hasSound(clipPath);
    if (!doesClipHaveSound) {
      console.log('Clip has no audio. Skipping...');
      return;
    }

    yield { id: videoId, title, path: clipPath, publishedAt };
  } finally {
    console.log('Removing downloaded files...');
    try {
      await removeFilesWithPrefix(videoId, './videos');
    } catch {
      console.error('Error removing downloaded files for video :', videoId);
    }
  }
}
