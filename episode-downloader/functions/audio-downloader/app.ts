import { middify } from '../lib/lambda-common.js'
import { downloadAudio } from './download.js'
import { request } from 'undici'

const { BUCKET_NAME, PODCAST_RSS_URL } = process.env
if (!BUCKET_NAME || !PODCAST_RSS_URL) {
  throw new Error('BUCKET_NAME and PODCAST_RSS_URL must be set')
}

/**
 * @param {Object} event - Input event to the Lambda function
 *
 * @returns {Object} object - Object containing details of the stock buying transaction
 */
export const handleEvent = middify(async (event) => {
  const { episodeNumber } = event
  const podcastRssSourceStream = (await request(PODCAST_RSS_URL, { throwOnError: true })).body
  return await downloadAudio({
    episodeNumber,
    podcastRssSourceStream,
    bucketName: BUCKET_NAME
  })
})
