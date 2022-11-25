import { Context } from 'aws-lambda';

/* istanbul ignore next */
export const mockedContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'mockFunction',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:eu-west-1:123456789123:mockFunction:1',
  memoryLimitInMB: '128',
  awsRequestId: 'mockRequest',
  logGroupName: '/aws/lambda/mockFunction',
  logStreamName: 'mock-log-stream',
  getRemainingTimeInMillis(): number {
    return 15 * 60 * 1000;
  },
  done(error?: Error, result?: any): void {
    return;
  },
  fail(error: Error | string): void {
    return;
  },
  succeed(messageOrObject: any): void {
    return;
  }
}