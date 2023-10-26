import { createReadStream } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { mockClient } from 'aws-sdk-client-mock'
import { sdkStreamMixin } from '@aws-sdk/util-stream-node'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { mockedContext } from '../../../mock-utils/lambda-context'
import { test, expect, vi } from 'vitest'

import * as app from '../../app'
import * as transcode from '../../transcode'

const mockS3 = mockClient(S3Client)
vi.mock('../../transcode', () => ({
  transcodeAudio: vi.fn(async (options) => {
    writeFile(options.outputFilePath, 'mp3 contents')
  })
}))

test('converts audio using FFmpeg', async () => {
  const stream = createReadStream(resolve(__dirname, '../../../../../sample-audio/sample1.m4a'))
  const sdkStream = sdkStreamMixin(stream)
  mockS3.on(GetObjectCommand).resolves({ Body: sdkStream })
  mockS3.on(PutObjectCommand).resolves({})
  await app.handleEvent({ audioInputKey: 'sample1.m4a', audioOutputKey: 'sample1.mp3' }, mockedContext)
  expect(transcode.transcodeAudio).toHaveBeenCalledWith(expect.objectContaining({
    inputFilePath: expect.any(String),
    outputFilePath: expect.any(String)
  }))
})
