import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as sqlite from 'sqlite';
import sqlite3 from 'sqlite3';
import {
  initDb,
  isUploadedToAllPlatforms,
  isUploadedToPlatform,
  saveUpload,
  logUploadError,
} from './db'; // Assuming db.ts is in the same directory (src)
import { ALL_PLATFORMS as 실제_ALL_PLATFORMS } from './types'; // Import for type if needed, but mock below

// Mock ALL_PLATFORMS from ./types
// This has to be at the very top level, before any imports that might use ALL_PLATFORMS
vi.mock('./types', async () => {
  // Removed importOriginal as it's not strictly needed if we only mock ALL_PLATFORMS
  // and don't need to spread original module properties.
  // If other parts of 'types' were needed by 'db', this would need adjustment.
  return {
    // ... (spread original if other exports from types are used by db.ts and need to be real)
    ALL_PLATFORMS: ['platformA', 'platformB'], // Mocked value
    TWITTER: 'Twitter', // Provide mock values if db.ts imports them directly
    YOUTUBE: 'YouTube', // Provide mock values if db.ts imports them directly
    // Add any other named exports from 'types' that db.ts might use at module level
  };
});

let db: sqlite.Database;

describe('Database Functions', () => {
  beforeEach(async () => {
    // Initialize an in-memory SQLite database for each test
    db = await sqlite.open({
      filename: ':memory:',
      driver: sqlite3.Database,
    });
    // Initialize the schema using our initDb function
    await initDb(db);
  });

  afterEach(async () => {
    // Close the database connection after each test
    if (db) {
      await db.close();
    }
  });

  describe('initDb', () => {
    it('should create the video_uploads table', async () => {
      const tableInfo = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='video_uploads'");
      expect(tableInfo).toBeDefined();
      expect(tableInfo.name).toBe('video_uploads');
    });

    it('should create the upload_errors table', async () => {
      const tableInfo = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='upload_errors'");
      expect(tableInfo).toBeDefined();
      expect(tableInfo.name).toBe('upload_errors');
    });

    it('initDb should be idempotent (can be called multiple times)', async () => {
      // Call initDb again on the already initialized db
      await expect(initDb(db)).resolves.not.toThrow();
      // Check tables still exist
      const uploadsTable = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='video_uploads'");
      expect(uploadsTable).toBeDefined();
      const errorsTable = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='upload_errors'");
      expect(errorsTable).toBeDefined();
    });
  });

  describe('saveUpload and isUploadedToPlatform', () => {
    const videoId = 'testVideo123';
    const platform = 'platformA';
    const otherPlatform = 'platformB';
    const anotherVideoId = 'anotherVideo456';
    const platformId = 'dummyPlatformId'; // Added for saveUpload

    it('should save an upload and mark it as uploaded for the specific platform', async () => {
      await saveUpload(db, videoId, platform, platformId);
      expect(await isUploadedToPlatform(db, videoId, platform)).toBe(true);
    });

    it('should return false for a platform where the video has not been uploaded', async () => {
      await saveUpload(db, videoId, platform, platformId);
      expect(await isUploadedToPlatform(db, videoId, otherPlatform)).toBe(false);
    });

    it('should return false for a video that has not been uploaded to any platform', async () => {
      expect(await isUploadedToPlatform(db, anotherVideoId, platform)).toBe(false);
    });

    it('saveUpload should handle INSERT OR REPLACE (calling twice should not error)', async () => {
      await saveUpload(db, videoId, platform, platformId);
      await expect(saveUpload(db, videoId, platform, platformId)).resolves.not.toThrow();
      expect(await isUploadedToPlatform(db, videoId, platform)).toBe(true);
      // Check count to ensure no duplicates beyond replacement
      const row = await db.get('SELECT COUNT(*) as count FROM video_uploads WHERE video_id = ? AND platform = ?', videoId, platform);
      expect(row.count).toBe(1);
    });
  });

  describe('isUploadedToAllPlatforms', () => {
    const videoId = 'allPlatformsVideo';
    const platformId = 'testPlatformUploadId'; // Dummy platform ID for saveUpload

    // ALL_PLATFORMS is mocked to ['platformA', 'platformB'] via vi.mock at the top

    it('should return false if a video is not uploaded to all mocked platforms', async () => {
      await saveUpload(db, videoId, 'platformA', platformId);
      expect(await isUploadedToAllPlatforms(db, videoId)).toBe(false);
    });

    it('should return true if a video is uploaded to all mocked platforms', async () => {
      await saveUpload(db, videoId, 'platformA', platformId);
      await saveUpload(db, videoId, 'platformB', platformId + '_b'); // Use a different platformId for the second upload
      expect(await isUploadedToAllPlatforms(db, videoId)).toBe(true);
    });

    it('should return false if a video is uploaded to an extra platform but not all mocked ones', async () => {
      await saveUpload(db, videoId, 'platformA', platformId);
      await saveUpload(db, videoId, 'platformC', platformId + '_c'); // platformC is not in mocked ALL_PLATFORMS
      // This will be false because platformB (from mocked ALL_PLATFORMS) is missing
      expect(await isUploadedToAllPlatforms(db, videoId)).toBe(false);
    });

    it('should return false for a video not uploaded to any platform', async () => {
      expect(await isUploadedToAllPlatforms(db, videoId)).toBe(false);
    });
  });

  describe('logUploadError', () => {
    const videoId = 'errorVideo789';
    const platform = 'platformA';

    it('should log an error string to the upload_errors table', async () => {
      const errorMessage = 'A test error occurred';
      await logUploadError(db, videoId, platform, errorMessage);

      const errorLog = await db.get(
        'SELECT * FROM upload_errors WHERE video_id = ? AND platform = ?',
        videoId,
        platform,
      );
      expect(errorLog).toBeDefined();
      expect(errorLog.video_id).toBe(videoId);
      expect(errorLog.platform).toBe(platform);
      expect(errorLog.error_message).toBe(errorMessage);
      expect(errorLog.error_message).toBe(errorMessage);
      expect(errorLog.stack_trace).toBeNull();
    });

    it('should log an Error object with stack trace to the upload_errors table', async () => {
      const errorObject = new Error('A critical test error');
      errorObject.stack = "Error: A critical test error\nat path/to/file.js:12:34"; // Ensure stack is present

      await logUploadError(db, videoId, platform, errorObject);

      // Query the last inserted error for this video/platform
      const errorLog = await db.get(
        'SELECT * FROM upload_errors WHERE video_id = ? AND platform = ? ORDER BY id DESC LIMIT 1',
        videoId,
        platform,
      );
      expect(errorLog).toBeDefined();
      expect(errorLog.video_id).toBe(videoId);
      expect(errorLog.platform).toBe(platform);
      expect(errorLog.error_message).toBe(errorObject.message);
      expect(errorLog.stack_trace).toBe(errorObject.stack);
    });

    it('should allow logging multiple errors for the same video/platform', async () => {
      const errorMessage1 = 'First error';
      const errorObject2 = new Error('Second error');
      errorObject2.stack = 'stack for second error';

      await logUploadError(db, videoId, platform, errorMessage1);
      await logUploadError(db, videoId, platform, errorObject2);

      const errors = await db.all(
        'SELECT * FROM upload_errors WHERE video_id = ? AND platform = ? ORDER BY id ASC',
        videoId,
        platform,
      );
      expect(errors).toHaveLength(2);
      expect(errors[0].error_message).toBe(errorMessage1);
      expect(errors[1].error_message).toBe(errorObject2.message);
      expect(errors[1].stack_trace).toBe(errorObject2.stack);
    });
  });
});
