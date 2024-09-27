import 'dotenv/config';

import { TwitterApi } from 'twitter-api-v2';
import { initDb, isUploadedToPlatform, saveUpload } from './db';
import { Clip } from './types';

// Twitter API credentials from .env
const twitterClient = new TwitterApi({
  appKey: process.env.X_API_KEY!,
  appSecret: process.env.X_API_SECRET!,
  accessToken: process.env.X_ACCESS_TOKEN!,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET!,
});

export async function uploadToTwitter({ id, path, title }: Clip) {
  const db = await initDb();
  const isUploaded = await isUploadedToPlatform(db, id, 'twitter');
  if (isUploaded) {
    console.log('Video already uploaded to Twitter');
    return;
  }
  try {
    // Step 1: Initialize media upload
    const mediaId = await twitterClient.v1.uploadMedia(path, {
      mimeType: 'video/mp4',
    });

    console.log(`Video uploaded with media ID: ${mediaId}`);

    // Step 2: Post the tweet with the uploaded video
    const tweet = await twitterClient.v2.tweet({
      text: `${title} - Quick Bits`,
      media: { media_ids: [mediaId] },
    });

    const twitterTweetId = tweet.data.id;
    console.log('Tweet posted successfully with video:', twitterTweetId);

    // Save the Twitter upload in the database
    await saveUpload(db, id, 'twitter', twitterTweetId);
  } catch (error) {
    console.error('Error uploading video to Twitter:', error);
  }
}
