import { S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { logger, metrics } from '../lib/lambda-common.js'
import FeedParser from 'feedparser'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { request } from 'undici'
import { MetricUnits } from '@aws-lambda-powertools/metrics'

export type AudioDownloadOptions = {
  episodeNumber: string,
  bucketName: string,
  podcastRssSourceStream: Readable
}

export type AudioDownloadResult = {
  audioObjectKey: string
}

const s3Client = new S3Client({})

/**
 * Find the matching RSS feed episode and put the audio file on S3
 *
 * @param options Options required to perform the download
 *
 * @returns Result
 */
export const downloadAudio = async (options: AudioDownloadOptions) : Promise<AudioDownloadResult> => {
  logger.info('Fetching and parsing RSS feed', { episodeNumber: options.episodeNumber })

  const feedParser = new FeedParser({}) as unknown as Transform

  const items: any[] = []
  await pipeline(
    options.podcastRssSourceStream,
    feedParser,
    new Transform({
      objectMode: true,
      transform: function (item, _, done) {
        if (item.title.startsWith(`${options.episodeNumber}.`)) {
          items.push(item)
        }
        done()
      }
    })
  )

  if (items.length === 0) {
    throw new Error(`No matching items found for episode ${options.episodeNumber}`)
  }

  const mp3Url = items[0].enclosures.find((enc: any) => enc.type === 'audio/mpeg').url
  logger.info('Fetching MP3', { mp3Url })
  const audioObjectKey = `audio/episodes/${options.episodeNumber}.mp3`
  const mp3Response = await request(mp3Url, { throwOnError: true })
  logger.info('Uploading to S3', { mp3Url, audioObjectKey, bucketName: options.bucketName })

  metrics.addMetric('AudioFileUploadCount', MetricUnits.Count, 1)
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: options.bucketName,
      Key: audioObjectKey,
      Body: mp3Response.body
    }
  })
  const s3UploadResponse = await upload.done()
  logger.info('S3 upload complete', { s3UploadResponse })

  return {
    audioObjectKey
  }
}
