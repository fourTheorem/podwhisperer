# 🎙👂 podwhisperer

Podcast audio transcription using [OpenAI Whisper](https://github.com/openai/whisper) and processing workflows in AWS.

🚧 **UNDER CONSTRUCTION** 🚧

This project consists of a few components, each with their own CloudFormation Stack:

1. 👂 [whisper-image](./whisper-image), for creating an ECR container image repository where we store the SageMaker container to run the Whisper model
2. 🪣 [data-resources](./data-resources) for shared data stores, namely an S3 Bucket
3. 🧠 [sagemaker-resources](./sagemaker-resources) for the SageMaker model and IAM role
4. 🎙 [episode-downloader](./episode-downloader), a separate workflow convenient for downloading previous podcast episodes from [Anchor](https://anchor.fm/)
5. ⭐️ Coming soon... orchestration of inference and merging with Polly voice ID
