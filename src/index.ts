import 'dotenv/config';

import { uploadToYoutube } from './upload-to-youtube';
import { uploadToTwitter } from './upload-to-twitter';
import { getQuickbits } from './get-quickbits';

async function processNewVideos() {
  console.log('Checking for new videos...');
  for await (const clip of getQuickbits()) {
    try {
      await Promise.allSettled([uploadToYoutube(clip), uploadToTwitter(clip)]);
    } catch {
      console.log(`Error uploading video ${clip.title}`);
    }
  }
}

processNewVideos();
setInterval(processNewVideos, 1 * 60 * 60 * 1000);
