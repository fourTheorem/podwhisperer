import { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { logger } from '../lib/lambda-common';

export async function getS3JSON<T = any>(s3Client: S3Client, bucket: string, key: string): Promise<T> {
  logger.info('Getting object', { bucket, key } )
  const response = await s3Client.send(new GetObjectCommand({
    Bucket: bucket,
    Key:key
  }))

  const chunks = []
  for await (const chunk of response.Body as any as Readable) {
    chunks.push(chunk)
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
}

export async function putS3JSON(s3Client: S3Client, bucket: string, key: string, data: any): Promise<void> {
  logger.info('Putting object', { bucket, key } )
  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: JSON.stringify(data)
  }))
}