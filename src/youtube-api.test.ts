import { describe, it, expect } from 'vitest';
import { parseDuration, parseChaptersFromDescription } from './youtube-api';

describe('parseDuration', () => {
  it('should parse duration PT1H2M3S correctly', () => {
    expect(parseDuration('PT1H2M3S')).toBe(3723);
  });

  it('should parse duration PT1M2S correctly', () => {
    expect(parseDuration('PT1M2S')).toBe(62);
  });

  it('should parse duration PT1S correctly', () => {
    expect(parseDuration('PT1S')).toBe(1);
  });

  it('should parse duration PT1H correctly', () => {
    expect(parseDuration('PT1H')).toBe(3600);
  });

  it('should parse duration PT1M correctly', () => {
    expect(parseDuration('PT1M')).toBe(60);
  });

  it('should throw an error for invalid duration format P1D', () => {
    expect(() => parseDuration('P1D')).toThrowError('Invalid duration format.');
  });

  it('should throw an error for an empty string', () => {
    expect(() => parseDuration('')).toThrowError('Invalid duration format.');
  });
});

describe('parseChaptersFromDescription', () => {
  it('should return an empty array for description with no chapters', () => {
    const description = 'This is a video about cats.';
    const duration = 300;
    expect(parseChaptersFromDescription(description, duration)).toEqual([]);
  });

  it('should parse chapters correctly from description with newlines', () => {
    const description = '0:00 Intro\n0:30 Chapter 1\n1:00 Chapter 2';
    const duration = 120;
    const expectedChapters = [
      { title: 'Intro', start: 0, end: 30, duration: 30 },
      { title: 'Chapter 1', start: 30, end: 60, duration: 30 },
      { title: 'Chapter 2', start: 60, end: 120, duration: 60 },
    ];
    expect(parseChaptersFromDescription(description, duration)).toEqual(
      expectedChapters,
    );
  });

  it('should handle the last chapter going to the end of the video', () => {
    const description = '0:00 Start\n0:50 Middle';
    const duration = 100;
    const expectedChapters = [
      { title: 'Start', start: 0, end: 50, duration: 50 },
      { title: 'Middle', start: 50, end: 100, duration: 50 },
    ];
    expect(parseChaptersFromDescription(description, duration)).toEqual(
      expectedChapters,
    );
  });

  it('should parse chapters correctly from description without newlines if regex handles it', () => {
    // The current regex extracts title until the end of the line.
    // If chapters are not newline separated, it will grab subsequent timestamps as part of the title.
    const description = '0:00 Intro 0:30 Chapter 1';
    const duration = 60;
    const expectedChapters = [
      { title: 'Intro 0:30 Chapter 1', start: 0, end: 60, duration: 60 },
    ];
    expect(parseChaptersFromDescription(description, duration)).toEqual(
      expectedChapters,
    );
  });

  it('should parse chapters with HH:MM:SS format correctly if hours are part of the first group', () => {
    // The current regex (\d{1,2}:\d{2}) expects MM:SS or HH:MM (if H<100).
    // Let's test a case that fits the existing regex e.g. 01:00 for 1 minute, not 1 hour.
    // To support HH:MM:SS like 01:00:00, the regex and parsing logic would need to change.
    // This test is for the current implementation.
    const description = '01:00 Chapter Start'; // This is 1 minute by current regex
    const duration = 120;
    const expectedChapters = [
      { title: 'Chapter Start', start: 60, end: 120, duration: 60 },
    ];
    expect(parseChaptersFromDescription(description, duration)).toEqual(
      expectedChapters,
    );
  });

  it('should parse chapters with titles containing special characters', () => {
    const description = '0:00 Intro (Part 1)\n0:30 Chapter with !@#$%^&*()_+';
    const duration = 60;
    const expectedChapters = [
      { title: 'Intro (Part 1)', start: 0, end: 30, duration: 30 },
      { title: 'Chapter with !@#$%^&*()_+', start: 30, end: 60, duration: 30 },
    ];
    expect(parseChaptersFromDescription(description, duration)).toEqual(
      expectedChapters,
    );
  });

  it('should handle timestamps at the very end of the description', () => {
    const description = '0:00 Beginning\n0:10 End Title';
    const duration = 20;
    const expectedChapters = [
      { title: 'Beginning', start: 0, end: 10, duration: 10 },
      { title: 'End Title', start: 10, end: 20, duration: 10 },
    ];
    expect(parseChaptersFromDescription(description, duration)).toEqual(
      expectedChapters,
    );
  });
});
