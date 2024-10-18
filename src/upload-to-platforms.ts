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
): Promise<
  PromiseSettledResult<[true, Platform, string] | [false, Platform]>[]
> {
  const db = await initDb();
  return Promise.allSettled(
    platforms.map(async ([platform, upload]) => {
      const isUploaded = await isUploadedToPlatform(db, clip.id, platform);

      if (isUploaded) {
        return [false, platform];
      }

      let uploadId: string;
      try {
        uploadId = await upload(clip);
        console.log(`Video uploaded successfully to ${platform}: ${uploadId}`);
        await saveUpload(db, clip.id, platform, uploadId);
        return [true, platform, uploadId];
      } catch (error) {
        const message = error instanceof Error ? error.message : error;
        console.error(`Error uploading video to ${platform}:`, message);
        await logUploadError(db, clip.id, platform, error);
        return [false, platform];
      }
    }),
  );
}
