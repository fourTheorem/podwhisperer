#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core'
import pipelineConfig from '../config.js'
import { PodwhispererStack } from '../lib/podwhisperer-stack'

// Check for HF_TOKEN environment variable (required for Docker build secrets)
if (!process.env.HF_TOKEN) {
  throw new Error(
    `HF_TOKEN environment variable is not set. The Docker build will fail when downloading pyannote models.\n\n` +
      `To fix this, set HF_TOKEN before running cdk deploy:\n\n` +
      `  export HF_TOKEN=$(aws ssm get-parameter \\\n` +
      `    --name "/podwhisperer/hf_token" \\\n` +
      `    --with-decryption \\\n` +
      `    --query Parameter.Value --output text)\n\n` +
      `  pnpm cdk deploy\n\n` +
      `If you haven't set up your HuggingFace token yet, see the "Setting up the HuggingFace Token" section in the README for step-by-step instructions.\n\n` +
      `NOTE: If you customized the \`hfTokenSsmPath\` configuration, update the SSM parameter name in the command above accordingly.\n\n`,
  )
}

const app = new cdk.App()
new PodwhispererStack(app, 'PodwhispererStack', {
  // Use account/region from current CLI configuration (required for SSM parameter lookup)
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  pipelineConfig,
})
