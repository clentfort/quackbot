import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises'; // For deleting the DB file
import path from 'path';    // For path.join if needed, though direct string is fine for ./videos.db
import {
  initDb,
  isUploadedToAllPlatforms,
  isUploadedToPlatform,
  saveUpload,
  logUploadError,
  closeDb, // Import the new closeDb function
} from './db';
// ALL_PLATFORMS will be used from the mocked ./types module
// import { ALL_PLATFORMS as 실제_ALL_PLATFORMS } from './types';

const DB_FILE_PATH = './videos.db';

// Mock ALL_PLATFORMS from ./types
vi.mock('./types', async () => {
  return {
    ALL_PLATFORMS: ['platformA', 'platformB'], // Mocked value
    TWITTER: 'Twitter',
    YOUTUBE: 'YouTube',
  };
});

describe('Database Functions (File-based)', () => {
  beforeEach(async () => {
    // Delete the database file before each test to ensure a clean state
    try {
      await fs.unlink(DB_FILE_PATH);
    } catch (error: any) {
      if (error.code !== 'ENOENT') { // ENOENT means file doesn't exist, which is fine
        throw error;
      }
    }
    // Initialize the schema. initDb() now creates/opens ./videos.db itself.
    await initDb();
  });

  afterEach(async () => {
    // Close the database connection and delete the file
    await closeDb();
    try {
      await fs.unlink(DB_FILE_PATH);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  });

  describe('initDb', () => {
    // initDb is implicitly tested by beforeEach.
    // We can add a test to ensure it returns a db instance,
    // and that tables are created by querying them through a helper if needed,
    // or rely on other tests failing if tables aren't there.
    // For now, let's assume other tests will cover table existence.
    it('should create database file and tables', async () => {
      // initDb is called in beforeEach. We just check if the file exists.
      // And then try a simple query that would fail if tables don't exist.
      const dbExists = await fs.stat(DB_FILE_PATH).then(() => true).catch(() => false);
      expect(dbExists).toBe(true);

      // To check tables, we need access to the db instance.
      // Since initDb now returns the global db, we can call it again to get the instance.
      const currentDb = await initDb(); // get the instance
      const tableInfo = await currentDb.get("SELECT name FROM sqlite_master WHERE type='table' AND name='video_uploads'");
      expect(tableInfo).toBeDefined();
      expect(tableInfo!.name).toBe('video_uploads');

      const errorsTableInfo = await currentDb.get("SELECT name FROM sqlite_master WHERE type='table' AND name='upload_errors'");
      expect(errorsTableInfo).toBeDefined();
      expect(errorsTableInfo!.name).toBe('upload_errors');
    });

    it('initDb should be idempotent', async () => {
      // initDb() is called in beforeEach. Calling it again should not throw.
      await expect(initDb()).resolves.toBeDefined(); // It returns the db instance
      // Further checks for idempotency (e.g. data preservation) would be more complex.
    });
  });

  describe('saveUpload and isUploadedToPlatform', () => {
    const videoId = 'testVideo123';
    const platform = 'platformA';
    const otherPlatform = 'platformB';
    const anotherVideoId = 'anotherVideo456';
    const platformId = 'dummyPlatformId';

    it('should save an upload and mark it as uploaded', async () => {
      await saveUpload(videoId, platform, platformId);
      expect(await isUploadedToPlatform(videoId, platform)).toBe(true);
    });

    it('should return false for a platform not uploaded to', async () => {
      await saveUpload(videoId, platform, platformId);
      expect(await isUploadedToPlatform(videoId, otherPlatform)).toBe(false);
    });

    it('should return false for a video not uploaded', async () => {
      expect(await isUploadedToPlatform(anotherVideoId, platform)).toBe(false);
    });

    it('saveUpload should handle INSERT OR REPLACE', async () => {
      await saveUpload(videoId, platform, platformId);
      // Use a different platformId for the replacement
      await expect(saveUpload(videoId, platform, platformId + '_new')).resolves.not.toThrow();
      expect(await isUploadedToPlatform(videoId, platform)).toBe(true);

      const currentDb = await initDb();
      const row = await currentDb.get('SELECT COUNT(*) as count, platform_id FROM video_uploads WHERE video_id = ? AND platform = ?', videoId, platform);
      expect(row.count).toBe(1);
      expect(row.platform_id).toBe(platformId + '_new');
    });
  });

  describe('isUploadedToAllPlatforms', () => {
    const videoId = 'allPlatformsVideo';
    const platformId = 'testPlatformUploadId';

    // ALL_PLATFORMS is mocked to ['platformA', 'platformB']

    it('should return false if not uploaded to all platforms', async () => {
      await saveUpload(videoId, 'platformA', platformId);
      expect(await isUploadedToAllPlatforms(videoId)).toBe(false);
    });

    it('should return true if uploaded to all platforms', async () => {
      await saveUpload(videoId, 'platformA', platformId);
      await saveUpload(videoId, 'platformB', platformId + '_b');
      expect(await isUploadedToAllPlatforms(videoId)).toBe(true);
    });

    it('should return true if count of uploaded platforms matches ALL_PLATFORMS length, even if specific platforms differ', async () => {
      // This test reflects the behavior of the reverted isUploadedToAllPlatforms, which only checks counts.
      await saveUpload(videoId, 'platformA', platformId);
      await saveUpload(videoId, 'platformC', platformId + '_c'); // platformC not in mocked ALL_PLATFORMS ['platformA', 'platformB']
      // Uploaded count is 2. ALL_PLATFORMS length is 2. So it returns true.
      expect(await isUploadedToAllPlatforms(videoId)).toBe(true);
    });

    it('should return false for a video not uploaded to any platform', async () => {
      expect(await isUploadedToAllPlatforms(videoId)).toBe(false);
    });
  });

  describe('logUploadError', () => {
    const videoId = 'errorVideo789';
    const platform = 'platformA';

    it('should log an error string', async () => {
      const errorMessage = 'A test error occurred';
      await logUploadError(videoId, platform, errorMessage);

      const currentDb = await initDb();
      const errorLog = await currentDb.get('SELECT * FROM upload_errors WHERE video_id = ? AND platform = ?', videoId, platform);
      expect(errorLog).toBeDefined();
      expect(errorLog.video_id).toBe(videoId);
      expect(errorLog.platform).toBe(platform);
      expect(errorLog.error).toBe(errorMessage); // Column is 'error'
    });

    it('should log an Error object message', async () => {
      const errorObject = new Error('A critical test error');
      // errorObject.stack is not stored in the reverted version

      await logUploadError(videoId, platform, errorObject);

      const currentDb = await initDb();
      const errorLog = await currentDb.get('SELECT * FROM upload_errors WHERE video_id = ? AND platform = ?', videoId, platform);
      expect(errorLog).toBeDefined();
      expect(errorLog.error).toBe(errorObject.message);
    });

    it('should replace existing error due to INSERT OR REPLACE', async () => {
      const errorMessage1 = 'First error';
      const errorMessage2 = 'Second error, replacing first';

      await logUploadError(videoId, platform, errorMessage1);
      await logUploadError(videoId, platform, errorMessage2); // This should replace the first error

      const currentDb = await initDb();
      const errors = await currentDb.all('SELECT * FROM upload_errors WHERE video_id = ? AND platform = ?', videoId, platform);
      expect(errors).toHaveLength(1); // Only one error record
      expect(errors[0].error).toBe(errorMessage2);
    });
  });
});
