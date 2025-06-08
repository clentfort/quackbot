import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  hasAudioTrack,
  areAudioLevelsAudible,
  hasSound,
} from '../src/has-sound';

// Variables to control mock behavior, accessible by tests
let ffprobeMockHandler: (
  filePath: string,
  callback: (err: any, metadata?: any) => void,
) => void;
let ffmpegInstanceEndCallback:
  | ((stdout: string, stderr: string) => void)
  | null = null;
let ffmpegInstanceErrorCallback: ((err: Error) => void) | null = null;

// This object holds the state and mock methods for the ffmpeg instance.
// Tests will configure this object.
const ffmpegInstanceConfig = {
  _shouldSucceed: true,
  _stderr: '',
  _stdout: '',
  _errorMessage: 'Simulated ffmpeg process error',
  audioFilters: vi.fn(function () {
    return this;
  }),
  outputOptions: vi.fn(function () {
    return this;
  }),
  output: vi.fn(function () {
    return this;
  }),
  on: vi.fn(function (event: string, callback: (...args: any[]) => void) {
    if (event === 'end') {
      ffmpegInstanceEndCallback = callback as (
        stdout: string,
        stderr: string,
      ) => void;
    } else if (event === 'error') {
      ffmpegInstanceErrorCallback = callback as (err: Error) => void;
    }
    return this;
  }),
  run: vi.fn(function () {
    if (ffmpegInstanceConfig._shouldSucceed && ffmpegInstanceEndCallback) {
      ffmpegInstanceEndCallback(
        ffmpegInstanceConfig._stdout || '',
        ffmpegInstanceConfig._stderr || '',
      );
    } else if (
      !ffmpegInstanceConfig._shouldSucceed &&
      ffmpegInstanceErrorCallback
    ) {
      ffmpegInstanceErrorCallback(
        new Error(ffmpegInstanceConfig._errorMessage || 'ffmpeg error'),
      );
    }
  }),
};

vi.mock('fluent-ffmpeg', () => {
  // The factory creates functions that delegate to the module-scoped handlers/configs
  const actualFfprobeMock = (
    filePath: string,
    callback: (err: any, metadata?: any) => void,
  ) => {
    // Ensure ffprobeMockHandler is callable before calling it
    if (typeof ffprobeMockHandler === 'function') {
      ffprobeMockHandler(filePath, callback);
    } else {
      // Default behavior or error if not set up by a test
      callback(new Error('ffprobeMockHandler not set up'));
    }
  };

  const actualFfmpegInstance = () => {
    // This returns the shared config object, making its methods like .audioFilters() callable
    return ffmpegInstanceConfig;
  };

  // This is what will be imported as 'ffmpeg'
  const mockFluentFfmpeg = vi.fn(actualFfmpegInstance);
  // Attach ffprobe to it, also as a vi.fn() wrapping the handler logic
  (mockFluentFfmpeg as any).ffprobe = vi.fn(actualFfprobeMock);

  return {
    default: mockFluentFfmpeg,
    setFfmpegPath: vi.fn(), // Mock other exports if necessary
    setFfprobePath: vi.fn(),
  };
});

// Test suite
describe('has-sound.ts', () => {
  beforeEach(() => {
    // Clear call history of the mock functions on ffmpegInstanceConfig
    ffmpegInstanceConfig.audioFilters.mockClear();
    ffmpegInstanceConfig.outputOptions.mockClear();
    ffmpegInstanceConfig.output.mockClear();
    ffmpegInstanceConfig.on.mockClear();
    ffmpegInstanceConfig.run.mockClear();

    // Also clear the top-level ffprobe and ffmpeg mocks exported by the factory
    // Need to import 'ffmpeg' to access its mocked ffprobe method
    // This is tricky because we are outside the describe block where 'ffmpeg' is imported.
    // Instead, we can rely on the fact that the factory creates new vi.fn() wrappers
    // or ensure that we get the mocked values and clear them.
    // For now, clearing the methods on ffmpegInstanceConfig is the most direct.
    // If ffmpeg.ffprobe itself (the vi.fn wrapper) needs clearing, that's more complex from here.

    // Reset ffprobeMockHandler to a default behavior for each test
    ffprobeMockHandler = (filePath, callback) => {
      callback(null, { streams: [] }); // Default: no streams
    };

    // Reset ffmpegInstanceConfig state and callbacks
    ffmpegInstanceConfig._shouldSucceed = true;
    ffmpegInstanceConfig._stderr = '';
    ffmpegInstanceConfig._stdout = '';
    ffmpegInstanceConfig._errorMessage = 'Simulated ffmpeg process error';
    ffmpegInstanceEndCallback = null;
    ffmpegInstanceErrorCallback = null;
  });

  describe('hasAudioTrack', () => {
    it('should return true if ffprobe finds an audio stream', async () => {
      ffprobeMockHandler = (filePath, callback) => {
        callback(null, { streams: [{ codec_type: 'audio' }] });
      };
      await expect(hasAudioTrack('video.mp4')).resolves.toBe(true);
    });

    it('should return false if ffprobe finds only a video stream', async () => {
      ffprobeMockHandler = (filePath, callback) => {
        callback(null, { streams: [{ codec_type: 'video' }] });
      };
      await expect(hasAudioTrack('video.mp4')).resolves.toBe(false);
    });

    it('should return false if ffprobe finds no streams', async () => {
      // Default ffprobeMockHandler behavior is already { streams: [] }
      await expect(hasAudioTrack('video.mp4')).resolves.toBe(false);
    });

    it('should return false if ffprobe metadata is null', async () => {
      ffprobeMockHandler = (filePath, callback) => {
        callback(null, null); // Simulate null metadata
      };
      await expect(hasAudioTrack('video.mp4')).resolves.toBe(false);
    });

    it('should reject if ffprobe returns an error', async () => {
      const errorMessage = 'ffprobe error';
      ffprobeMockHandler = (filePath, callback) => {
        callback(new Error(errorMessage));
      };
      await expect(hasAudioTrack('video.mp4')).rejects.toThrow(errorMessage);
    });
  });

  describe('areAudioLevelsAudible', () => {
    it('should return true for audible mean_volume', async () => {
      ffmpegInstanceConfig._stderr =
        'Some ffmpeg output\nmean_volume: -20.5 dB\nMore output';
      await expect(areAudioLevelsAudible('video.mp4')).resolves.toBe(true);
    });

    it('should return false for inaudible mean_volume (-90 dB or lower)', async () => {
      ffmpegInstanceConfig._stderr = 'mean_volume: -95.0 dB';
      await expect(areAudioLevelsAudible('video.mp4')).resolves.toBe(false);
    });

    it('should return false for mean_volume of -infinity dB (inaudible)', async () => {
      ffmpegInstanceConfig._stderr = 'mean_volume: -inf dB';
      await expect(areAudioLevelsAudible('video.mp4')).resolves.toBe(false);
    });

    it('should return false if mean_volume is not found in stderr', async () => {
      ffmpegInstanceConfig._stderr = 'No volume information here.';
      await expect(areAudioLevelsAudible('video.mp4')).resolves.toBe(false);
    });

    it('should return false if stderr is null/empty', async () => {
      ffmpegInstanceConfig._stderr = '';
      await expect(areAudioLevelsAudible('video.mp4')).resolves.toBe(false);
    });

    it('should reject if ffmpeg process errors', async () => {
      ffmpegInstanceConfig._shouldSucceed = false;
      ffmpegInstanceConfig._errorMessage = 'ffmpeg execution failed';
      await expect(areAudioLevelsAudible('video.mp4')).rejects.toThrow(
        'ffmpeg execution failed',
      );
    });
  });

  describe('hasSound', () => {
    it('should return true if audio track exists and levels are audible', async () => {
      ffprobeMockHandler = (filePath, callback) => {
        // Has audio track
        callback(null, { streams: [{ codec_type: 'audio' }] });
      };
      ffmpegInstanceConfig._stderr = 'mean_volume: -25.0 dB'; // Audible
      await expect(hasSound('video.mp4')).resolves.toBe(true);
    });

    it('should return false if no audio track exists', async () => {
      ffprobeMockHandler = (filePath, callback) => {
        // No audio track
        callback(null, { streams: [{ codec_type: 'video' }] });
      };
      ffmpegInstanceConfig._stderr = 'mean_volume: -25.0 dB'; // Audible (but won't be checked)
      await expect(hasSound('video.mp4')).resolves.toBe(false);
      // Note: ffmpegInstanceConfig.run will be called due to Promise.all, so we don't check for not.toHaveBeenCalled()
    });

    it('should return false if audio track exists but levels are inaudible', async () => {
      ffprobeMockHandler = (filePath, callback) => {
        // Has audio track
        callback(null, { streams: [{ codec_type: 'audio' }] });
      };
      ffmpegInstanceConfig._stderr = 'mean_volume: -92.0 dB'; // Inaudible
      await expect(hasSound('video.mp4')).resolves.toBe(false);
    });

    it('should reject if hasAudioTrack rejects', async () => {
      const ffprobeError = 'Error probing audio';
      ffprobeMockHandler = (filePath, callback) => {
        callback(new Error(ffprobeError));
      };
      await expect(hasSound('video.mp4')).rejects.toThrow(ffprobeError);
    });

    it('should reject if areAudioLevelsAudible rejects (and audio track exists)', async () => {
      ffprobeMockHandler = (filePath, callback) => {
        // Has audio track
        callback(null, { streams: [{ codec_type: 'audio' }] });
      };
      ffmpegInstanceConfig._shouldSucceed = false; // Cause areAudioLevelsAudible to reject
      ffmpegInstanceConfig._errorMessage = 'Volume detection failed';
      await expect(hasSound('video.mp4')).rejects.toThrow(
        'Volume detection failed',
      );
    });
  });
});
