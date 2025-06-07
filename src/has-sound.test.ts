import { describe, it, expect, vi, beforeEach } from 'vitest';
import ffmpeg from 'fluent-ffmpeg'; // Will get the mocked version
import { hasSound } from './has-sound';

vi.mock('fluent-ffmpeg', () => {
  const mockStaticFfprobe = vi.fn();
  const mockFfmpegInstance = {
    _callbacks: {} as Record<string, Function>,
    audioFilters: vi.fn().mockReturnThis(),
    outputOptions: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    on: vi.fn(function(event: string, callback: Function) {
      this._callbacks[event] = callback;
      return this;
    }),
    run: vi.fn(function() { /* Test will trigger callbacks manually */ }),
    _triggerEvent(event: string, ...args: any[]) { // Kept for potential direct use
      if (this._callbacks[event]) {
        this._callbacks[event](...args);
      }
    },
  };

  const ffmpegConstructor = vi.fn(() => {
    // Return a fresh instance state for each call to ffmpeg()
    // Ensure _callbacks is reset for each new "instance"
    return { ...mockFfmpegInstance, _callbacks: {} };
  });

  ffmpegConstructor.ffprobe = mockStaticFfprobe;
  return { default: ffmpegConstructor };
});

describe('hasSound (Reverted Logic)', () => {
  let mockedStaticFfprobe: ReturnType<typeof vi.fn>;
  let currentFfmpegInstanceMock: any; // To control instance behavior

  beforeEach(() => {
    vi.clearAllMocks();
    mockedStaticFfprobe = ffmpeg.ffprobe as unknown as typeof mockedStaticFfprobe;

    // Setup default mock for ffmpeg() constructor to capture the instance
    // This can be overridden by mockImplementationOnce in specific tests if needed.
    (ffmpeg as ReturnType<typeof vi.fn>).mockImplementation(() => {
        const mockInstance = {
            _callbacks: {},
            audioFilters: vi.fn().mockReturnThis(),
            outputOptions: vi.fn().mockReturnThis(),
            output: vi.fn().mockReturnThis(),
            on: vi.fn(function(event: string, callback: Function) { (this as any)._callbacks[event] = callback; return this; }),
            run: vi.fn(function() {
                // Default run action: can simulate a successful volumedetect if not overridden
                // For tests not focused on areAudioLevelsAudible failure, make it pass.
                // This helps avoid TypeErrors if currentFfmpegInstanceMock is not set by a specific test.
                if ((this as any)._callbacks['end']) {
                    (this as any)._callbacks['end'](null, 'stderr_with_mean_volume: -20 dB');
                }
            }),
        };
        currentFfmpegInstanceMock = mockInstance;
        return mockInstance;
    });
  });

  describe('hasAudioTrack logic (via hasSound)', () => {
    // Helper to set up the ffmpeg instance mock for areAudioLevelsAudible to succeed
    const mockAreAudioLevelsAudibleSuccess = () => {
      (ffmpeg as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        const instance = {
          _callbacks: {},
          audioFilters: vi.fn().mockReturnThis(), outputOptions: vi.fn().mockReturnThis(), output: vi.fn().mockReturnThis(),
          on: vi.fn(function(event: string, callback: Function) { (this as any)._callbacks[event] = callback; return this; }),
          run: vi.fn(function() { (this as any)._callbacks['end'](null, 'stderr_with_mean_volume: -20 dB'); }),
        };
        currentFfmpegInstanceMock = instance;
        return instance;
      });
    };
     // Helper to set up the ffmpeg instance mock for areAudioLevelsAudible to fail (e.g. silent)
    const mockAreAudioLevelsAudibleSilent = () => {
      (ffmpeg as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        const instance = {
          _callbacks: {},
          audioFilters: vi.fn().mockReturnThis(), outputOptions: vi.fn().mockReturnThis(), output: vi.fn().mockReturnThis(),
          on: vi.fn(function(event: string, callback: Function) { (this as any)._callbacks[event] = callback; return this; }),
          run: vi.fn(function() { (this as any)._callbacks['end'](null, 'mean_volume: -95.0 dB'); }),
        };
        currentFfmpegInstanceMock = instance;
        return instance;
      });
    };


    it('should resolve true if ffprobe finds an audio stream and levels are audible', async () => {
      const filePath = 'dummy/path/to/video.mp4';
      mockedStaticFfprobe.mockImplementation((pathArg, callback) => {
        callback(null, { streams: [{ codec_type: 'audio' }] });
      });
      mockAreAudioLevelsAudibleSuccess();

      const sound = await hasSound(filePath);
      expect(sound).toBe(true);
    });

    it('should resolve false if ffprobe finds no audio stream (even if levels mock says audible)', async () => {
      const filePath = 'dummy/video_no_audio.mp4';
      mockedStaticFfprobe.mockImplementation((pathArg, callback) => {
        callback(null, { streams: [{ codec_type: 'video' }] });
      });
      mockAreAudioLevelsAudibleSuccess(); // areAudioLevelsAudible part passes

      const sound = await hasSound(filePath);
      expect(sound).toBe(false); // Overall false due to hasAudioTrack
    });

    it('should resolve false if ffprobe returns empty streams array', async () => {
      const filePath = 'dummy/video_empty_streams.mp4';
      mockedStaticFfprobe.mockImplementation((pathArg, callback) => {
        callback(null, { streams: [] });
      });
      mockAreAudioLevelsAudibleSuccess();
      const sound = await hasSound(filePath);
      expect(sound).toBe(false);
    });

    it('should reject if ffprobe returns no stream data (null metadata)', async () => {
      const filePath = 'dummy/video_null_data.mp4';
      mockedStaticFfprobe.mockImplementation((pathArg, callback) => {
        callback(null, null); // metadata is null
      });
      // areAudioLevelsAudible mock won't be reached due to Promise.all short-circuiting on rejection
      await expect(hasSound(filePath)).rejects.toThrow(TypeError); // "Cannot read properties of null (reading 'streams')"
    });

    it('should reject if ffprobe encounters an error', async () => {
      const filePath = 'dummy/video_ffprobe_error.mp4';
      const errorMessage = 'ffprobe error';
      mockedStaticFfprobe.mockImplementation((pathArg, callback) => {
        callback(new Error(errorMessage), null);
      });
      // areAudioLevelsAudible mock won't be reached
      await expect(hasSound(filePath)).rejects.toThrow(errorMessage);
    });

    it('should reject if streams array is missing in metadata', async () => {
      const filePath = 'dummy/video_no_streams_property.mp4';
      mockedStaticFfprobe.mockImplementation((pathArg, callback) => {
        callback(null, {}); // metadata is {}, metadata.streams is undefined
      });
      // areAudioLevelsAudible mock won't be reached
      await expect(hasSound(filePath)).rejects.toThrow(TypeError); // "Cannot read properties of undefined (reading 'some')"
    });
  });

  describe('areAudioLevelsAudible logic (via hasSound)', () => {
    beforeEach(() => {
      // For these tests, hasAudioTrack should resolve true
      mockedStaticFfprobe.mockImplementation((pathArg, callback) => {
        callback(null, { streams: [{ codec_type: 'audio' }] });
      });
    });

    const setupAreAudioLevelsAudibleMock = (stderr: string | null, error?: Error) => {
        (ffmpeg as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
            const instance = {
                _callbacks: {},
                audioFilters: vi.fn().mockReturnThis(), outputOptions: vi.fn().mockReturnThis(), output: vi.fn().mockReturnThis(),
                on: vi.fn(function(event: string, cb: Function) { (this as any)._callbacks[event] = cb; return this; }),
                run: vi.fn(function() {
                    if (error) {
                        if ((this as any)._callbacks['error']) (this as any)._callbacks['error'](error);
                    } else {
                        if ((this as any)._callbacks['end']) (this as any)._callbacks['end'](null, stderr);
                    }
                }),
            };
            currentFfmpegInstanceMock = instance; // Though not strictly needed for this direct setup
            return instance;
        });
    };

    it('should resolve true if mean_volume is audible', async () => {
      const filePath = 'dummy/audible_video.mp4';
      setupAreAudioLevelsAudibleMock('mean_volume: -20.5 dB');
      const sound = await hasSound(filePath);
      expect(sound).toBe(true);
    });

    it('should resolve false if mean_volume is too low', async () => {
      const filePath = 'dummy/silent_video.mp4';
      setupAreAudioLevelsAudibleMock('mean_volume: -95.0 dB');
      const sound = await hasSound(filePath);
      expect(sound).toBe(false);
    });

    it('should resolve false if mean_volume is not found in stderr', async () => {
      const filePath = 'dummy/no_mean_volume_video.mp4';
      setupAreAudioLevelsAudibleMock('some other stderr output');
      const sound = await hasSound(filePath);
      expect(sound).toBe(false);
    });

    it('should resolve false if stderr is null for volumedetect', async () => {
      const filePath = 'dummy/null_stderr.mp4';
      setupAreAudioLevelsAudibleMock(null);
      const sound = await hasSound(filePath);
      expect(sound).toBe(false);
    });

    it('should reject if areAudioLevelsAudible encounters an ffmpeg error', async () => {
      const filePath = 'dummy/ffmpeg_error_video.mp4';
      const errorMessage = 'ffmpeg execution error';
      setupAreAudioLevelsAudibleMock(null, new Error(errorMessage));

      await expect(hasSound(filePath)).rejects.toThrow(errorMessage);
    });
  });
});
