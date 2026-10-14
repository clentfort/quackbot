import sqlite3 from 'sqlite3';
import * as sqlite from 'sqlite';
import { Platform, TWITTER, YOUTUBE } from './types';
import { ENABLED_PLATFORMS } from './platforms';

export const ALL_PLATFORMS: Platform[] = [TWITTER, YOUTUBE];
export { TWITTER, YOUTUBE }; // Re-export for use in tests

let db: sqlite.Database | undefined;

// Initialize and open a connection to the SQLite database
export async function initDb(): Promise<sqlite.Database> {
  if (db) {
    return db;
  }

  db = await sqlite.open({
    filename: './videos.db',
    driver: sqlite3.Database,
  });

  // Create the table (if it doesn't exist) with additional columns for tracking upload status
  await db.exec(`
    CREATE TABLE IF NOT EXISTS video_uploads (
      video_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (video_id, platform)
    );

    CREATE TABLE IF NOT EXISTS upload_errors (
      video_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      platform_id TEXT,
      error TEXT NOT NULL,
      attempts INTEGER DEFAULT 1,
      PRIMARY KEY (video_id, platform)
    );
  `);

  const columns = await db.all<Array<{ name: string; notnull: number }>>(
    'PRAGMA table_info(upload_errors)',
  );
  if (!columns.some(({ name }) => name === 'attempts')) {
    await db.exec(
      'ALTER TABLE upload_errors ADD COLUMN attempts INTEGER DEFAULT 1',
    );
  }

  // Older installations required an upload ID even when the upload failed.
  if (columns.some(({ name, notnull }) => name === 'platform_id' && notnull)) {
    await db.exec('BEGIN IMMEDIATE');
    try {
      await db.exec(`
        CREATE TABLE upload_errors_migrated (
          video_id TEXT NOT NULL,
          platform TEXT NOT NULL,
          platform_id TEXT,
          error TEXT NOT NULL,
          attempts INTEGER DEFAULT 1,
          PRIMARY KEY (video_id, platform)
        );
        INSERT INTO upload_errors_migrated
          SELECT video_id, platform, platform_id, error, attempts FROM upload_errors;
        DROP TABLE upload_errors;
        ALTER TABLE upload_errors_migrated RENAME TO upload_errors;
        COMMIT;
      `);
    } catch (error) {
      await db.exec('ROLLBACK');
      db = undefined;
      throw error;
    }
  }

  return db;
}

/** Retry eligibility is independent for each platform. */
export async function shouldUploadToPlatform(
  db: sqlite.Database,
  videoId: string,
  platform: Platform,
): Promise<boolean> {
  if (await isUploadedToPlatform(db, videoId, platform)) {
    return false;
  }
  const error = await db.get<{ attempts: number }>(
    'SELECT attempts FROM upload_errors WHERE video_id = ? AND platform = ?',
    videoId,
    platform,
  );
  return (error?.attempts ?? 0) < 3;
}

export async function getPendingPlatforms(
  db: sqlite.Database,
  videoId: string,
): Promise<Platform[]> {
  const pending = await Promise.all(
    ENABLED_PLATFORMS.map(async (platform) => ({
      platform,
      eligible: await shouldUploadToPlatform(db, videoId, platform),
    })),
  );
  return pending
    .filter(({ eligible }) => eligible)
    .map(({ platform }) => platform);
}

export async function shouldProcessVideo(db: sqlite.Database, videoId: string) {
  return (await getPendingPlatforms(db, videoId)).length > 0;
}

/** Count successful uploads since local midnight, including earlier processes. */
export async function getUploadsToday(
  db: sqlite.Database,
  now = new Date(),
): Promise<Record<Platform, number>> {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const since = midnight.toISOString().slice(0, 19).replace('T', ' ');
  const rows = await db.all<Array<{ platform: Platform; count: number }>>(
    'SELECT platform, COUNT(*) AS count FROM video_uploads WHERE published_at >= ? GROUP BY platform',
    since,
  );
  const counts = { [YOUTUBE]: 0, [TWITTER]: 0 };
  for (const { platform, count } of rows) {
    if (ALL_PLATFORMS.includes(platform)) counts[platform] = count;
  }
  return counts;
}

export async function isUploadedToAllPlatforms(
  db: sqlite.Database,
  videoId: string,
) {
  const uploaded = await Promise.all(
    ENABLED_PLATFORMS.map((platform) =>
      isUploadedToPlatform(db, videoId, platform),
    ),
  );
  return uploaded.every(Boolean);
}

export async function isUploadedToPlatform(
  db: sqlite.Database,
  videoId: string,
  platform: Platform,
) {
  const row = await db.get(
    'SELECT platform_id FROM video_uploads WHERE video_id = ? AND platform = ?',
    videoId,
    platform,
  );
  return !!row;
}

// Save a new upload to the platform
export async function saveUpload(
  db: sqlite.Database,
  videoId: string,
  platform: Platform,
  platformId: string,
) {
  const result = await db.run(
    'INSERT OR REPLACE INTO video_uploads (video_id, platform, platform_id) VALUES (?, ?, ?)',
    videoId,
    platform,
    platformId,
  );
  await db.run(
    'DELETE FROM upload_errors WHERE video_id = ? AND platform = ?',
    videoId,
    platform,
  );
  return result;
}

export async function logUploadError(
  db: sqlite.Database,
  videoId: string,
  platform: Platform,
  error: unknown,
) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const existingError = await db.get(
    'SELECT attempts FROM upload_errors WHERE video_id = ? AND platform = ?',
    videoId,
    platform,
  );

  if (existingError) {
    return db.run(
      'UPDATE upload_errors SET error = ?, attempts = attempts + 1 WHERE video_id = ? AND platform = ?',
      errorMessage,
      videoId,
      platform,
    );
  }

  return db.run(
    'INSERT INTO upload_errors (video_id, platform, error, attempts) VALUES (?, ?, ?, 1)',
    videoId,
    platform,
    errorMessage,
  );
}
