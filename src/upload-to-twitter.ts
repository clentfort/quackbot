import 'dotenv/config';

import { TwitterApi } from 'twitter-api-v2';

// Twitter API credentials from .env
const twitterClient = new TwitterApi({
  appKey: process.env.X_API_KEY!,
  appSecret: process.env.X_API_SECRET!,
  accessToken: process.env.X_ACCESS_TOKEN!,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET!,
});

export async function uploadToTwitter(
  videoPath: string,
  text: string,
): Promise<void> {
  try {
    // Step 1: Initialize media upload
    const mediaId = await twitterClient.v1.uploadMedia(videoPath, {
      mimeType: 'video/mp4',
    });

    console.log(`Video uploaded with media ID: ${mediaId}`);

    // Step 2: Post the tweet with the uploaded video
    const tweet = await twitterClient.v2.tweet({
      text: text,
      media: { media_ids: [mediaId] },
    });

    console.log('Tweet posted successfully with video:', tweet.data.id);
  } catch (error) {
    console.error('Error uploading video to Twitter:', error);
  }
}
