# Quackbot

Quackbot downloads the latest video uploaded to TechLinked YouTube channel,
extracts the quickbits intro and uploads it to YouTube and X.

## Running the bot

The bot can be run in a docker container. It's important to provide the
following environment variables:

| Name                         | Description                                                 |
| ---------------------------- | ----------------------------------------------------------- |
| `CHANNEL_ID`                 | The ID of the YouTube channel to download the video from    |
| `GOOGLE_OAUTH_CLIENT_ID`     | The Google OAuth client ID to authenticate with YouTube API |
| `GOOGLE_OAUTH_CLIENT_SECRET` | The Google OAuth client secret to authenticate with YouTube |
| `YOTUBE_API_KEY`             | The API key to authenticate with YouTube API                |
| `YOUTUBE_TOKENS`             | The tokens to authenticate with YouTube API                 |
| `X_API_KEY`                  | The X API Key                                               |
| `X_API_SECRET`               | The X API Secret                                            |
| `X_ACCESS_TOKEN`             | The X OAuth Access Token                                    |
| `X_ACCESS_TOKEN_SECRET`      | The X OAuth token secret                                    |

With these variables set, the bot can be run with the following command:

```bash
docker run --env-file .env quackbot:latest
```

## Setting up the environment

The Google OAuth client ID and secret can be obtained by creating a project in the
Google Cloud Console. The YouTube API can also be obtained from the Google Cloud
Console.

The value for variable `YOUTUBE_TOKENS` can be obtained by running the following

```bash
npm run get-youtube-tokens
```

The X API Key and Secret can be obtained by creating a project in the X
Developer Portal. The X OAuth Access Token can also be obtained from the X
Developer Portal.
