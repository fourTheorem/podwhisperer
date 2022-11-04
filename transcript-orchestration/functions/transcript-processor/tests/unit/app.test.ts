import { handleEvent } from '../../app.js'

import tap from 'tap'

tap.test('handleEvent', async (t) => {
  await handleEvent({
    episodeNumber: 1,
    whisperTranscriptKey: 'whisper-batch-output/20221027104404/1.json.out'
  }) 
})