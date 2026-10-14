import {
  initDb,
  shouldUploadToPlatform,
  logUploadError,
  saveUpload,
} from './db';
import { Clip, Platform, TWITTER, YOUTUBE } from './types';
import { ENABLED_PLATFORMS } from './platforms';
import { uploadToYoutube } from './upload-to-youtube';
import { logger } from './logger';
import { sendHassNotification } from './hass';

type PlatformUpload = (clip: Clip) => Promise<string>;

const platforms: Array<[Platform, PlatformUpload]> = [
  [YOUTUBE, uploadToYoutube],
  [
    TWITTER,
    async (clip) => {
      const { uploadToTwitter } = await import('./upload-to-twitter.js');
      return uploadToTwitter(clip);
    },
  ],
];

export interface UploadResult {
  platform: Platform;
  uploaded: boolean;
  blocked?: boolean;
}

/** Avoid repeatedly hitting an unavailable platform during the same run. */
function isPlatformBlocked(error: unknown, message: string): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? Number(error.code)
      : undefined;
  return [401, 402, 429].includes(code ?? 0) || /quota|auth/i.test(message);
}

/** Upload only to eligible platforms, reporting success independently. */
export async function uploadToPlatforms(
  clip: Clip,
  requestedPlatforms: Platform[] = ENABLED_PLATFORMS,
): Promise<UploadResult[]> {
  const db = await initDb();
  return Promise.all(
    platforms
      .filter(
        ([platform]) =>
          ENABLED_PLATFORMS.includes(platform) &&
          requestedPlatforms.includes(platform),
      )
      .map(async ([platform, upload]): Promise<UploadResult> => {
        try {
          if (!(await shouldUploadToPlatform(db, clip.id, platform))) {
            return { platform, uploaded: false };
          }
          const uploadId = await upload(clip);
          await saveUpload(db, clip.id, platform, uploadId);
          logger.log(`Video uploaded successfully to ${platform}: ${uploadId}`);
          return { platform, uploaded: true };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const blocked = isPlatformBlocked(error, message);
          logger.error(`Error uploading video to ${platform}:`, message);
          try {
            await logUploadError(db, clip.id, platform, error);
          } catch (recordError) {
            logger.error(
              `Error recording upload failure for ${platform}:`,
              recordError,
            );
          }
          if (blocked) {
            try {
              await sendHassNotification(
                `Critical upload error on ${platform}: ${message}`,
              );
            } catch (notificationError) {
              logger.error(
                `Error notifying about upload failure for ${platform}:`,
                notificationError,
              );
            }
          }
          return { platform, uploaded: false, blocked };
        }
      }),
  );
}
