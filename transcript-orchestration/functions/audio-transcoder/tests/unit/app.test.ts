import { createReadStream } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { mockClient } from 'aws-sdk-client-mock'
import { sdkStreamMixin } from '@aws-sdk/util-stream-node'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import tap from 'tap'
import { AudioTranscodeOptions } from '../../transcode'
import { mockedContext } from '../../../mock-utils/lambda-context'

const mockS3 = mockClient(S3Client)

process.env.BUCKET_NAME = 'test-bucket'

const testState: { options?: AudioTranscodeOptions } = {}

const { handleEvent } = tap.mock('../../app', {
  '../../transcode': {
    transcodeAudio: async (options: AudioTranscodeOptions) => {
      testState.options = options
      await writeFile(options.outputFilePath, 'mp3 contents')
    }
  }
})

tap.test('converts audio using FFmpeg', async (t) => {
  const stream = createReadStream(resolve(__dirname, '../../../../../sample-audio/sample1.m4a'))
  const sdkStream = sdkStreamMixin(stream)
  mockS3.on(GetObjectCommand).resolves({ Body: sdkStream })
  mockS3.on(PutObjectCommand).resolves({})
  await handleEvent({ audioInputKey: 'sample1.m4a', audioOutputKey: 'sample1.mp3' }, mockedContext)
  t.ok(testState.options?.inputFilePath)
  t.ok(testState.options?.outputFilePath)
})
