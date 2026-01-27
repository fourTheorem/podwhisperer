#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core'
import pipelineConfig from '../config.js'
import { PodwhispererStack } from '../lib/podwhisperer-stack'

const app = new cdk.App()
new PodwhispererStack(app, 'PodwhispererStack', {
  // Use account/region from current CLI configuration (required for SSM parameter lookup)
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  pipelineConfig,
})
