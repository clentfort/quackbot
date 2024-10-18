import fs from 'node:fs';
import path from 'node:path';

import ffmpeg from 'fluent-ffmpeg';
import { Clip } from './types';
import { Chapter, downloadVideo, getVideoChapters, Video } from './youtube-api';
import { hasSound } from './has-sound';

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
        resolve();
      })
      .on('error', (err) =>
        reject(new Error(`Error extracting chapter: ${err.message}`)),
      )
      .run();
  });
}

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

async function findQuickBitsChapter(
  videoId: string,
): Promise<Chapter | undefined> {
  const chapters = await getVideoChapters(videoId);

  if (!chapters.length) {
    console.error('No chapters found in the video description.');
    return;
  }

  const quickBitsNames = ['quick bits intro', 'quick bits', 'quaint blips'];
  return findChapterByName(chapters, quickBitsNames);
}

async function removeFilesWithPrefix(prefix: string, directory: string) {
  const files = await fs.promises.readdir(directory);
  const filesToDelete = files.filter((file) => file.startsWith(prefix));
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

  // Download video and find chapter concurrently
  const [chapter] = await Promise.all([
    findQuickBitsChapter(videoId),
    downloadVideo(videoUrl, videoPath),
  ]);

  if (!chapter) {
    throw new Error('No "Quick Bits" chapter found.');
  }

  const doesFullVideoHaveSound = await hasSound(videoPath);
  if (!doesFullVideoHaveSound) {
    throw new Error('Video has no audio.');
  }

  await extractChapter(
    videoPath,
    clipPath,
    String(chapter.start - 2),
    String(chapter.duration + 4),
  );

  const doesClipHaveSound = await hasSound(clipPath);
  if (!doesClipHaveSound) {
    throw new Error('Extracted clip has no audio.');
  }

  yield { id: videoId, title, path: clipPath, publishedAt };

  try {
    await removeFilesWithPrefix(videoId, './videos');
  } catch {
    console.error('Error removing downloaded files for video :', videoId);
  }
}
