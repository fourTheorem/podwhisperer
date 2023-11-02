import { test, expect } from 'vitest'
import { handleEvent, S3KeysEvent } from '../../app'

const testState: { options?: S3KeysEvent } = {}

test('constructs keys from audio input key', async (t) => {
  const result = await handleEvent({ audioInputKey: 'audio/50.m4a' })
  expect(result).toEqual({
    mp3Key: 'audio/50.mp3',
    whisperPrefix: 'whisper-batch-output',
    whisperOutputKey: 'whisper-batch-output/50.json',
    transcribeOutputKey: 'transcribe-output/50',
    processedTranscriptKey: 'processed-transcripts/50.json',
  })
})
