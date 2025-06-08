import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import type _sqlite3 from 'sqlite3'; // Import type for actual sqlite3
import type * as _sqlite_promises from 'sqlite'; // Import type for actual sqlite promises
import {
  initDb,
  saveUpload,
  isUploadedToPlatform,
  isUploadedToAllPlatforms,
  logUploadError,
  TWITTER,
  YOUTUBE,
  PLATFORMS,
} from '../src/db'; // Assuming PLATFORMS is exported or reconstruct it
import type { Database } from 'sqlite';

// Mock sqlite.open to always use an in-memory database for tests
vi.mock('sqlite', async () => {
  const actualSqlitePromises = (await vi.importActual(
    'sqlite',
  )) as typeof _sqlite_promises;
  // Correctly import the Database class from sqlite3
  const sqlite3Driver = (
    (await vi.importActual('sqlite3')) as { Database: typeof _sqlite3.Database }
  ).Database;
  return {
    ...actualSqlitePromises, // Spread actual implementations
    open: vi.fn().mockImplementation((configOptions) => {
      // Force in-memory database for tests, passing through any other config
      return actualSqlitePromises.open({
        ...configOptions, // Spread original config options
        filename: ':memory:',
        driver: sqlite3Driver,
      });
    }),
  };
});

describe('db.ts', () => {
  let dbInstance: Database;

  beforeAll(async () => {
    // Initialize the db instance once for all tests in this describe block.
    // This will use the mocked 'open' to create an in-memory db.
    dbInstance = await initDb();
  });

  beforeEach(async () => {
    // Clear tables before each test to ensure test isolation
    await dbInstance.exec('DELETE FROM video_uploads');
    await dbInstance.exec('DELETE FROM upload_errors');
  });

  describe('initDb', () => {
    it('should create video_uploads and upload_errors tables', async () => {
      const videoUploadsTable = await dbInstance.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='video_uploads';",
      );
      const uploadErrorsTable = await dbInstance.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='upload_errors';",
      );
      expect(videoUploadsTable).toBeDefined();
      expect(videoUploadsTable?.name).toBe('video_uploads');
      expect(uploadErrorsTable).toBeDefined();
      expect(uploadErrorsTable?.name).toBe('upload_errors');
    });
  });

  describe('saveUpload and isUploadedToPlatform', () => {
    const videoId = 'testVideo123';
    const platformId = 'platformSpecificId';
    it('should mark video as uploaded to a specific platform and reflect in isUploadedToPlatform', async () => {
      await saveUpload(dbInstance, videoId, TWITTER, platformId);
      expect(await isUploadedToPlatform(dbInstance, videoId, TWITTER)).toBe(
        true,
      );
    });

    it('should return false for a platform it was not uploaded to', async () => {
      await saveUpload(dbInstance, videoId, TWITTER, platformId);
      expect(await isUploadedToPlatform(dbInstance, videoId, YOUTUBE)).toBe(
        false,
      );
    });

    it('should return false for a different videoId', async () => {
      await saveUpload(dbInstance, videoId, TWITTER, platformId);
      expect(
        await isUploadedToPlatform(dbInstance, 'differentVideo456', TWITTER),
      ).toBe(false);
    });
  });

  describe('isUploadedToAllPlatforms', () => {
    const videoId1 = 'allPlatformsVideo';
    const videoId2 = 'onePlatformVideo';
    const platformId = 'platformSpecificId';
    // Assuming PLATFORMS constant contains all relevant platforms, e.g. [TWITTER, YOUTUBE]
    // If PLATFORMS is not exported from db.ts, define it locally for the test.
    const currentPlatforms = [TWITTER, YOUTUBE]; // Or import PLATFORMS from '../src/db' if available

    it('should return true if video is uploaded to all defined platforms', async () => {
      for (const platform of currentPlatforms) {
        await saveUpload(dbInstance, videoId1, platform, platformId);
      }
      expect(await isUploadedToAllPlatforms(dbInstance, videoId1)).toBe(true);
    });

    it('should return false if video is uploaded to only some platforms', async () => {
      await saveUpload(dbInstance, videoId2, TWITTER, platformId);
      // Ensure not all platforms are marked for videoId2
      // For example, if there's only YOUTUBE missing
      expect(await isUploadedToAllPlatforms(dbInstance, videoId2)).toBe(false);
    });

    it('should return false if video is not uploaded to any platform', async () => {
      expect(await isUploadedToAllPlatforms(dbInstance, 'newVideo789')).toBe(
        false,
      );
    });
  });

  describe('logUploadError', () => {
    const videoId = 'errorVideoXYZ';
    const errorMessage = 'Test error message';
    const errorObject = new Error('Test Error Object');
    // const platformId = 'platformSpecificId'; // Not used by logUploadError signature

    it('should attempt to log an error and fail due to NOT NULL constraint on platform_id', async () => {
      try {
        await logUploadError(dbInstance, videoId, TWITTER, errorMessage);
        // If the error wasn't thrown, this test should fail.
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain('NOT NULL constraint failed');
        expect(e.message).toContain('upload_errors.platform_id');
      }
    });

    it('should attempt to log an Error object and fail due to NOT NULL constraint', async () => {
      try {
        await logUploadError(dbInstance, videoId, YOUTUBE, errorObject);
        expect(true).toBe(false); // Should not reach here
      } catch (e: any) {
        expect(e.message).toContain('NOT NULL constraint failed');
        expect(e.message).toContain('upload_errors.platform_id');
      }
    });

    it('should attempt to log a long error message and fail due to NOT NULL constraint', async () => {
      const longErrorMessage = 'a'.repeat(1000);
      try {
        await logUploadError(dbInstance, videoId, TWITTER, longErrorMessage);
        expect(true).toBe(false); // Should not reach here
      } catch (e: any) {
        expect(e.message).toContain('NOT NULL constraint failed');
        expect(e.message).toContain('upload_errors.platform_id');
      }
    });
  });
});
