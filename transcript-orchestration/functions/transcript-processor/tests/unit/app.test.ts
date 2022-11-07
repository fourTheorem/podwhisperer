import { createReadStream } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { mockClient } from 'aws-sdk-client-mock'
import { sdkStreamMixin } from '@aws-sdk/util-stream-node'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import tap from 'tap'
import { mockedContext } from '../../../mock-utils/lambda-context'

process.env.BUCKET_NAME = 'test-bucket'
import { handleEvent } from '../../app'

const mockS3 = mockClient(S3Client)


const whisperOutputKey = 'whisper-batch-output/20221027104404/1.json.out'
const transcribeOutputKey = 'transcribe-output/1'

tap.test('transcript processor generates a merged transcript', async (t) => {
  const transcribeOutputStream = createReadStream(resolve(__dirname, './resources/1.transcribe'))
  const whisperOutputStream = createReadStream(resolve(__dirname, './resources/1.whisper.out.json'))
  const processedTranscriptKey = 'processed-transcripts/1.json'

  mockS3.on(GetObjectCommand).callsFake((input) => {
    if (input.Key === whisperOutputKey) {
      return { Body: sdkStreamMixin(whisperOutputStream) }
    } else if (input.Key === transcribeOutputKey) {
      return { Body: sdkStreamMixin(transcribeOutputStream) }
    } else {
      throw new Error(`Unexpected key ${input.Key}`)
    }
  })
  const testState = {}
  mockS3.on(PutObjectCommand).callsFake((input) => {
    t.equal(input.Bucket, process.env.BUCKET_NAME)
    t.equal(input.Key, processedTranscriptKey)
    const transcript = JSON.parse(input.Body)
    t.equal(transcript.length, 296) 
    let prevEnd = 0
    for (const segment of transcript) {
      const distance = Number(segment.start.toFixed(2)) - Number(prevEnd.toFixed(2))
      t.ok(distance >= 0, `${JSON.stringify(segment)} >= ${prevEnd} (${distance})`)
      t.ok(segment.end > segment.start, segment)
      t.ok(segment.text.length > 0, segment)
      t.ok(segment.speakerLabel.startsWith('spk_'), segment)
      prevEnd = segment.end
    }
  })
  await handleEvent({ whisperOutputKey, transcribeOutputKey, processedTranscriptKey }, mockedContext) 
})
