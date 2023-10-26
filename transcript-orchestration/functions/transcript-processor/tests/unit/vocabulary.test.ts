import { substituteVocabulary, VocabularySubstitutions } from '../../vocabulary'

import { test, assert } from 'vitest'
import { MergedTranscript } from '../../types'

test('it substitutes with literal and regex searches', async () => {
  const transcript: MergedTranscript = {
    speakers: {
      'spk_0': 'a',
      'spk_1': 'a'
    },
    segments: [
      {
        start: 0,
        end: 1,
        speakerLabel: 'spk_0',
        text: 'Hello my name is Owen and this is AWS Bytes.'
      },
      {
        start: 1,
        end: 2,
        speakerLabel: 'spk_1',
        text: ' Hi, my name is Buciano and we are going to talk about Lamb, duh!'
      }
    ]
  }
  const vocab: VocabularySubstitutions = [
    {
      type: 'literal',
      search: 'Owen',
      replacement: 'Eoin'
    },
    {
      type: 'regex',
      search: '[A-Z]uciano',
      replacement: 'Luciano'
    },
    {
      type: 'regex',
      search: 'Lamb\\\W*duh',
      replacement: 'Lambda'
    },
    {
      type: 'literal',
      search: 'AWS Bytes',
      replacement: 'AWS Bites'
    }
  ]
  substituteVocabulary(transcript, vocab)
  assert.equal(transcript.segments[0].text, 'Hello my name is Eoin and this is AWS Bites.')
  assert.equal(transcript.segments[1].text, ' Hi, my name is Luciano and we are going to talk about Lambda!')
})