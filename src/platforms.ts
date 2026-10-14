import 'dotenv/config';

import { env } from 'node:process';
import { Platform, TWITTER, YOUTUBE } from './types';

/** Disabled platforms keep their upload history but do not schedule retries. */
export const ENABLED_PLATFORMS: Platform[] =
  env.X_ENABLED?.trim().toLowerCase() === 'false'
    ? [YOUTUBE]
    : [YOUTUBE, TWITTER];
