import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { resolve } from 'node:path'

import { mockClient } from 'aws-sdk-client-mock'
import { sdkStreamMixin } from '@aws-sdk/util-stream-node'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import tap from 'tap'

import { VocabularySubstitutions } from '../../vocabulary'
import { MergedTranscript } from '../../types'

process.env.BUCKET_NAME = 'test-bucket'
import { handleEvent } from '../../app'

const mockS3 = mockClient(S3Client)
const whisperOutputKey = 'whisper-batch-output/20221027104404/1.json.out'
const transcribeOutputKey = 'transcribe-output/1'
const processedTranscriptKey = 'processed-transcripts/1.json'

const substitutions: VocabularySubstitutions = [
  {
    type: 'literal',
    search: 'AWS Bytes',
    replacement: 'AWS Bites'
  }
]

for (const vocabularySubstitutions of [undefined, substitutions]) {
  tap.test(`transcript processor generates a merged transcript ${vocabularySubstitutions ? 'with': 'without'} substitutions`, async (t) => {
    const transcribeOutputStream = createReadStream(resolve(__dirname, './resources/1.transcribe'))
    const whisperOutputStream = createReadStream(resolve(__dirname, './resources/1.whisper.out.json'))

    mockS3.on(GetObjectCommand).callsFake((input) => {
      if (input.Key === whisperOutputKey) {
        return { Body: sdkStreamMixin(whisperOutputStream) }
      } else if (input.Key === transcribeOutputKey) {
        return { Body: sdkStreamMixin(transcribeOutputStream) }
      } else if (input.Key === 'vocabulary-substitutions.json') {
        if (vocabularySubstitutions) {
          return { Body: sdkStreamMixin(Readable.from(Buffer.from(JSON.stringify(vocabularySubstitutions)))) }
        } else {
          throw new Error('KeyError: not found')
        }
      }else {
        throw new Error(`Unexpected key ${input.Key}`)
      }
    })

    mockS3.on(PutObjectCommand).callsFake((input) => {
      t.equal(input.Bucket, process.env.BUCKET_NAME)
      t.equal(input.Key, processedTranscriptKey)
      const transcript = JSON.parse(input.Body) as any as MergedTranscript
      t.equal(transcript.segments.length, 295) 
      let prevEnd = 0
      for (const segment of transcript.segments) {
        const distance = Number(segment.start.toFixed(2)) - Number(prevEnd.toFixed(2))
        t.ok(distance >= 0, `${JSON.stringify(segment)} >= ${prevEnd} (${distance})`)
        t.ok(segment.end > segment.start, JSON.stringify(segment))
        t.ok(segment.text.length > 0, JSON.stringify(segment))
        t.ok(segment.speakerLabel.startsWith('spk_'), JSON.stringify(segment))
        prevEnd = segment.end
      }
    })
    await handleEvent({ whisperOutputKey, transcribeOutputKey, processedTranscriptKey }) 
  })
}