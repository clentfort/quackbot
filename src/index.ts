import 'dotenv/config';

import { uploadToYoutube } from './upload-to-youtube';
import { uploadToTwitter } from './upload-to-twitter';
import { getQuickbits } from './get-quickbits';

async function processNewVideos() {
  try {
    for await (const video of getQuickbits()) {
      try {
        await Promise.allSettled([
          uploadToYoutube(
            video.path,
            `${video.title} - Quick Bits`,
            'Extracted Quick Bits chapter',
          ),
          uploadToTwitter(video.path, `${video.title} - Quick Bits`),
        ]);
      } catch {
        console.log(`Error uploading video ${video.title}`);
      }
    }
  } catch (error) {
    console.error('Error processing new videos:', error);
  }
}

setInterval(processNewVideos, 24 * 60 * 60 * 1000);
processNewVideos();
