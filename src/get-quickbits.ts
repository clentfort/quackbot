import { initDb, isUploadedToAllPlatforms } from './db';
import { extractQuickBitsChapter } from './extract-quick-bits';
import { Clip } from './types';
import { getLatestVideos } from './youtube-api';

export async function* getQuickbits(): AsyncGenerator<Clip, undefined> {
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

    yield* extractQuickBitsChapter(video);
  }
}
