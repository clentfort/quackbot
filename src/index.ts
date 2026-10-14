import 'dotenv/config';

import fs from 'node:fs';
import path from 'node:path';

import cron from 'node-cron';
import he from 'he';

import { initDb, getPendingPlatforms, getUploadsToday } from './db';
import { extractQuickBitsChapter } from './extract-quick-bits';
import { uploadToPlatforms } from './upload-to-platforms';
import { getLatestVideos, Video } from './youtube-api';
import { Platform, TWITTER, YOUTUBE } from './types';
import { ENABLED_PLATFORMS } from './platforms';
import { logger } from './logger';
import { updateHassStatus } from './hass';

async function loadExtraVideos() {
  const videosRaw = fs.readFileSync(
    path.join(__dirname, '../videos.json'),
    'utf-8',
  );
  const extraVideos = (JSON.parse(videosRaw) as Array<Video>).reverse();

  extraVideos.forEach((video) => {
    video.title = he.decode(video.title);
  });
  return extraVideos;
}

const MAX_VIDEOS_PER_DAY = 5;

let runs = 0;
let running = false;

/** Keep hourly runs from overlapping while draining the backlog. */
async function main() {
  if (running) {
    logger.log('Previous run is still processing; skipping this run');
    return;
  }
  running = true;
  try {
    await processVideos();
  } finally {
    running = false;
  }
}

async function processVideos() {
  runs++;
  await updateHassStatus({ state: 'Processing', attributes: { runs } });
  const db = await initDb();
  const uploadedToday = await getUploadsToday(db);
  const blockedPlatforms = new Set<Platform>();
  let [videos, extraVideos] = await Promise.all([
    getLatestVideos(50),
    loadExtraVideos(),
  ]);

  const isLastRunOfTheDay = new Date().getHours() === 23;
  if (isLastRunOfTheDay) {
    logger.log('Last run of the day, trying to process all videos');
    videos = [...videos, ...extraVideos];
  } else {
    logger.log(`Processing latest videos, run ${runs}`);
  }

  // Deduplicate before processing oldest first (backlog first).
  videos = [
    ...new Map(videos.map((video) => [video.videoId, video])).values(),
  ].reverse();

  let processedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const video of videos) {
    const availablePlatforms = ENABLED_PLATFORMS.filter(
      (platform) =>
        uploadedToday[platform] < MAX_VIDEOS_PER_DAY &&
        !blockedPlatforms.has(platform),
    );
    if (!availablePlatforms.length) {
      logger.log('Daily upload limits reached or platforms unavailable');
      break;
    }
    const pending = await getPendingPlatforms(db, video.videoId);
    const eligiblePlatforms = pending.filter((platform) =>
      availablePlatforms.includes(platform),
    );
    if (!eligiblePlatforms.length) {
      skippedCount++;
      continue;
    }

    try {
      logger.log(`Processing video ${video.videoId} - ${video.title}`);
      await updateHassStatus({
        state: 'Processing Video',
        attributes: { videoId: video.videoId, title: video.title },
      });
      let uploaded = false;
      for await (const clip of extractQuickBitsChapter(video)) {
        const results = await uploadToPlatforms(clip, eligiblePlatforms);
        for (const result of results) {
          if (result.uploaded) {
            uploadedToday[result.platform]++;
            uploaded = true;
          }
          if (result.blocked) blockedPlatforms.add(result.platform);
        }
      }
      if (uploaded) processedCount++;
      else failedCount++;
    } catch (error) {
      failedCount++;
      logger.error(
        `Error handling video ${video.videoId} - ${video.title}:`,
        error,
      );
    }
  }

  logger.log(`Run summary:
    Total checked: ${processedCount + skippedCount + failedCount}
    Processed: ${processedCount}
    Skipped: ${skippedCount}
    Failed: ${failedCount}
    YouTube uploads today: ${uploadedToday[YOUTUBE]}
    X uploads today: ${uploadedToday[TWITTER]}
  `);

  await updateHassStatus({
    state: 'Idle',
    attributes: {
      last_run_total: processedCount + skippedCount + failedCount,
      last_run_processed: processedCount,
      last_run_skipped: skippedCount,
      last_run_failed: failedCount,
      videos_uploaded_today: Math.max(...Object.values(uploadedToday)),
      youtube_uploaded_today: uploadedToday[YOUTUBE],
      twitter_uploaded_today: uploadedToday[TWITTER],
    },
  });
}

const task = cron.schedule('0 * * * *', main);

function exit() {
  console.log('Exiting');
  task.stop();
  process.exit();
}

process.on('SIGINT', exit);
process.on('SIGTERM', exit);

export { main, MAX_VIDEOS_PER_DAY };
