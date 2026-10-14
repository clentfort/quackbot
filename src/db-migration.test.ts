import { describe, it, expect, vi } from 'vitest';
import sqlite3 from 'sqlite3';
import * as sqlite from 'sqlite';

vi.mock('sqlite', async (importOriginal) => ({
  ...(await importOriginal<typeof sqlite>()),
  open: vi.fn(),
}));

describe('legacy database migration', () => {
  it.each([false, true])(
    'repairs NOT NULL platform_id (attempts column: %s)',
    async (hasAttempts) => {
      vi.resetModules();
      const actual = await vi.importActual<typeof sqlite>('sqlite');
      const legacy = await actual.open({
        filename: ':memory:',
        driver: sqlite3.Database,
      });
      try {
        await legacy.exec(`
        CREATE TABLE upload_errors (
          video_id TEXT NOT NULL,
          platform TEXT NOT NULL,
          platform_id TEXT NOT NULL,
          error TEXT NOT NULL,
          ${hasAttempts ? 'attempts INTEGER DEFAULT 1,' : ''}
          PRIMARY KEY (video_id, platform)
        );
        INSERT INTO upload_errors (video_id, platform, platform_id, error)
        VALUES ('old', 'twitter', 'existing-id', 'old error');
      `);
        if (hasAttempts)
          await legacy.run('UPDATE upload_errors SET attempts = 2');
        vi.mocked(sqlite.open).mockResolvedValue(legacy);
        const { initDb, logUploadError } = await import('./db.js');
        const db = await initDb();
        expect(
          await db.get('SELECT * FROM upload_errors WHERE video_id = ?', 'old'),
        ).toEqual({
          video_id: 'old',
          platform: 'twitter',
          platform_id: 'existing-id',
          error: 'old error',
          attempts: hasAttempts ? 2 : 1,
        });
        await logUploadError(
          db,
          'new',
          'twitter',
          new Error('Payment required'),
        );
        expect(
          await db.get(
            'SELECT attempts, platform_id FROM upload_errors WHERE video_id = ?',
            'new',
          ),
        ).toEqual({ attempts: 1, platform_id: null });
        expect(await initDb()).toBe(db);
        // A new process can initialize the already migrated schema too.
        vi.resetModules();
        await (await import('./db.js')).initDb();
        expect(
          await db.get('SELECT COUNT(*) AS count FROM upload_errors'),
        ).toEqual({ count: 2 });
      } finally {
        await legacy.close();
      }
    },
  );
});
