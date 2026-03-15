import sqlite3 from 'sqlite3';
import * as sqlite from 'sqlite';
import { Platform, TWITTER, YOUTUBE } from './types';

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

  // Handle existing databases that might not have the 'attempts' column
  try {
    await db.exec('ALTER TABLE upload_errors ADD COLUMN attempts INTEGER DEFAULT 1');
  } catch (error) {
    // Column might already exist, ignore error
  }

  return db;
}

export async function shouldProcessVideo(
  db: sqlite.Database,
  videoId: string,
) {
  const uploadedCount = await db.get<{ count: number }>(
    'SELECT COUNT(1) AS count FROM video_uploads WHERE video_id = ?',
    videoId,
  );

  if (uploadedCount?.count === ALL_PLATFORMS.length) {
    return false;
  }

  const errorCount = await db.get<{ count: number }>(
    'SELECT COUNT(1) AS count FROM upload_errors WHERE video_id = ? AND attempts >= 3',
    videoId,
  );

  if (errorCount && errorCount.count > 0) {
    return false;
  }

  return true;
}

export async function isUploadedToAllPlatforms(
  db: sqlite.Database,
  videoId: string,
) {
  const row = await db.get<{ count: number }>(
    'SELECT COUNT(1) AS count FROM video_uploads WHERE video_id = ?',
    videoId,
  );

  return row?.count === ALL_PLATFORMS.length;
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
  return db.run(
    'INSERT OR REPLACE INTO video_uploads (video_id, platform, platform_id) VALUES (?, ?, ?)',
    videoId,
    platform,
    platformId,
  );
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
