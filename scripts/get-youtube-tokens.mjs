#!/usr/bin/env node

import { env, stdin as input, stdout as output } from 'node:process';
import readline from 'node:readline/promises';

import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const GOOGLE_OAUTH_CLIENT_ID = env.GOOGLE_OAUTH_CLIENT_ID;
const GOOGLE_OAUTH_CLIENT_SECRET = env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:8080';

// Initialize Google OAuth2 Client
const auth = new google.auth.OAuth2(
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  REDIRECT_URI,
);

// Function to get the access token manually
const authUrl = auth.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/youtube.upload'],
});
console.log('Authorize this app by visiting this url:', authUrl);

const rl = readline.createInterface({ input, output });
console.log('');
const code = await rl.question('Enter the code from the page here: ');
rl.close();

try {
  const { tokens } = await auth.getToken(code);

  console.log('');
  console.log('Base64 encoded tokens:');
  console.log('');
  console.info(btoa(JSON.stringify(tokens)));
} catch {
  console.error('Error getting tokens, please try again');
}
