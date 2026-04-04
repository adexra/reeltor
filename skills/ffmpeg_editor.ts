import ffmpeg from 'fluent-ffmpeg';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { renderOverlayPNG } from './overlay_renderer';
import type { FFmpegConfig } from '../schema';

// Use require() so Turbopack never statically analyses @ffmpeg-installer paths
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg') as { path: string };
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export async function processVideo(config: FFmpegConfig): Promise<void> {
  const { inputPath, outputPath, startTime, duration, hook } = config;
  const id = randomUUID();

  // Step 1: Cut and scale to 1080x1920 (intermediate file)
  const scaledPath = join(tmpdir(), `${id}_scaled.mp4`);
  await cutAndScale(inputPath, scaledPath, startTime, duration);

  // Step 2: Render the overlay PNG using Node canvas
  const overlayPath = join(tmpdir(), `${id}_overlay.png`);
  await renderOverlayPNG({ hookText: hook, jobId: id, outputPath: overlayPath });

  // Step 3: Composite overlay PNG onto scaled video → final MP4
  await compositeOverlay(scaledPath, overlayPath, outputPath);

  // Cleanup intermediates
  import('fs').then(fs => {
    try { fs.unlinkSync(scaledPath); } catch {}
    try { fs.unlinkSync(overlayPath); } catch {}
  });
}

function cutAndScale(input: string, output: string, start: number, duration: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .setStartTime(start)
      .setDuration(duration)
      .videoFilters([
        'scale=1080:1920:force_original_aspect_ratio=increase',
        'crop=1080:1920',
      ])
      .outputOptions(['-an'])
      .output(output)
      .on('end', () => resolve())
      .on('error', (err, _stdout, stderr) =>
        reject(new Error(`FFmpeg cut/scale error: ${err.message}\n${stderr ?? ''}`))
      )
      .run();
  });
}

function compositeOverlay(videoPath: string, overlayPath: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .input(overlayPath)
      .complexFilter([
        '[0:v][1:v]overlay=0:0[out]',
      ])
      .map('[out]')
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        '-movflags +faststart',
        '-pix_fmt yuv420p',
      ])
      .output(output)
      .on('end', () => resolve())
      .on('error', (err, _stdout, stderr) =>
        reject(new Error(`FFmpeg composite error: ${err.message}\n${stderr ?? ''}`))
      )
      .run();
  });
}
