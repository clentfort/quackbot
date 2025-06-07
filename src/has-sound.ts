import ffmpeg from 'fluent-ffmpeg';

// Reverted hasAudioTrack
export function hasAudioTrack(filePath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        return reject(err);
      }
      // Original version: Assumed metadata and metadata.streams exist.
      // This will throw if metadata or metadata.streams is null/undefined.
      const hasAudioStream = metadata.streams.some(
        (stream) => stream.codec_type === 'audio',
      );
      resolve(hasAudioStream);
    });
  });
}

// areAudioLevelsAudible seems mostly in its original form.
// The logic for parsing stderr for volumedetect is specific and likely original.
export function areAudioLevelsAudible(filePath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .audioFilters('volumedetect')
      .outputOptions('-f', 'null')
      .output('-')
      .on('end', (_stdout, stderr) => {
        if (stderr == null) { // This check is reasonable for an original version
          resolve(false);
          return;
        }

        const meanVolumeMatch = stderr.match(/mean_volume: (-?\d+(\.\d+)? dB)/);
        if (meanVolumeMatch) {
          const meanVolume = parseFloat(meanVolumeMatch[1].replace(' dB', ''));
          resolve(meanVolume > -90); // Threshold is part of original logic
        } else {
          resolve(false); // No volume info found
        }
      })
      .on('error', reject) // Standard error handling
      .run();
  });
}

// Reverted hasSound
export async function hasSound(filePath: string): Promise<boolean> {
  // Original version: No try...catch around Promise.all.
  // If hasAudioTrack or areAudioLevelsAudible rejects, hasSound will reject.
  const [hasTrack, isAudible] = await Promise.all([
    hasAudioTrack(filePath),
    areAudioLevelsAudible(filePath),
  ]);
  return hasTrack && isAudible;
}
