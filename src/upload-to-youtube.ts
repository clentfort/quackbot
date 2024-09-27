import 'dotenv/config';

import fs from 'node:fs';
import { env } from 'node:process';

import { google } from 'googleapis';
import { initDb, isUploadedToPlatform, saveUpload } from './db';
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
const description = 'Extracted Quick Bits chapte';
const tags = ['quick bits'];
const categoryId = '28';
const privacyStatus = 'public';

// Upload the extracted chapter to YouTube
export async function uploadToYoutube({ path, title, id }: Clip) {
  const db = await initDb();
  const isUploaded = await isUploadedToPlatform(db, id, 'youtube');
  if (isUploaded) {
    console.log('Video already uploaded to YouTube');
    return;
  }
  try {
    const response = await youtube.videos.insert({
      part,
      requestBody: {
        snippet: { title, description, tags, categoryId },
        status: { privacyStatus },
      },
      media: { body: fs.createReadStream(path) },
    });

    const youtubeVideoId = response.data.id;
    console.log('Video uploaded successfully to YouTube:', youtubeVideoId);

    // Save the YouTube upload in the database
    await saveUpload(db, id, 'youtube', youtubeVideoId!);
  } catch (error) {
    console.error('Error uploading video to YouTube:', error);
  }
}
