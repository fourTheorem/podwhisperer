process.env.EXAMPLE_KEY_1 = 'test'

import envs from '../envs'
import { test, assert } from 'vitest'

test('envs retrieves environment variables if available', async () => {
  assert.equal(envs.EXAMPLE_KEY_1, 'test')  
})

test('envs throws an error if an environment variable is missing', async () => {
  assert.throws(() => envs.EXAMPLE_KEY_2)
})