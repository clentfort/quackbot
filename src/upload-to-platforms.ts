import { initDb, isUploadedToPlatform, logUploadError, saveUpload } from './db';
import { Clip, Platform, TWITTER, YOUTUBE } from './types';
import { uploadToTwitter } from './upload-to-twitter';
import { uploadToYoutube } from './upload-to-youtube';

const platforms: Array<[Platform, (clip: Clip) => Promise<string>]> = [
  [YOUTUBE, uploadToYoutube],
  [TWITTER, uploadToTwitter],
];

export async function uploadToPlatforms(
  clip: Clip,
): Promise<PromiseSettledResult<boolean>[]> {
  const db = await initDb();
  return Promise.allSettled(
    platforms.map(async ([platform, upload]) => {
      const isUploaded = await isUploadedToPlatform(db, clip.id, platform);
      if (isUploaded) {
        return false;
      }

      try {
        const uploadId = await upload(clip);
        console.log(`Video uploaded successfully to ${platform}:`, uploadId);
        await saveUpload(db, clip.id, platform, uploadId);
        return true;
      } catch (error) {
        console.error(`Error uploading video to ${platform}:`, error);
        await logUploadError(db, clip.id, platform, error);
        return false;
      }
    }),
  );
}
