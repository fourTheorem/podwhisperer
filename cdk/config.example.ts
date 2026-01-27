import { defineConfig } from '@podwhisperer/config'

export default defineConfig({
  transcription: {
    skipIfOutputExists: true,
  },
  replacementRules: [
    {
      type: 'literal',
      search: 'Owen',
      replacement: 'Eoin',
    },
    {
      type: 'literal',
      search: 'Eoghan',
      replacement: 'Eoin',
    },
    {
      type: 'regex',
      search: '[A-Z]uciano',
      replacement: 'Luciano',
    },
    {
      type: 'literal',
      search: 'Mamineo',
      replacement: 'Mammino',
    },
    {
      type: 'literal',
      search: 'Momeno',
      replacement: 'Mammino',
    },
    {
      type: 'literal',
      search: 'Mannino',
      replacement: 'Mammino',
    },
    {
      type: 'literal',
      search: 'Shanaghi',
      replacement: 'Shanaghy',
    },
    {
      type: 'literal',
      search: 'Sinehi',
      replacement: 'Shanaghy',
    },
    {
      type: 'literal',
      search: 'AWS Bytes',
      replacement: 'AWS Bites',
    },
    {
      type: 'literal',
      search: 'Fortiorum',
      replacement: 'fourTheorem',
    },
    {
      type: 'literal',
      search: 'Fortherem',
      replacement: 'fourTheorem',
    },
    {
      type: 'literal',
      search: 'Fortheorem',
      replacement: 'fourTheorem',
    },
    {
      type: 'literal',
      search: 'fortheorem.com',
      replacement: 'fourtheorem.com',
    },
    {
      type: 'literal',
      search: 'Fourth Erem',
      replacement: 'fourTheorem',
    },
    {
      type: 'literal',
      search: 'Fortiorum',
      replacement: 'fourTheorem',
    },
  ],
  llmRefinement: {
    bedrockInferenceProfileId: 'eu.anthropic.claude-sonnet-4-20250514-v1:0',
    modelConfig: {
      temperature: 0.8,
    },
    additionalContext: `  This is a transcript from the AWS Bites podcast, a technical podcast about Amazon Web Services and cloud computing.

  ### Speakers
  The hosts are almost always:
  - **Eoin Shanaghy** (NOT "Owen" - this is a common transcription error)
  - **Luciano Mammino**

  They typically introduce themselves in the first minute saying "My name is X and I am joined by Y" - use this to identify which speaker is SPEAKER_00 vs
  SPEAKER_01. The one currently talking is the one saying "my name is ...".

  ### Common Substitutions
  - "Owen" → "Eoin"
  - "Sharnagy", "Shanay", "Shanagi" → "Shanaghy"
  - "Mamino", "Amino", "Mino" → "Mammino"
  - "Lucciano" → "Luciano"
  - "four gait" or "far gate" → "Fargate"
  - "cloud watch" → "CloudWatch"
  - "cloud front" → "CloudFront"
  - "cloud formation" → "CloudFormation"
  - "event bridge" → "EventBridge"
  - "dynamo db" or "dynamo" → "DynamoDB"
  - "lambda" should remain "Lambda" (AWS service)
  - "cdk" or "CDK" → "CDK" (Cloud Development Kit)
  - "iam" or "I am" (in AWS context) → "IAM"
  - "ec two" or "ec 2" → "EC2"
  - "s three" or "s 3" → "S3"
  - "ecs" → "ECS"
  - "sns" → "SNS"
  - "sqs" → "SQS"
  - "vpc" → "VPC"
  - "api gateway" → "API Gateway"
  - "step functions" → "Step Functions"
  - "app runner" → "App Runner"

  ### Context
  The podcast covers AWS services, serverless architecture, infrastructure-as-code, cost optimization, and cloud best practices. Technical terminology and
  AWS service names are frequent.

  This covers the key aspects: correct host name spellings (with common misheard variants), AWS service name formatting, and guidance on speaker
  identification from the intro.`,
  },
  captions: {
    highlightWords: true,
    includeSpeakerNames: 'when-changes',
  },
})
