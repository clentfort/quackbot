import { initDb, isUploadedToPlatform, logUploadError, saveUpload } from './db';
import { Clip, Platform, TWITTER, YOUTUBE } from './types';
import { uploadToTwitter } from './upload-to-twitter';
import { uploadToYoutube } from './upload-to-youtube';

type PlatformUpload = (clip: Clip) => Promise<string>;

type PlatformConfig = [Platform, PlatformUpload];

const platforms: Array<PlatformConfig> = [
  [YOUTUBE, uploadToYoutube],
  [TWITTER, uploadToTwitter],
];

export async function uploadToPlatforms(
  clip: Clip,
): Promise<PromiseSettledResult<boolean>[]> {
  const db = await initDb();
  return Promise.allSettled(
    platforms.map(async ([uploadPlatform, upload]) => {
      const isUploaded = await isUploadedToPlatform(
        db,
        clip.id,
        uploadPlatform,
      );
      if (isUploaded) {
        return false;
      }

      let uploadId: string;
      try {
        uploadId = await upload(clip);
        console.log(
          `Video uploaded successfully to ${uploadPlatform}:`,
          uploadId,
        );
        await saveUpload(db, clip.id, uploadPlatform, uploadId);
      } catch (error) {
        console.error(`Error uploading video to ${uploadPlatform}:`, error);
        await logUploadError(db, clip.id, uploadPlatform, error);
        return false;
      }

      return true;
    }),
  );
}
