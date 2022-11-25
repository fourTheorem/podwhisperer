import { Logger, injectLambdaContext } from '@aws-lambda-powertools/logger'
import { Metrics, logMetrics } from '@aws-lambda-powertools/metrics'
import { Tracer, captureLambdaHandler } from '@aws-lambda-powertools/tracer'
import middy from '@middy/core'
import { Handler } from 'aws-lambda'

// Exported powertools instances for use anywhere within a Lambda function implementation
export const logger = new Logger()
export const tracer = new Tracer()
export const metrics = new Metrics()

/**
 * Create a wrapped Lambda Function handler with injected powertools logger, tracer and metrics
 * 
 * @param handler The undecorated Lambda Function handler
 * @returns A 'middified' handler
 */
export const middify = (handler: Handler) => {
  return middy(handler)
    .use(injectLambdaContext(logger, { logEvent: true }))
    .use(logMetrics(metrics))
    .use(captureLambdaHandler(tracer))
}