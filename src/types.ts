export const TWITTER = 'twitter';
export const YOUTUBE = 'youtube';

export type Platform = typeof TWITTER | typeof YOUTUBE;

export interface Clip {
  id: string;
  path: string;
  publishedAt: string;
  title: string;
}
