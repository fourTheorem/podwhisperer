import { closestSpeakerChange, merge } from '../../process-transcripts'

import tap from 'tap'

tap.test('it finds the closes speaker change', async (t) => {
  const speakerChangeIndex = [
      { speakerLabel: 'spk_0', start: 0 },
      { speakerLabel: 'spk_1', start: 3 }
    ]

  t.same(closestSpeakerChange(speakerChangeIndex, 0)?.speakerLabel, 'spk_0')
  t.same(closestSpeakerChange(speakerChangeIndex, 1)?.speakerLabel, 'spk_0')
  t.same(closestSpeakerChange(speakerChangeIndex, 2)?.speakerLabel, 'spk_0')
  t.same(closestSpeakerChange(speakerChangeIndex, 3)?.speakerLabel, 'spk_1')
  t.same(closestSpeakerChange(speakerChangeIndex, 4)?.speakerLabel, 'spk_1')
  t.same(closestSpeakerChange(speakerChangeIndex, 100)?.speakerLabel, 'spk_1')
})

tap.test('it merges a simple set of files', async (t) => {
  const whisperSegments = [{
    start: 0,
    end: 2,
    text: 'Hello how are you doing today?'
  }, {
    start: 3,
    end: 5,
    text: 'I am doing great, thanks for asking.'
  }]

  const transcribeSegments = [
    {
      speakerLabel: 'spk_0',
      start: 0,
      end: 1
    },
    {
      speakerLabel: 'spk_0',
      start: 1,
      end: 2
    },
    {
      speakerLabel: 'spk_1',
      start: 3,
      end: 4
    },
    {
      speakerLabel: 'spk_1',
      start: 4,
      end: 5
    },
  ]

  const result = merge(whisperSegments, transcribeSegments)

  const expectedResult = [
    {
      speakerLabel: 'spk_0',
      start: 0,
      end: 2,
      text: 'Hello how are you doing today?'
    },
    {
      speakerLabel: 'spk_1',
      start: 3,
      end: 5,
      text: 'I am doing great, thanks for asking.'
    }
  ]

  t.same(result, expectedResult)
})