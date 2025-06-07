import sqlite3 from 'sqlite3';
import * as sqlite from 'sqlite';
import { Platform, ALL_PLATFORMS } from './types'; // Assuming ALL_PLATFORMS is exported from types

let db: sqlite.Database | undefined;

// Initialize and open a connection to the SQLite database
export async function initDb(): Promise<sqlite.Database> {
  if (db) {
    return db;
  }

  db = await sqlite.open({
    filename: './videos.db', // File-based database
    driver: sqlite3.Database,
  });

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
      error TEXT NOT NULL, -- Reverted: only error message
      PRIMARY KEY (video_id, platform) -- Reverted: composite PK, implies INSERT OR REPLACE behavior
    );
  `);

  return db;
}

// Note: All functions below will now implicitly use the global 'db' instance from initDb(),
// which is a pattern change. The tests will need to adapt to not pass 'db' anymore.
// However, the original prompt for this subtask asks to revert src/db.ts and then update src/db.test.ts.
// The functions in the previous version (which I'm reverting from) *did* take 'db' as a param.
// The original code I have from a much earlier state shows functions like:
// export async function isUploadedToAllPlatforms(videoId: string) { const currentDb = await initDb(); ... }
// This is a key detail. I will assume the functions should call initDb() internally to get the db instance.

export async function isUploadedToAllPlatforms(videoId: string): Promise<boolean> {
  const currentDb = await initDb(); // Get the global db instance
  const row = await currentDb.get<{ count: number }>(
    'SELECT COUNT(DISTINCT platform) AS count FROM video_uploads WHERE video_id = ?',
    videoId,
  );
  // Check if the count of distinct uploaded platforms matches the total number of platforms
  return row?.count === ALL_PLATFORMS.length;
}

export async function isUploadedToPlatform(videoId: string, platform: Platform): Promise<boolean> {
  const currentDb = await initDb(); // Get the global db instance
  const row = await currentDb.get(
    'SELECT platform_id FROM video_uploads WHERE video_id = ? AND platform = ?',
    videoId,
    platform,
  );
  return !!row;
}

export async function saveUpload(videoId: string, platform: Platform, platformId: string): Promise<void> {
  const currentDb = await initDb(); // Get the global db instance
  await currentDb.run(
    'INSERT OR REPLACE INTO video_uploads (video_id, platform, platform_id) VALUES (?, ?, ?)',
    videoId,
    platform,
    platformId,
  );
}

export async function logUploadError(videoId: string, platform: Platform, error: unknown): Promise<void> {
  const currentDb = await initDb(); // Get the global db instance
  await currentDb.run(
    'INSERT OR REPLACE INTO upload_errors (video_id, platform, error) VALUES (?, ?, ?)',
    videoId,
    platform,
    error instanceof Error ? error.message : String(error),
  );
}

// Optional: A function to close the global DB, might be useful for cleanup in tests.
export async function closeDb(): Promise<void> {
  if (db) {
    await db.close();
    db = undefined;
  }
}
