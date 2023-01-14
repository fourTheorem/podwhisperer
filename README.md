# 🎙👂 podwhisperer

A completely automated podcast audio transcription workflow with super accurate results!

> **Note**: this project was presented in [AWS Bites](https://awsbites.com/) Podcast. [Check out the full episode](https://awsbites.com/63-how-to-automate-transcripts-with-amazon-transcribe-and-openai-whisper/)! 👈

This project uses:

- [OpenAI Whisper](https://github.com/openai/whisper) for super accurate transcription
- [Amazon Transcribe](https://aws.amazon.com/transcribe/) to add speaker identification
- [FFmpeg](https://ffmpeg.org/) for audio transcoding to MP3
- AWS Lambda for:
  - Merging the Whisper and Transcribe results
  - Substituting commonly 'misheard' words/proper nouns
  - Creating a GitHub Pull Request against the podcast's website repository with the generated transcript (this is an optional step)
- ...and Step Functions to orchestrate the whole process!

This project consists of a few components, each with their own CloudFormation Stack:

1. 👂 [whisper-image](./whisper-image), for creating an ECR container image repository where we store the SageMaker container to run the Whisper model
2. 🪣 [data-resources](./data-resources) for shared data stores, namely an S3 Bucket
3. 🧠 [sagemaker-resources](./sagemaker-resources) for the SageMaker model and IAM role
4. 🎙 [transcript-orchestration](./transcript-orchestration), for orchestration, custom transcript processing and creating the transcript pull request

This project uses AWS SAM with nested stacks to deploy all but the first of these components. That first component is special, since we need to create the container image respository with [Amazon ECR](https://aws.amazon.com/ecr/) where we can push our custom Whisper container image. That makes the image available to be loaded by the SageMaker resources we can then create.

## Prerequisites

- Docker
- nodeJS 16.x and npm 8.x
- esbuild

## Getting Started

You can deploy this complete application to your own AWS account. There are a few simple prerequisites.

- The [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [AWS SAM](https://aws.amazon.com/serverless/sam/), used to build and deploy most of the application
- Docker, or other tooling that can build a container image from a `Dockerfile` and push it to a repository.
- The AWS account should have the [SLIC Watch](https://github.com/fourTheorem/slic-watch) SAR Application installed. It can be installed by going to _[this page](https://serverlessrepo.aws.amazon.com/applications/eu-west-1/949339270388/slic-watch-app) in the AWS Console. SLIC Watch is used to create alarms and dashboards for our transcription application. If you want to skip this option, just remove the single line referring to the `SlicWatch-v2` macro from the relevant template, [transcript-orchestration/template.yaml](https://github.com/fourTheorem/podwhisperer/blob/cc73c5d4d52dc01f2249a032a9e2186012e24201/transcript-orchestration/template.yaml#L4).

1. Make sure to set the environment variables for the AWS region and profile

   ```bash
   export AWS_PROFILE=xxx
   export AWS_DEFAULT_REGION=eu-central-1
   export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

2. The first deployment step creates the ECR repository. We can use the AWS CLI to do this with CloudFormation:

   ```bash
   aws cloudformation deploy \
    --template ./whisper-image/template.yaml \
    --stack-name whisper-image \
    --tags file://./common-tags.json \
    --capabilities CAPABILITY_NAMED_IAM 
   ```

   We can now retrieve the repostiory URI from the CloudFormation outputs:

   ```bash
   REPOSITORY_URI=$(aws cloudformation describe-stacks --stack-name whisper-image --query "Stacks[0].Outputs[?ExportName=='whisper-model-image-repository-uri'].OutputValue" --output text)
   ```

3. Next, we can build and push the Whisper container image:

   ```bash
   cd whisper-image

   # Build the container image
   docker build -t $REPOSITORY_URI .

   # Log in to ECR with Docker (make sure to set AWS_REGION and AWS_ACCCOUNT_ID)
   aws ecr get-login-password | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

   # Push the container image to ECR
   docker push $REPOSITORY_URI

   # leave directory before executing next step
   cd ..
   ```

4. Now that our container image is present, we can deploy the rest of the application with AWS SAM.

   ```bash
   sam build --parallel
   sam deploy --guided  # It should be sufficient to accept all defaults when prompted
   ```

That's it! You can now test the entire transcription flow. The entire process is trigged when you upload an audio file to the newly-created S3 Bucket:

```bash
aws s3 cp sample-audio/sample1.mp3 s3://pod-transcription-${AWS_ACCOUNT_ID}-${AWS_REGION}/audio/sample1.mp3
```

That S3 object upload will create an EventBridge event to trigger the transcription Step Function. You can watch its progress in the Step Functions Console.

## Configuration

By default, the transcription workflow will attempt to create a Pull Request against a static website's GitHub repository. The GitHub repository is configured in the Pull Request Lambda Function's [environment variables](https://github.com/fourTheorem/podwhisperer/blob/cc73c5d4d52dc01f2249a032a9e2186012e24201/transcript-orchestration/template.yaml#L230). You can modify this, and the [pull request creation code](https://github.com/fourTheorem/podwhisperer/blob/main/transcript-orchestration/functions/pull-request/app.ts) if you want to have PRs with new transcripts created as part of the workflow.
If you want to turn this feature off altogether, you can simply change the `createPR` default value in the Step Function's inputs from `true` to `false` [here](https://github.com/fourTheorem/podwhisperer/blob/cc73c5d4d52dc01f2249a032a9e2186012e24201/transcript-orchestration/statemachine/transcription-step-function.asl.json#L12).

### Step function architecture

To have a better feeling for what the process looks like you can check out the following picture for a visualization of the Step Function definition:

[![Overview of the step function](/docs/step-function-overview.png)](/docs/step-function-overview.png)
