#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';

import he from 'he';

import { initDb, isUploadedToAllPlatforms } from '../dist/db.js';
import { extractQuickBitsChapter } from '../dist/extract-quick-bits.js';
import { uploadToPlatforms } from '../dist/upload-to-platforms.js';

const videosRaw = fs.readFileSync('./videos.json', 'utf-8');
const videos = JSON.parse(videosRaw).reverse();

async function main() {
  const db = await initDb();
  let i = 0;
  for (const video of videos) {
    const hasBeenUploadedToAllPlatforms = await isUploadedToAllPlatforms(
      db,
      video.videoId,
    );

    if (hasBeenUploadedToAllPlatforms) {
      console.log(
        `Video ${video.title} has already been uploaded to all platforms. Skipping...`,
      );
      continue;
    }

    video.title = he.decode(video.title);

    try {
      for await (const quickbits of extractQuickBitsChapter(video)) {
        if (process.env.DRY_RUN) {
          await new Promise((resolve) => setTimeout(resolve, 10000));
          console.log('DRY RUN: Would have uploaded', quickbits);
        } else {
          i++;
          await uploadToPlatforms(quickbits);
        }
      }
    } catch (error) {
      console.log(
        `Error extracting Quick Bits from video ${video.title}`,
        error,
      );
    }

    if (!process.env.DRY_RUN && i % 4 === 0) {
      break;
    }
  }
}

main();
