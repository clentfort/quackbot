import ffmpeg from 'fluent-ffmpeg';

// Function to check if video has audio
export function hasAudioTrack(filePath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        return reject(err);
      }
      const hasAudioStream =
        metadata &&
        metadata.streams &&
        metadata.streams.some((stream: any) => stream.codec_type === 'audio');
      resolve(!!hasAudioStream); // Ensure boolean if metadata or streams are null/undefined
    });
  });
}

// Function to check audio volume levels
export function areAudioLevelsAudible(filePath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .audioFilters('volumedetect')
      .outputOptions('-f', 'null')
      .output('-')
      .on('end', (_stdout, stderr) => {
        if (stderr == null) {
          resolve(false);
          return;
        }

        const meanVolumeMatch = stderr.match(/mean_volume: (-?\d+(\.\d+)? dB)/);
        if (meanVolumeMatch) {
          const meanVolume = parseFloat(meanVolumeMatch[1].replace(' dB', ''));
          // Check if mean volume is too low, e.g. below -90 dB
          resolve(meanVolume > -90);
        } else {
          resolve(false);
        }
      })
      .on('error', reject)
      .run();
  });
}

export async function hasSound(filePath: string): Promise<boolean> {
  const [hasTrack, isAudible] = await Promise.all([
    hasAudioTrack(filePath),
    areAudioLevelsAudible(filePath),
  ]);
  return hasTrack && isAudible;
}
