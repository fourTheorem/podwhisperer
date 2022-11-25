process.env.EXAMPLE_KEY_1 = 'test'

import envs from '../envs'
import { test } from 'tap'

test('envs retrieves environment variables if available', async (t) => {
  t.equal(envs.EXAMPLE_KEY_1, 'test')  
})

test('envs throws an error if an environment variable is missing', async (t) => {
  t.throws(() => envs.EXAMPLE_KEY_2)
})