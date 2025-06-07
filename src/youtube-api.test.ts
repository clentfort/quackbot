import { describe, it, expect } from 'vitest';
import { parseDuration, parseChaptersFromDescription } from './youtube-api';

describe('parseDuration', () => {
  // Valid inputs
  it('should parse valid ISO 8601 durations', () => {
    expect(parseDuration('PT1H')).toBe(3600);
    expect(parseDuration('PT1M')).toBe(60);
    expect(parseDuration('PT1S')).toBe(1);
    expect(parseDuration('PT1H1M1S')).toBe(3661);
    expect(parseDuration('PT10M30S')).toBe(630);
  });

  // Invalid inputs
  it('should handle invalid ISO 8601 durations', () => {
    expect(() => parseDuration('P1D')).toThrow();
    expect(() => parseDuration('PT')).toThrow();
    expect(() => parseDuration('invalid-string')).toThrow();
  });
});

describe('parseChaptersFromDescription', () => {
  it('should return an empty array if no chapters are found', () => {
    const description = "This is a video description without any chapters.";
    const videoDuration = 300; // 5 minutes
    expect(parseChaptersFromDescription(description, videoDuration)).toEqual([]);
  });

  it('should parse a single chapter', () => {
    const description = "0:00 Intro";
    const videoDuration = 300;
    const expectedChapters = [
      { start: 0, title: "Intro", end: 300, duration: 300 },
    ];
    expect(parseChaptersFromDescription(description, videoDuration)).toEqual(expectedChapters);
  });

  it('should parse multiple chapters', () => {
    const description = `
      0:00 Intro
      1:30 Main Content
      4:00 Outro
    `;
    const videoDuration = 300; // 5 minutes
    const expectedChapters = [
      { start: 0, title: "Intro", end: 90, duration: 90 },
      { start: 90, title: "Main Content", end: 240, duration: 150 },
      { start: 240, title: "Outro", end: 300, duration: 60 },
    ];
    expect(parseChaptersFromDescription(description, videoDuration)).toEqual(expectedChapters);
  });

  it('should parse chapters with varying title formats', () => {
    // Expects titles to be trimmed and leading symbols (like -) to be handled by the regex
    const description = `
      00:00 - Welcome!
      01:15 -- Section 1
      02:30 (Part 2) The Middle
      03:45 END
    `;
    const videoDuration = 300; // 5 minutes
    const expectedChapters = [
      { start: 0, title: "Welcome!", end: 75, duration: 75 },
      { start: 75, title: "Section 1", end: 150, duration: 75 },
      { start: 150, title: "(Part 2) The Middle", end: 225, duration: 75 },
      { start: 225, title: "END", end: 300, duration: 75 },
    ];
    expect(parseChaptersFromDescription(description, videoDuration)).toEqual(expectedChapters);
  });

  it('should return an empty array for descriptions with no timestamps', () => {
    const description = "This video covers several topics but has no timestamps in the description.";
    const videoDuration = 300;
    expect(parseChaptersFromDescription(description, videoDuration)).toEqual([]);
  });

  it('should handle chapters at the very beginning and very end of video duration', () => {
    const description = `
      0:00 Start of the video
      5:00 End of the video
    `;
    const videoDuration = 300; // 5 minutes
    const expectedChapters = [
      { start: 0, title: "Start of the video", end: 300, duration: 300 },
      // A chapter starting exactly at videoDuration might be problematic or might not be created.
      // The current implementation creates it and gives it 0 duration if it's the last one.
      { start: 300, title: "End of the video", end: 300, duration: 0 },
    ];
    expect(parseChaptersFromDescription(description, videoDuration)).toEqual(expectedChapters);
  });
});
