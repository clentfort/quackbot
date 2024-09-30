import 'dotenv/config';

import { initDb, isUploadedToAllPlatforms } from './db';
import { extractQuickBitsChapter } from './extract-quick-bits';
import { uploadToPlatforms } from './upload-to-platforms';
import { getLatestVideos } from './youtube-api';

async function main() {
  console.log('Checking for new videos...');

  const db = await initDb();
  const videos = await getLatestVideos();

  for (const video of videos) {
    const needsToBeProcessed = await isUploadedToAllPlatforms(
      db,
      video.videoId,
    );

    if (needsToBeProcessed) {
      console.log(
        `Video ${video.title} has already been uploaded to all platforms. Skipping...`,
      );
      continue;
    }

    try {
      for await (const clip of extractQuickBitsChapter(video)) {
        await uploadToPlatforms(clip);
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
setInterval(main, 1 * 60 * 60 * 1000);
