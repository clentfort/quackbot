import 'dotenv/config';

import fs from 'node:fs';
import path from 'node:path';

import cron from 'node-cron';
import he from 'he';

import { initDb, shouldProcessVideo } from './db';
import { extractQuickBitsChapter } from './extract-quick-bits';
import { uploadToPlatforms } from './upload-to-platforms';
import { getLatestVideos, Video } from './youtube-api';
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

let videosUploadedToday = 0;
let runs = 0;
async function main() {
  runs++;
  await updateHassStatus({ state: 'Processing', attributes: { runs } });
  const db = await initDb();
  let [videos, extraVideos] = await Promise.all([
    getLatestVideos(50),
    loadExtraVideos(),
  ]);

  const isLastRunOfTheDay = new Date().getHours() === 23;

  // Last run of the day
  if (isLastRunOfTheDay) {
    logger.log('Last run of the day, trying to process all videos');
    videos = [...videos, ...extraVideos];
  } else {
    logger.log(`Processing latest videos, run ${runs}`);
  }

  // Reverse videos to process oldest first (backlog first)
  videos.reverse();

  let processedCount = 0;
  let skippedCount = 0;

  for (const video of videos) {
    if (videosUploadedToday >= MAX_VIDEOS_PER_DAY) {
      logger.log('Daily upload limit reached');
      break;
    }

    const canBeProcessed = await shouldProcessVideo(db, video.videoId);

    if (!canBeProcessed) {
      skippedCount++;
      continue;
    }

    try {
      logger.log(`Processing video ${video.videoId} - ${video.title}`);
      await updateHassStatus({
        state: 'Processing Video',
        attributes: { videoId: video.videoId, title: video.title },
      });
      for await (const clip of extractQuickBitsChapter(video)) {
        await uploadToPlatforms(clip);
      }
      videosUploadedToday++;
      processedCount++;
    } catch (error) {
      logger.error(
        `Error handling video ${video.videoId} - ${video.title}:`,
        error,
      );
    }
  }

  logger.log(`Run summary:
    Total checked: ${processedCount + skippedCount}
    Processed: ${processedCount}
    Skipped: ${skippedCount}
  `);

  await updateHassStatus({
    state: 'Idle',
    attributes: {
      last_run_total: processedCount + skippedCount,
      last_run_processed: processedCount,
      last_run_skipped: skippedCount,
      videos_uploaded_today: videosUploadedToday,
    },
  });

  if (isLastRunOfTheDay) {
    logger.log(`Videos uploaded today: ${videosUploadedToday}`);
    videosUploadedToday = 0;
    runs = 0;
  }
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
