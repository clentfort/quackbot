import 'dotenv/config';

import { TwitterApi } from 'twitter-api-v2';
import { Clip } from './types';

// Twitter API credentials from .env
const twitterClient = new TwitterApi({
  appKey: process.env.X_API_KEY!,
  appSecret: process.env.X_API_SECRET!,
  accessToken: process.env.X_ACCESS_TOKEN!,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET!,
});

const mimeType = 'video/mp4';

export async function uploadToTwitter({ path, title, id }: Clip) {
  // Step 1: Initialize media upload
  const mediaId = await twitterClient.v1.uploadMedia(path, { mimeType });

  console.log(`Video uploaded with media ID: ${mediaId}`);

  // Step 2: Post the tweet with the uploaded video
  const tweet = await twitterClient.v2.tweet({
    text: `${title} - Quick Bits\n\nWatch the full video by @TechLinkedYT at https://youtu.be/${id}\n\n#QuickBits #TechLinked #LTT #LinusTechTips`,
    media: { media_ids: [mediaId] },
  });

  return tweet.data.id;
}
