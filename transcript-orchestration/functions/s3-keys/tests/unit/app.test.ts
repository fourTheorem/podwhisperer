import { sdkStreamMixin } from '@aws-sdk/util-stream-node'
import tap from 'tap'
import { mockedContext } from '../../../mock-utils/lambda-context'
import { handleEvent, S3KeysEvent } from '../../app'

process.env.BUCKET_NAME = 'test-bucket'

const testState: { options?: S3KeysEvent } = {}

tap.test('constructs keys from audio input key', async (t) => {
  const result = await handleEvent({ audioInputKey: 'audio/50.m4a' })
  t.same(result, {
    mp3Key: 'audio/50.mp3',
    whisperPrefix: 'whisper-batch-output',
    whisperOutputKey: 'whisper-batch-output/50.json',
    transcribeOutputKey: 'transcribe-output/50',
    processedTranscriptKey: 'processed-transcripts/50.json',
  })
})
