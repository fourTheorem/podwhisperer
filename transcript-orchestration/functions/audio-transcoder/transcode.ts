import { promisify }  from 'node:util'
import { exec as execCb } from 'node:child_process'
import { S3Client } from '@aws-sdk/client-s3'

import { logger } from '../lib/lambda-common'

const exec = promisify(execCb)

export type AudioTranscodeOptions = {
  inputFilePath: string,
  outputFilePath: string
}

const s3Client = new S3Client({})

/**
 * Transcode an audio file
 *
 * @param options Options required to perform the transcode
 *
 * @returns Result
 */
export const transcodeAudio = async (options: AudioTranscodeOptions) : Promise<void> => {
  logger.info('Transcoding audio with FFmpeg', options)
  const { stdout, stderr }  = await exec(`/opt/bin/ffmpeg -i ${options.inputFilePath} ${options.outputFilePath}`)
  logger.info('FFmpeg complete', { stderr, stdout })
}
