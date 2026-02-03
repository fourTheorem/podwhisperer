import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type DurableContext,
  withDurableExecution,
} from '@aws/durable-execution-sdk-js'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { PipelineConfigSchema } from '@podwhisperer/config'
import type { EventBridgeEvent } from 'aws-lambda'
import { llmRefinement } from './steps/llm-refinement'
import { applyReplacements } from './steps/replacement'
import { normalizeSegments } from './steps/segments-normalization'
import type {
  TranscriptionJob,
  TranscriptionResult,
  WhisperxResult,
} from './types'
import { getRegionFromProfileId } from './utils/bedrock'
import { generateJson, generateSrt, generateVtt } from './utils/captions'

// S3 EventBridge event detail structure
interface S3ObjectCreatedDetail {
  bucket: { name: string }
  object: { key: string; size: number; etag: string }
}

type S3EventBridgeEvent = EventBridgeEvent<
  'Object Created',
  S3ObjectCreatedDetail
>

const s3 = new S3Client()
const QUEUE_URL = process.env.QUEUE_URL
const BUCKET_NAME = process.env.BUCKET_NAME
const WHISPER_JOB_TIMEOUT_MINUTES = Number(
  process.env.WHISPER_JOB_TIMEOUT_MINUTES ?? '60',
)

// Load pipeline config from layer (Lambda) or local file (development)
const configPath = process.env.AWS_LAMBDA_FUNCTION_NAME
  ? '/opt/nodejs/config.json'
  : join(__dirname, 'config.json')
const pipelineConfig = PipelineConfigSchema.parse(
  JSON.parse(readFileSync(configPath, 'utf-8')),
)

const handler = async (event: S3EventBridgeEvent, context: DurableContext) => {
  const key = decodeURIComponent(event.detail.object.key.replace(/\+/g, ' '))
  const pipelineStartedAt = await context.step('capture-start-time', () => {
    return Promise.resolve(new Date().toISOString())
  })

  context.logger.info('Processing S3 object', {
    bucket: event.detail.bucket.name,
    key,
  })

  // Derive expected output key from input key
  // input/podcast.mp3 -> output/podcast_raw_transcript.json
  const filename = key.replace(/^input\//, '')
  const basename = filename.replace(/\.[^.]+$/, '')
  const expectedRawTranscriptKey = `output/${basename}_raw_transcript.json`

  let rawTranscriptKey: string

  // Check if we should skip transcription when output already exists
  const shouldSkip =
    pipelineConfig.transcription.skipIfOutputExists &&
    (await context.step('check-output-exists', async () => {
      try {
        await s3.send(
          new HeadObjectCommand({
            Bucket: BUCKET_NAME,
            Key: expectedRawTranscriptKey,
          }),
        )
        return true
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          'name' in error &&
          error.name === 'NotFound'
        ) {
          return false
        }
        throw error
      }
    }))

  if (shouldSkip) {
    context.logger.info('Skipping transcription - output already exists', {
      inputKey: key,
      existingOutputKey: expectedRawTranscriptKey,
    })
    rawTranscriptKey = expectedRawTranscriptKey
  } else {
    const rawResult = await context.waitForCallback(
      `transcribe-${key}`,
      async (callbackId, innerCtx) => {
        innerCtx.logger.debug('Sending message to SQS with callback')

        const message: TranscriptionJob = {
          s3_key: key,
          callback_id: callbackId,
        }

        const sqs = new SQSClient()
        await sqs.send(
          new SendMessageCommand({
            QueueUrl: QUEUE_URL,
            MessageBody: JSON.stringify(message),
          }),
        )

        innerCtx.logger.info('Message sent successfully', { callbackId })
      },
      { timeout: { minutes: WHISPER_JOB_TIMEOUT_MINUTES } },
    )

    const result = JSON.parse(rawResult) as TranscriptionResult
    context.logger.info('Transcription completed', {
      inputKey: key,
      outputKey: result.rawTranscriptKey,
      stats: result.stats,
    })
    rawTranscriptKey = result.rawTranscriptKey
  }

  // Begin post-transcription
  const transcriptProcessingKey = await context.step(
    'prepare-processing-copy',
    async () => {
      // Copy raw transcript to a temporary processing file
      // to preserve the original raw transcript
      const processingKey = rawTranscriptKey.replace(
        '_raw_transcript.json',
        '_raw_transcript_processing.json',
      )
      await s3.send(
        new CopyObjectCommand({
          Bucket: BUCKET_NAME,
          CopySource: `${BUCKET_NAME}/${rawTranscriptKey}`,
          Key: processingKey,
        }),
      )
      context.logger.info('Prepared processing copy of transcript', {
        from: rawTranscriptKey,
        to: processingKey,
      })

      return processingKey
    },
  )

  // refining steps

  // Replacement rules
  await context.step('replacement-rules', async () => {
    if (typeof pipelineConfig.replacementRules === 'undefined') {
      context.logger.info('No replacement rules defined, skipping step')
      return
    }

    // Load the raw transcript from S3
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: transcriptProcessingKey,
      }),
    )
    const bodyStr = await response.Body?.transformToString()
    if (!bodyStr) {
      throw new Error('Empty response body from S3')
    }
    const transcript = JSON.parse(bodyStr) as WhisperxResult

    // Apply replacements
    const stats = applyReplacements(transcript, pipelineConfig.replacementRules)

    // Save the updated transcript back to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: transcriptProcessingKey,
        Body: JSON.stringify(transcript),
        ContentType: 'application/json',
      }),
    )

    context.logger.info('Applied replacement rules', { stats })
  })

  // - LLM-based refinement
  await context.step('llm-refinement', async () => {
    const llmConfig = pipelineConfig.llmRefinement
    if (!llmConfig?.bedrockInferenceProfileId) {
      context.logger.info('No LLM refinement configured, skipping step')
      return
    }

    // Load the raw transcript from S3
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: transcriptProcessingKey,
      }),
    )
    const bodyStr = await response.Body?.transformToString()
    if (!bodyStr) {
      throw new Error('Empty response body from S3')
    }
    const transcript = JSON.parse(bodyStr) as WhisperxResult

    // Derive region from inference profile ID prefix (eu., us., apac., global.)
    const bedrockClient = new BedrockRuntimeClient({
      region: getRegionFromProfileId(llmConfig.bedrockInferenceProfileId),
    })

    const { updates, ignoredSuggestions, ...stats } = await llmRefinement(
      transcript,
      llmConfig,
      bedrockClient,
    )

    // Save the refined transcript back to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: transcriptProcessingKey,
        Body: JSON.stringify(transcript),
        ContentType: 'application/json',
      }),
    )

    context.logger.info('Applied LLM refinement', {
      stats,
      updates,
      ignoredSuggestions,
    })
  })

  // Segments Normalization
  // Splits long segments into smaller, more readable chunks for caption display
  await context.step('segments-normalization', async () => {
    if (!pipelineConfig.normalization.normalize) {
      context.logger.info('Segments normalization disabled, skipping step')
      return
    }

    // Load the transcript from S3
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: transcriptProcessingKey,
      }),
    )
    const bodyStr = await response.Body?.transformToString()
    if (!bodyStr) {
      throw new Error('Empty response body from S3')
    }
    const transcript = JSON.parse(bodyStr) as WhisperxResult

    // Apply segments normalization
    const stats = normalizeSegments(transcript, pipelineConfig.normalization)

    // Save the updated transcript back to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: transcriptProcessingKey,
        Body: JSON.stringify(transcript),
        ContentType: 'application/json',
      }),
    )

    context.logger.info('Applied segments normalization', { stats })
  })

  // Finalize refined transcript (move processing file to final location)
  const refinedTranscriptKey = await context.step(
    'finalize-transcript',
    async () => {
      const targetKey = transcriptProcessingKey.replace(
        '_raw_transcript_processing.json',
        '_refined_transcript.json',
      )
      await s3.send(
        new CopyObjectCommand({
          Bucket: BUCKET_NAME,
          CopySource: `${BUCKET_NAME}/${transcriptProcessingKey}`,
          Key: targetKey,
        }),
      )
      await s3.send(
        new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: transcriptProcessingKey,
        }),
      )
      context.logger.info('Finalized refined transcript', {
        from: transcriptProcessingKey,
        to: targetKey,
      })
      return targetKey
    },
  )

  // Caption generation
  // Generate VTT, SRT, and JSON caption files in parallel
  const { captionKeys, pipelineCompletedAt } = await context.step(
    'generate-captions',
    async () => {
      const captionsConfig = pipelineConfig.captions

      // Check if any caption generation is enabled
      if (
        !captionsConfig.generateVtt &&
        !captionsConfig.generateSrt &&
        !captionsConfig.generateSimplifiedJson
      ) {
        context.logger.info('No caption generation enabled, skipping step')
        return {
          captionKeys: {},
          pipelineCompletedAt: new Date().toISOString(),
        }
      }

      // Load the transcript from S3
      const response = await s3.send(
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: refinedTranscriptKey,
        }),
      )
      const bodyStr = await response.Body?.transformToString()
      if (!bodyStr) {
        throw new Error('Empty response body from S3')
      }
      const transcript = JSON.parse(bodyStr) as WhisperxResult

      const generatedKeys: Record<string, string> = {}
      const uploadPromises: Promise<void>[] = []

      if (captionsConfig.generateVtt) {
        const vttContent = generateVtt({ transcript, config: captionsConfig })
        const vttKey = `output/${basename}_caption.vtt`
        uploadPromises.push(
          s3
            .send(
              new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: vttKey,
                Body: vttContent,
                ContentType: 'text/vtt',
              }),
            )
            .then(() => {
              generatedKeys.vtt = vttKey
            }),
        )
      }

      if (captionsConfig.generateSrt) {
        const srtContent = generateSrt({ transcript, config: captionsConfig })
        const srtKey = `output/${basename}_caption.srt`
        uploadPromises.push(
          s3
            .send(
              new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: srtKey,
                Body: srtContent,
                ContentType: 'application/x-subrip',
              }),
            )
            .then(() => {
              generatedKeys.srt = srtKey
            }),
        )
      }

      if (captionsConfig.generateSimplifiedJson) {
        const jsonContent = generateJson({ transcript, config: captionsConfig })
        const jsonKey = `output/${basename}_caption.json`
        uploadPromises.push(
          s3
            .send(
              new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: jsonKey,
                Body: jsonContent,
                ContentType: 'application/json',
              }),
            )
            .then(() => {
              generatedKeys.json = jsonKey
            }),
        )
      }

      await Promise.all(uploadPromises)

      context.logger.info('Generated captions', { keys: generatedKeys })
      return {
        captionKeys: generatedKeys,
        pipelineCompletedAt: new Date().toISOString(),
      }
    },
  )

  const pipelineDurationMs =
    new Date(pipelineCompletedAt).getTime() -
    new Date(pipelineStartedAt).getTime()

  const pipelineResult = {
    inputKey: key,
    bucket: BUCKET_NAME,
    outputKeys: {
      rawTranscript: rawTranscriptKey,
      refinedTranscript: refinedTranscriptKey,
      captions: captionKeys,
    },
    timing: {
      pipelineStartedAt,
      pipelineCompletedAt,
      pipelineDurationMs,
    },
  }

  // Send completion notification via EventBridge
  await context.step('send-notification', async () => {
    const notificationConfig = pipelineConfig.notification
    if (!notificationConfig.enabled) {
      context.logger.info('Notification disabled, skipping step')
      return
    }

    const eventBridge = new EventBridgeClient()
    await eventBridge.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: notificationConfig.eventBusName,
            Source: notificationConfig.source,
            DetailType: notificationConfig.detailType,
            Detail: JSON.stringify(pipelineResult),
          },
        ],
      }),
    )

    context.logger.info('Sent pipeline completion notification', {
      eventBus: notificationConfig.eventBusName,
      source: notificationConfig.source,
    })
  })

  context.logger.info('Pipeline completed', pipelineResult)

  return pipelineResult
}

export const lambdaHandler = withDurableExecution(handler)
