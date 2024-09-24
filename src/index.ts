import 'dotenv/config';

import { uploadToYoutube } from './upload-to-youtube';
import { uploadToTwitter } from './upload-to-twitter';
import { getQuickbits } from './get-quickbits';

// Main processing loop
async function processNewVideos() {
  try {
    for await (const video of getQuickbits()) {
      // Upload extracted chapter
      try {
        await Promise.allSettled([
          uploadToYoutube(
            video.quickBitsOutputPath,
            `${video.videoTitle} - Quick Bits`,
            'Extracted Quick Bits chapter',
          ),
          uploadToTwitter(
            video.quickBitsOutputPath,
            `${video.videoTitle} - Quick Bits`,
          ),
        ]);
      } catch {
        console.log(`Error uploading video ${video.videoTitle}`);
      }
    }
  } catch (error) {
    console.error('Error processing new videos:', error);
  }
}

processNewVideos();
