import { resolve } from 'node:path'
import { createReadStream } from 'node:fs'
import tap from 'tap'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { MockAgent } from 'undici'
import { mockClient } from 'aws-sdk-client-mock'

import { downloadAudio } from '../../download.js'

const TEST_RSS_PATH = resolve(__dirname, 'resources', 'rss.xml')
const TEST_BUCKET = 'my-test-bucket'

const agent = new MockAgent()
agent.disableNetConnect()

const client = agent.get('https://anchor.fm')
client.intercept({ path: /\.mp3$/, method: 'GET' }).reply(200, 'This is an MP3')
const mockS3 = mockClient(S3Client)

tap.test('download', (t) => {
  tap.test('finds and uploads a matching episode', async (t) => {
    mockS3.on(PutObjectCommand).resolves({})

    const podcastRssSourceStream = createReadStream(TEST_RSS_PATH)
    const { audioObjectKey } = await downloadAudio({
      bucketName: TEST_BUCKET,
      episodeNumber: '50',
      podcastRssSourceStream
    })

    t.equal(audioObjectKey, 'audio/episodes/50.mp3')
  })

  tap.test('errors on a missing episode', async (t) => {
    mockS3.on(PutObjectCommand).resolves({})

    const podcastRssSourceStream = createReadStream(TEST_RSS_PATH)
    await t.rejects(() => downloadAudio({
      bucketName: TEST_BUCKET,
      episodeNumber: '9999',
      podcastRssSourceStream
    }))
  })

  t.end()
})
