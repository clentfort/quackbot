import 'dotenv/config';

import fs from 'node:fs';
import { env } from 'node:process';

import { google } from 'googleapis';
import { Clip } from './types';

// Constants
const GOOGLE_OAUTH_CLIENT_ID = env.GOOGLE_OAUTH_CLIENT_ID!;
const GOOGLE_OAUTH_CLIENT_SECRET = env.GOOGLE_OAUTH_CLIENT_SECRET!;
const REDIRECT_URI = 'http://localhost:8080';
const YOUTUBE_TOKENS = env.YOUTUBE_TOKENS!;

// Initialize Google OAuth2 Client
const auth = new google.auth.OAuth2(
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  REDIRECT_URI,
);

auth.setCredentials(JSON.parse(atob(YOUTUBE_TOKENS)));

// YouTube API Client
const youtube = google.youtube({ version: 'v3', auth });

const part = ['snippet', 'status'];
const tags = ['quick bits', 'shorts'];
const categoryId = '28';
const privacyStatus = 'public';

const titlePrefix = 'Quick Bits - ';
const maxTitleLength = 100;

// Upload the extracted chapter to YouTube
export async function uploadToYoutube({
  path,
  title: originalTitle,
  id,
}: Clip) {
  const title = `${titlePrefix}${originalTitle.substring(0, maxTitleLength - titlePrefix.length)}`;
  const description = `Watch the full video by @TechLinked at https://youtu.be/${id}\n\n#QuickBits #TechLinked #LTT #LinusTechTips`;
  const response = await youtube.videos.insert({
    part,
    requestBody: {
      snippet: {
        title,
        description,
        tags,
        categoryId,
      },
      status: { privacyStatus },
    },
    media: { body: fs.createReadStream(path) },
  });

  return response.data.id!;
}
