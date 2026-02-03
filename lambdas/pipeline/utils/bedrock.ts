/**
 * Bedrock utility functions for the pipeline Lambda.
 */

/**
 * Maps a Bedrock inference profile ID prefix to an AWS region.
 *
 * @param profileId - The Bedrock inference profile ID (e.g., "eu.anthropic.claude-sonnet-4-20250514-v1:0")
 * @returns The AWS region to use for the Bedrock client
 *
 * @example
 * getRegionFromProfileId("eu.anthropic.claude-sonnet-4-20250514-v1:0")
 * // => "eu-west-1"
 *
 * getRegionFromProfileId("us.anthropic.claude-3-haiku-20240307-v1:0")
 * // => "us-east-1"
 */
export function getRegionFromProfileId(profileId: string): string {
  if (profileId.startsWith('eu.')) return 'eu-west-1'
  if (profileId.startsWith('us.')) return 'us-east-1'
  if (profileId.startsWith('apac.')) return 'ap-northeast-1'
  if (profileId.startsWith('global.')) return 'us-east-1'
  return 'us-east-1' // Fallback for non-prefixed model IDs
}
