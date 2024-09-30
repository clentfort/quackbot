#!/usr/bin/env node

import axios from 'axios';
import { env } from 'process';
import 'dotenv/config';

const CHANNEL_ID = env.CHANNEL_ID;
const YOUTUBE_API_KEY = env.YOUTUBE_API_KEY;
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search';

// Function to fetch all videos on the channel
async function fetchAllChannelVideos() {
  let videos = [];
  let nextPageToken = '';

  do {
    const url = `${YOUTUBE_API_URL}?key=${YOUTUBE_API_KEY}&channelId=${CHANNEL_ID}&part=snippet&order=date&type=video&maxResults=50&pageToken=${nextPageToken}`;

    const response = await axios.get(url);
    const data = response.data;

    const fetchedVideos = data.items.map((item) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt,
    }));

    videos = [...videos, ...fetchedVideos];
    nextPageToken = data.nextPageToken || '';
  } while (nextPageToken);

  return videos;
}

// Scan the channel and list all videos
async function listAllChannelVideos() {
  const videos = await fetchAllChannelVideos();
  console.log(JSON.stringify(videos, null, 2));
}

listAllChannelVideos();
