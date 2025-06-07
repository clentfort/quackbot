import sqlite3 from 'sqlite3';
import * as sqlite from 'sqlite';
import { Platform, TWITTER, YOUTUBE } from './types';

import { ALL_PLATFORMS } from './types'; // Use this for isUploadedToAllPlatforms

// Initialize the database schema
// The db connection should be opened and passed to this function.
export async function initDb(db: sqlite.Database): Promise<void> {
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      error_message TEXT,
      stack_trace TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function isUploadedToAllPlatforms(
  db: sqlite.Database,
  videoId: string,
) {
  const uploads = await db.all(
    'SELECT DISTINCT platform FROM video_uploads WHERE video_id = ?',
    videoId,
  );
  const uploadedPlatforms = uploads.map(u => u.platform);
  return ALL_PLATFORMS.every(p => uploadedPlatforms.includes(p));
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
    'INSERT INTO upload_errors (video_id, platform, error_message, stack_trace) VALUES (?, ?, ?, ?)',
    videoId,
    platform,
    error instanceof Error ? error.message : String(error),
    error instanceof Error ? error.stack : null,
  );
}
