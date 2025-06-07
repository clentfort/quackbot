import { describe, it, expect } from 'vitest';
import { findChapterByName } from './extract-quick-bits'; // Assuming it will be exported from a file in the same directory

// Mock Chapter interface - adjust if the actual interface is different
interface Chapter {
  title: string;
  start: number;
  end: number;
  duration: number;
}

const sampleChapters: Chapter[] = [
  { title: "Introduction", start: 0, end: 60, duration: 60 },
  { title: "Main Topic 1", start: 60, end: 180, duration: 120 },
  { title: "Quick Tip: Setup", start: 180, end: 240, duration: 60 },
  { title: "Deep Dive: Advanced", start: 240, end: 360, duration: 120 },
  { title: "Conclusion", start: 360, end: 400, duration: 40 },
];

describe('findChapterByName', () => {
  it('should find a chapter by its name (case-insensitive)', () => {
    const targetNames = ["main topic 1"];
    const expectedChapter = sampleChapters[1];
    expect(findChapterByName(sampleChapters, targetNames)).toEqual(expectedChapter);
  });

  it('should find a chapter by its name when target name has different casing', () => {
    const targetNames = ["INTRODUCTION"];
    const expectedChapter = sampleChapters[0];
    expect(findChapterByName(sampleChapters, targetNames)).toEqual(expectedChapter);
  });

  it('should return undefined if the chapter is not found', () => {
    const targetNames = ["NonExistent Chapter"];
    expect(findChapterByName(sampleChapters, targetNames)).toBeUndefined();
  });

  it('should find a chapter if one of multiple target names matches', () => {
    const targetNames = ["NonExistent", "conclusion", "AnotherNonExistent"];
    const expectedChapter = sampleChapters[4];
    expect(findChapterByName(sampleChapters, targetNames)).toEqual(expectedChapter);
  });

  it('should find a chapter if the target name is a substring of a chapter title (case-insensitive)', () => {
    const targetNames = ["quick tip"];
    const expectedChapter = sampleChapters[2]; // "Quick Tip: Setup"
    expect(findChapterByName(sampleChapters, targetNames)).toEqual(expectedChapter);
  });

  it('should find a chapter if the chapter title is a substring of the target name (case-insensitive)', () => {
    const targetNames = ["The Main Topic 1 Explored"];
    const expectedChapter = sampleChapters[1]; // "Main Topic 1"
    expect(findChapterByName(sampleChapters, targetNames)).toEqual(expectedChapter);
  });

  it('should return undefined for an empty chapter list', () => {
    const targetNames = ["Introduction"];
    expect(findChapterByName([], targetNames)).toBeUndefined();
  });

  it('should return undefined if the target names list is empty', () => {
    expect(findChapterByName(sampleChapters, [])).toBeUndefined();
  });

  it('should return undefined if both chapter list and target names list are empty', () => {
    expect(findChapterByName([], [])).toBeUndefined();
  });

  it('should prioritize exact matches over substring matches if multiple target names are provided', () => {
    const chaptersWithSimilarNames: Chapter[] = [
      { title: "Tip", start: 0, end: 10, duration: 10 },
      { title: "Quick Tip", start: 10, end: 20, duration: 10 },
    ];
    const targetNames = ["tip", "quick tip"]; // "Quick Tip" is more specific
     // It should find "Quick Tip" because "quick tip" is an exact match for "Quick Tip"
    expect(findChapterByName(chaptersWithSimilarNames, targetNames)).toEqual(chaptersWithSimilarNames[1]);
  });

  it('should prioritize targets that appear earlier in the targetNames list in case of multiple substring matches to different chapters', () => {
    const targetNames = ["topic", "dive"]; // "Main Topic 1" vs "Deep Dive: Advanced"
    // "Main Topic 1" should be found because "topic" appears before "dive" in targetNames
    expect(findChapterByName(sampleChapters, targetNames)).toEqual(sampleChapters[1]);
  });

});
