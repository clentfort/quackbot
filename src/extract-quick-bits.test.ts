import { describe, it, expect } from 'vitest';
import { findChapterByName } from './extract-quick-bits';

// Define a simplified Chapter interface for testing purposes
interface Chapter {
  title: string;
  start: number;
  duration: number;
  end: number;
}

describe('findChapterByName', () => {
  const chapters: Chapter[] = [
    { title: 'Intro Quick Bits', start: 0, duration: 10, end: 10 },
    { title: 'Main Content', start: 10, duration: 60, end: 70 },
    {
      title: 'Another Segment with quick bits',
      start: 70,
      duration: 20,
      end: 90,
    },
    { title: 'Outro', start: 90, duration: 5, end: 95 },
  ];

  it('should find a chapter with an exact target name', () => {
    const targetNames = ['Intro Quick Bits'];
    expect(findChapterByName(chapters, targetNames)).toBe(chapters[0]);
  });

  it('should find a chapter with a lowercase target name (case-insensitivity)', () => {
    const targetNames = ['intro quick bits'];
    expect(findChapterByName(chapters, targetNames)).toBe(chapters[0]);
  });

  it('should find a chapter with a partial target name', () => {
    const targetNames = ['quick bits'];
    // It should find the first chapter that includes "quick bits" in its title.
    expect(findChapterByName(chapters, targetNames)).toBe(chapters[0]);
  });

  it('should find a chapter with multiple target names, one of which matches', () => {
    const targetNames = ['nonexistent', 'quick bits'];
    expect(findChapterByName(chapters, targetNames)).toBe(chapters[0]);
  });

  it('should find a chapter with a target name that matches a later chapter', () => {
    const targetNames = ['another segment'];
    expect(findChapterByName(chapters, targetNames)).toBe(chapters[2]);
  });

  it('should find a chapter with a partial target name that matches a later chapter', () => {
    // This test ensures that if "quick bits" is part of a later chapter title, it's found.
    const targetNames = ['segment with quick bits'];
    expect(findChapterByName(chapters, targetNames)).toBe(chapters[2]);
  });

  it('should return undefined if the target name is not found', () => {
    const targetNames = ['missing chapter'];
    expect(findChapterByName(chapters, targetNames)).toBeUndefined();
  });

  it('should return undefined for an empty chapters list', () => {
    const emptyChapters: Chapter[] = [];
    const targetNames = ['quick bits'];
    expect(findChapterByName(emptyChapters, targetNames)).toBeUndefined();
  });

  it('should return undefined for an empty target names list', () => {
    const targetNames: string[] = [];
    expect(findChapterByName(chapters, targetNames)).toBeUndefined();
  });

  it('should be case-insensitive for the chapter title as well', () => {
    const mixedCaseChapters: Chapter[] = [
      { title: 'iNtRo qUiCk BiTs', start: 0, duration: 10, end: 10 },
    ];
    const targetNames = ['intro quick bits'];
    expect(findChapterByName(mixedCaseChapters, targetNames)).toBe(
      mixedCaseChapters[0],
    );
  });
});
