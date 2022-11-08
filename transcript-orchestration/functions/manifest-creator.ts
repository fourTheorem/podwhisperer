import { logger, middify } from './lib/lambda-common.js'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { basename } from 'node:path'

const { BUCKET_NAME, SAGEMAKER_INPUTS_PREFIX } = process.env
if (!BUCKET_NAME) {
  throw new Error('BUCKET_NAME must be set')
}

type ManifestCreationEvent = {
  id: string,
  audioInputKey: string
}

const s3Client = new S3Client({})

/**
 * @param {Object} event - Input event to the Lambda function
 *
 * @returns {Object} object - Object containing details of the stock buying transaction
 */
export const handleEvent = middify(async (event: ManifestCreationEvent) => {
  logger.info('Creating manifest', { event })

  const jobParams = {
    'bucket_name': BUCKET_NAME,
    'object_key': event.audioInputKey,
  }
  const manifestKey = `${SAGEMAKER_INPUTS_PREFIX}/${event.id}.manifest`
  const jobParamsKey = `${SAGEMAKER_INPUTS_PREFIX}/${event.id}_${basename(event.audioInputKey)}.json`

  const manifestContent = [{ prefix: `s3://${BUCKET_NAME}/` }, jobParamsKey]

  logger.info('Creating manifest and job parameters', { manifestKey, manifestContent, jobParamsKey, jobParams })
  const putResponses = await Promise.all([
    s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: manifestKey,
      Body: JSON.stringify(manifestContent)
    })),
    s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: jobParamsKey,
      Body: JSON.stringify(jobParams)
    }))
  ])

  logger.info('Manifest created', { putResponses })
  return {
    manifestKey,
    jobParamsKey
  }
}) as unknown as ((event: ManifestCreationEvent) => Promise<void>) 
