import { describe, it, expect, vi, beforeEach } from 'vitest';
import ffmpeg from 'fluent-ffmpeg'; // Will get the mocked version
import { hasSound } from './has-sound';

vi.mock('fluent-ffmpeg', () => {
  const mockStaticFfprobe = vi.fn();

  // Mock for the instance methods
  const mockFfmpegInstance = {
    _callbacks: {} as Record<string, Function>, // To store 'on' event handlers
    audioFilters: vi.fn().mockReturnThis(),
    outputOptions: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    on: vi.fn(function(event: string, callback: Function) {
      this._callbacks[event] = callback;
      return this; // Return 'this' for chaining
    }),
    run: vi.fn(function() {
      // This can be used to manually trigger 'end' or 'error' for testing areAudioLevelsAudible
      // For example, by calling this._callbacks['end'] or this._callbacks['error']
    }),
    // Helper to manually trigger events from tests if needed, though direct call of stored callbacks is also possible
    _triggerEvent(event: string, ...args: any[]) {
      if (this._callbacks[event]) {
        this._callbacks[event](...args);
      }
    },
    _clearCallbacks() {
      this._callbacks = {};
    }
  };

  const ffmpegConstructor = vi.fn(() => {
    // Return a fresh instance state for each call to ffmpeg()
    return { ...mockFfmpegInstance, _callbacks: {} };
  });

  ffmpegConstructor.ffprobe = mockStaticFfprobe;

  return { default: ffmpegConstructor };
});


describe('hasSound', () => {
  let mockedStaticFfprobe: ReturnType<typeof vi.fn>;
  // Variable to hold the current ffmpeg instance mock to simulate 'end' or 'error' events
  // It's populated when ffmpeg() is called within areAudioLevelsAudible
  // We get it by inspecting the mockConstructor.mock.results
  let currentFfmpegInstanceMock: any;


  beforeEach(() => {
    vi.clearAllMocks();
    mockedStaticFfprobe = ffmpeg.ffprobe as unknown as typeof mockedStaticFfprobe;

    // Intercept calls to the ffmpeg constructor to get the instance
    (ffmpeg as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const instance = (ffmpeg as ReturnType<typeof vi.fn>).getMockImplementation()!(); // Call original factory
      currentFfmpegInstanceMock = instance; // Store the most recent instance
      return instance;
    });
  });

  // --- Tests for hasAudioTrack (via hasSound) ---
  describe('hasAudioTrack logic', () => {
    it('should resolve true if ffprobe finds an audio stream (and levels are audible)', async () => {
      const filePath = 'dummy/path/to/video.mp4';
      mockedStaticFfprobe.mockImplementation((pathArg, callback) => {
        callback(null, { streams: [{ codec_type: 'audio' }] });
      });
      // Mock areAudioLevelsAudible part: simulate 'end' with valid stderr for areAudioLevelsAudible
      (ffmpeg as any).mockImplementationOnce(() => { // Ensure this specific call to ffmpeg() gets this mock
          currentFfmpegInstanceMock = {
            _callbacks: {},
            audioFilters: vi.fn().mockReturnThis(),
            outputOptions: vi.fn().mockReturnThis(),
            output: vi.fn().mockReturnThis(),
            on: vi.fn(function(event: string, callback: Function) { (this as any)._callbacks[event] = callback; return this; }),
            run: vi.fn(function() { (this as any)._callbacks['end'](null, 'stderr_with_mean_volume: -20 dB'); }),
          };
          return currentFfmpegInstanceMock;
      });

      const sound = await hasSound(filePath);
      expect(sound).toBe(true);
      expect(mockedStaticFfprobe).toHaveBeenCalledWith(filePath, expect.any(Function));
    });

    it('should resolve false if ffprobe finds no audio stream', async () => {
      const filePath = 'dummy/video_no_audio.mp4';
      mockedStaticFfprobe.mockImplementation((pathArg, callback) => {
        callback(null, { streams: [{ codec_type: 'video' }] });
      });
       // areAudioLevelsAudible will also run, ensure it doesn't cause issues or mock its outcome if necessary
      (ffmpeg as any).mockImplementationOnce(() => {
          currentFfmpegInstanceMock = { /* ... harmless mock for areAudioLevelsAudible ... */
            _callbacks: {}, audioFilters: vi.fn().mockReturnThis(), outputOptions: vi.fn().mockReturnThis(), output: vi.fn().mockReturnThis(),
            on: vi.fn(function(event: string, callback: Function) { (this as any)._callbacks[event] = callback; return this; }),
            run: vi.fn(function() { (this as any)._callbacks['end'](null, 'stderr_with_mean_volume: -20 dB'); }), // make it pass
          }; return currentFfmpegInstanceMock;
      });
      const sound = await hasSound(filePath);
      expect(sound).toBe(false); // Because hasAudioTrack will be false
    });

    it('should resolve false if ffprobe returns empty streams array', async () => {
      const filePath = 'dummy/video_empty_streams.mp4';
      mockedStaticFfprobe.mockImplementation((pathArg, callback) => {
        callback(null, { streams: [] });
      });
      (ffmpeg as any).mockImplementationOnce(() => { currentFfmpegInstanceMock = { /* ... harmless mock ... */ _callbacks: {}, audioFilters: vi.fn().mockReturnThis(), outputOptions: vi.fn().mockReturnThis(), output: vi.fn().mockReturnThis(), on: vi.fn(function(event: string, callback: Function) { (this as any)._callbacks[event] = callback; return this; }), run: vi.fn(function() { (this as any)._callbacks['end'](null, 'stderr_with_mean_volume: -20 dB'); }), }; return currentFfmpegInstanceMock; });
      const sound = await hasSound(filePath);
      expect(sound).toBe(false);
    });

    it('should resolve false if ffprobe returns no stream data (null data)', async () => {
      const filePath = 'dummy/video_null_data.mp4';
      mockedStaticFfprobe.mockImplementation((pathArg, callback) => {
        callback(null, null);
      });
      (ffmpeg as any).mockImplementationOnce(() => { currentFfmpegInstanceMock = { /* ... harmless mock ... */ _callbacks: {}, audioFilters: vi.fn().mockReturnThis(), outputOptions: vi.fn().mockReturnThis(), output: vi.fn().mockReturnThis(), on: vi.fn(function(event: string, callback: Function) { (this as any)._callbacks[event] = callback; return this; }), run: vi.fn(function() { (this as any)._callbacks['end'](null, 'stderr_with_mean_volume: -20 dB'); }), }; return currentFfmpegInstanceMock; });
      const sound = await hasSound(filePath);
      expect(sound).toBe(false);
    });

    it('should resolve false if ffprobe encounters an error', async () => {
      const filePath = 'dummy/video_ffprobe_error.mp4';
      const errorMessage = 'ffprobe error';
      mockedStaticFfprobe.mockImplementation((pathArg, callback) => {
        callback(new Error(errorMessage), null);
      });
      // areAudioLevelsAudible might not even run if hasAudioTrack rejects first and Promise.all fails fast.
      // Or if it does, its ffmpeg() call needs a mock.
      (ffmpeg as any).mockImplementationOnce(() => { currentFfmpegInstanceMock = { /* ... harmless mock ... */ _callbacks: {}, audioFilters: vi.fn().mockReturnThis(), outputOptions: vi.fn().mockReturnThis(), output: vi.fn().mockReturnThis(), on: vi.fn(function(event: string, callback: Function) { (this as any)._callbacks[event] = callback; return this; }), run: vi.fn(function() { (this as any)._callbacks['end'](null, 'stderr_with_mean_volume: -20 dB'); }), }; return currentFfmpegInstanceMock; });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const sound = await hasSound(filePath);
      expect(sound).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(`Error checking for sound in ${filePath}:`, expect.objectContaining({ message: errorMessage }));
      consoleErrorSpy.mockRestore();
    });

    it('should resolve false if streams array is missing in metadata', async () => {
      const filePath = 'dummy/video_no_streams_property.mp4';
      mockedStaticFfprobe.mockImplementation((pathArg, callback) => {
        callback(null, {});
      });
      (ffmpeg as any).mockImplementationOnce(() => { currentFfmpegInstanceMock = { /* ... harmless mock ... */ _callbacks: {}, audioFilters: vi.fn().mockReturnThis(), outputOptions: vi.fn().mockReturnThis(), output: vi.fn().mockReturnThis(), on: vi.fn(function(event: string, callback: Function) { (this as any)._callbacks[event] = callback; return this; }), run: vi.fn(function() { (this as any)._callbacks['end'](null, 'stderr_with_mean_volume: -20 dB'); }), }; return currentFfmpegInstanceMock; });
      const sound = await hasSound(filePath);
      expect(sound).toBe(false);
    });
  });

  // --- Tests for areAudioLevelsAudible (via hasSound) ---
  describe('areAudioLevelsAudible logic', () => {
    beforeEach(() => {
      // For these tests, hasAudioTrack should resolve true, so ffprobe gets a valid audio stream
      mockedStaticFfprobe.mockImplementation((pathArg, callback) => {
        callback(null, { streams: [{ codec_type: 'audio' }] });
      });
    });

    it('should resolve true if mean_volume is audible', async () => {
      const filePath = 'dummy/audible_video.mp4';
      (ffmpeg as any).mockImplementationOnce(() => {
          currentFfmpegInstanceMock = {
            _callbacks: {}, audioFilters: vi.fn().mockReturnThis(), outputOptions: vi.fn().mockReturnThis(), output: vi.fn().mockReturnThis(),
            on: vi.fn(function(event: string, callback: Function) { (this as any)._callbacks[event] = callback; return this; }),
            run: vi.fn(function() { (this as any)._callbacks['end'](null, 'mean_volume: -20.5 dB'); }), // Audible
          }; return currentFfmpegInstanceMock;
      });
      const sound = await hasSound(filePath);
      expect(sound).toBe(true);
    });

    it('should resolve false if mean_volume is too low', async () => {
      const filePath = 'dummy/silent_video.mp4';
       (ffmpeg as any).mockImplementationOnce(() => {
          currentFfmpegInstanceMock = {
             _callbacks: {}, audioFilters: vi.fn().mockReturnThis(), outputOptions: vi.fn().mockReturnThis(), output: vi.fn().mockReturnThis(),
            on: vi.fn(function(event: string, callback: Function) { (this as any)._callbacks[event] = callback; return this; }),
            run: vi.fn(function() { (this as any)._callbacks['end'](null, 'mean_volume: -95.0 dB'); }), // Too low
          }; return currentFfmpegInstanceMock;
      });
      const sound = await hasSound(filePath);
      expect(sound).toBe(false);
    });

    it('should resolve false if mean_volume is not found in stderr', async () => {
      const filePath = 'dummy/no_mean_volume_video.mp4';
      (ffmpeg as any).mockImplementationOnce(() => {
          currentFfmpegInstanceMock = {
            _callbacks: {}, audioFilters: vi.fn().mockReturnThis(), outputOptions: vi.fn().mockReturnThis(), output: vi.fn().mockReturnThis(),
            on: vi.fn(function(event: string, callback: Function) { (this as any)._callbacks[event] = callback; return this; }),
            run: vi.fn(function() { (this as any)._callbacks['end'](null, 'some other stderr output'); }),
          }; return currentFfmpegInstanceMock;
      });
      const sound = await hasSound(filePath);
      expect(sound).toBe(false);
    });

    it('should resolve false if stderr is null for volumedetect', async () => {
      const filePath = 'dummy/null_stderr.mp4';
      (ffmpeg as any).mockImplementationOnce(() => {
          currentFfmpegInstanceMock = {
            _callbacks: {}, audioFilters: vi.fn().mockReturnThis(), outputOptions: vi.fn().mockReturnThis(), output: vi.fn().mockReturnThis(),
            on: vi.fn(function(event: string, callback: Function) { (this as any)._callbacks[event] = callback; return this; }),
            run: vi.fn(function() { (this as any)._callbacks['end'](null, null); }), // Null stderr
          }; return currentFfmpegInstanceMock;
      });
      const sound = await hasSound(filePath);
      expect(sound).toBe(false);
    });

    it('should resolve false if areAudioLevelsAudible encounters an ffmpeg error', async () => {
      const filePath = 'dummy/ffmpeg_error_video.mp4';
      const errorMessage = 'ffmpeg execution error';
      (ffmpeg as any).mockImplementationOnce(() => {
          currentFfmpegInstanceMock = {
            _callbacks: {}, audioFilters: vi.fn().mockReturnThis(), outputOptions: vi.fn().mockReturnThis(), output: vi.fn().mockReturnThis(),
            on: vi.fn(function(event: string, callback: Function) { (this as any)._callbacks[event] = callback; return this; }),
            run: vi.fn(function() { (this as any)._callbacks['error'](new Error(errorMessage)); }),
          }; return currentFfmpegInstanceMock;
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const sound = await hasSound(filePath);
      expect(sound).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(`Error checking for sound in ${filePath}:`, expect.objectContaining({ message: errorMessage }));
      consoleErrorSpy.mockRestore();
    });
  });
});
