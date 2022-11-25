import { logger, middify } from './lib/lambda-common.js'
import { S3Client } from '@aws-sdk/client-s3'
import { basename } from 'node:path'
import envs from './lib/envs'
import { putS3JSON } from './lib/utils.js'

const { BUCKET_NAME, SAGEMAKER_INPUTS_PREFIX } = envs

type ManifestCreationEvent = {
  id: string,
  audioInputKey: string
}

const s3Client = new S3Client({})

/**
 * Create a SageMaker Transform manifest file for one job only.
 * The job parameters are stored in JSON and that JSON is referenced as the only entry in the "batch" manifest.
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
    putS3JSON(s3Client, BUCKET_NAME, manifestKey, manifestContent),
    putS3JSON(s3Client, BUCKET_NAME, jobParamsKey, jobParams)
  ])

  logger.info('Manifest created', { putResponses })
  return {
    manifestKey,
    jobParamsKey
  }
}) as unknown as ((event: ManifestCreationEvent) => Promise<void>) 
