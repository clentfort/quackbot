import sqlite3 from 'sqlite3';
import * as sqlite from 'sqlite';
import { Platform, TWITTER, YOUTUBE } from './types';

const ALL_PLATFORMS: Platform[] = [TWITTER, YOUTUBE];

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
      platform_id TEXT NOT NULL,
      error TEXT NOT NULL,
      PRIMARY KEY (video_id, platform)
    );
  `);

  return db;
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
  return db.run(
    'INSERT OR REPLACE INTO upload_errors (video_id, platform, error) VALUES (?, ?, ?)',
    videoId,
    platform,
    error instanceof Error ? error.message : String(error),
  );
}
