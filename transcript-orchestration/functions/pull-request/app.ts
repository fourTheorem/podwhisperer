import path from 'node:path'
import { tmpdir } from 'node:os'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { simpleGit } from 'simple-git'
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'
import { S3Client } from '@aws-sdk/client-s3'
import { Octokit } from 'octokit'

import envs from '../lib/envs'
import { logger, middify } from '../lib/lambda-common'
import { getS3JSON } from '../lib/utils'

const GIT_HUB_CREDENTIALS_SSM_PARAMETER = '/podwhisperer/gitHubUserCredentials'

const { BUCKET_NAME, GIT_REPO_URL, GIT_USER_EMAIL, GIT_USER_NAME } = envs

const ssmClient = new SSMClient({})
const s3Client = new S3Client({})

/*
 * A personal access token is used to clone and push from/to GitHub
 */
const gitHubUserCredentialsPromise = ssmClient.send(new GetParameterCommand({
  Name: GIT_HUB_CREDENTIALS_SSM_PARAMETER,
  WithDecryption: true
}))

type PullRequestEvent = {
  transcriptKey: string
}

/**
 * Lambda Function handler to create a GitHub Pull Request against a configured repository with the contents of a transcript
 * retrieved from S3. The process:
 * 
 * - Clones the Git repository
 * - Creates a branch and adds the transcript in a new commit
 * - Creates a GitHub Pull Request against the main branch
 * - Returns the GitHub PR URL
 * 
 * This function requires a GitHub Personal Access Token, preferably a fine-grained token. It should be stored with the username
 * in a SSM SecureString Parameter `/podwhisperer/gitHubUserCredentials` in the format <Username>:<GitHubPersonalAccessToken>
 */
export const handleEvent = middify(async (event: PullRequestEvent) => {
  const transcript = await getS3JSON(s3Client, BUCKET_NAME, event.transcriptKey)
  const id = path.basename(event.transcriptKey).split('.')[0]

  const tmpDir = await mkdtemp(path.join(tmpdir(), 'pr-'))
  logger.info('Using temporary directory', { tmpDir })
  try {
    const ts = new Date().toISOString().replace(/[^\d]+/g, '')

    const branchName = `ep-${id}-transcript-${ts}`
    const gitHubUserCredentials = (await gitHubUserCredentialsPromise).Parameter?.Value
    if (!gitHubUserCredentials) {
      throw new Error('No gitHubUserCredentials found')
    }
    const [username, password] = gitHubUserCredentials.split(':')
    if (!username || !password) {
      throw new Error(`${GIT_HUB_CREDENTIALS_SSM_PARAMETER} SSM Parameter should be in the format <Username>:<GitHubPersonalAccessToken>`)
    }

    const gitUrl = new URL(GIT_REPO_URL)
    gitUrl.username = username
    gitUrl.password = password

    const git = simpleGit(tmpDir)
    await git
      .addConfig('user.email', GIT_USER_EMAIL, true, 'global')
      .addConfig('user.name', GIT_USER_NAME, true, 'global')
      .addConfig('credential.helper', 'cache 900', true, 'global')

    const repoName = path.basename(gitUrl.pathname).split('.')[0]
    logger.info('Cloning', { tmpDir, localPath: repoName, url: GIT_REPO_URL })
    await git.clone(gitUrl.toString(), repoName)

    logger.info('Checking out new branch', { branchName })
    await git.cwd(path.resolve(tmpDir, repoName)).checkoutBranch(branchName, 'HEAD')

    logger.info('Adding transcript', { branchName })
    const newFilePath = path.join(tmpDir, repoName, 'src', '_transcripts', `${id}.json`)
    await mkdir(path.dirname(newFilePath), { recursive: true })
    await writeFile(newFilePath, JSON.stringify(transcript, null, ' '))
    await git.add(newFilePath)

    logger.info('Committing and pushing')
    const title = `add episode ${id} transcript`
    await git.commit(`chore: ${title}`)
    await git.push('origin', branchName, ['--set-upstream'])

    logger.info('Creating GitHub PR')
    const gitHubToken = gitHubUserCredentials.split(':')[1]
    const octokit = new Octokit({ auth: gitHubToken })
    const body = `Automatic pull request created from s3://${BUCKET_NAME}/${event.transcriptKey}`
    const head = branchName
    const base = 'main'
    const repoPath = gitUrl.pathname
    const [, owner,] = repoPath.split('/')
    const response = await octokit.request(
      `POST /repos/${owner}/${repoName}/pulls`, { owner,title, body, head, base, repo: repoName }
    )
    const prUrl = response.data.html_url
    console.log('Created PR', { prUrl })
    return { prUrl }
  } finally {
    rm(tmpDir, { recursive: true })
  }
})