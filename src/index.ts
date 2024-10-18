import 'dotenv/config';

import fs from 'node:fs';
import path from 'node:path';

import cron from 'node-cron';
import he from 'he';

import { initDb, isUploadedToAllPlatforms } from './db';
import { extractQuickBitsChapter } from './extract-quick-bits';
import { uploadToPlatforms } from './upload-to-platforms';
import { getLatestVideos, Video } from './youtube-api';

const videosRaw = fs.readFileSync(
  path.join(__dirname, '../videos.json'),
  'utf-8',
);
const extraVideos = (JSON.parse(videosRaw) as Array<Video>).reverse();

extraVideos.forEach((video) => {
  video.title = he.decode(video.title);
});

const MAX_VIDEOS_PER_DAY = 5;

let videosUploadedToday = 0;
let runs = 0;
async function main() {
  runs++;
  const db = await initDb();
  let videos = await getLatestVideos();

  const isLastRunOfTheDay = new Date().getHours() === 23;

  // Last run of the day
  if (isLastRunOfTheDay) {
    console.log('Last run of the day, trying to process all videos');
    videos = [...videos, ...extraVideos];
  } else {
    console.log(`Processing latest videos, run ${runs}`);
  }

  for (const video of videos) {
    if (videosUploadedToday >= MAX_VIDEOS_PER_DAY) {
      break;
    }

    const needsToBeProcessed = await isUploadedToAllPlatforms(
      db,
      video.videoId,
    );

    if (needsToBeProcessed) {
      continue;
    }

    try {
      console.log(`Processing video ${video.videoId} - ${video.title}`);
      for await (const clip of extractQuickBitsChapter(video)) {
        await uploadToPlatforms(clip);
      }
      videosUploadedToday++;
    } catch (error) {
      console.log(
        `Error handling video ${video.videoId} - ${video.title}:`,
        error,
      );
    }
  }

  if (isLastRunOfTheDay) {
    console.log(`Videos uploaded today: ${videosUploadedToday}`);
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
