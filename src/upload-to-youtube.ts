import 'dotenv/config';

import fs from 'node:fs';
import { env } from 'node:process';

import { google } from 'googleapis';

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

setInterval(
  async () => {
    const { credentials } = await auth.refreshAccessToken();
    auth.setCredentials(credentials);
  },
  30 * 60 * 1000,
);

// YouTube API Client
const youtube = google.youtube({ version: 'v3', auth });

// Upload the extracted chapter to YouTube
export async function uploadToYoutube(
  filePath: string,
  title: string,
  description: string,
): Promise<void> {
  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title, description, tags: ['quick bits'], categoryId: '28' },
      status: { privacyStatus: 'public' },
    },
    media: { body: fs.createReadStream(filePath) },
  });

  console.log('Video uploaded successfully:', response.data.id);
}
