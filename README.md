# 🎙👂 podwhisperer
A completely automated podcast audio transcription workflow with super accurate results!

This project uses:
 - [OpenAI Whisper](https://github.com/openai/whisper) for super accurate transcription
 - [Amazon Transcribe](https://aws.amazon.com/transcribe/) to add speaker identification
 - [FFmpeg](https://ffmpeg.org/) for audio transcoding to MP3
 - AWS Lambda for:
   - Merging the Whisper and Transcribe results
   - Substituting commonly 'misheard' words/proper nouns
   - Creating a GitHub Pull Request against the podcast's website repository with the generated transcript
 - ...and Step Functions to orchestrate the whole process!

This project consists of a few components, each with their own CloudFormation Stack:

1. 👂 [whisper-image](./whisper-image), for creating an ECR container image repository where we store the SageMaker container to run the Whisper model
2. 🪣 [data-resources](./data-resources) for shared data stores, namely an S3 Bucket
3. 🧠 [sagemaker-resources](./sagemaker-resources) for the SageMaker model and IAM role
4. 🎙 [transcript-orchestration](./transcript-orchestration), for orchestration, custom transcript processing and creating the transcript pull request

This project uses AWS SAM with nested stacks.
