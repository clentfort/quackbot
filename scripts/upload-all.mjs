#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { extractQuickBitsChapter } from '../dist/extract-quick-bits.js';
// import { uploadToPlatforms } from '../dist/upload-to-platforms';
// import { initDb, isUploadedToAllPlatforms } from '../dist/db';

const videosRaw = fs.readFileSync('./videos.json', 'utf-8');
const videos = JSON.parse(videosRaw).reverse();

async function main() {
  // const db = await initDb();
  let i = 0;
  for (const video of videos) {
    // const needsToBeProcessed = await isUploadedToAllPlatforms(
    //   db,
    //   video.videoId,
    // );

    // if (needsToBeProcessed) {
    //   console.log(
    //     `Video ${video.title} has already been uploaded to all platforms. Skipping...`,
    //   );
    //   continue;
    // }

    try {
      for await (const quickbits of extractQuickBitsChapter(video)) {
        // i++;
        // await uploadToPlatforms(quickbits);
        // if (i % 3 === 0) {
        //   await new Promise((resolve) =>
        //     setTimeout(resolve, 1000 * 60 * 60 * 24),
        //   );
        // }
      }
    } catch (error) {
      console.log(
        `Error extracting Quick Bits from video ${video.title}`,
        error,
      );
    }
  }
}

main();
