import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type PipelineConfig,
  type PipelineConfigProcessed,
  PipelineConfigSchema,
} from '@podwhisperer/config'
import * as appscaling from 'aws-cdk-lib/aws-applicationautoscaling'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { Platform } from 'aws-cdk-lib/aws-ecr-assets'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as cdk from 'aws-cdk-lib/core'
import type { Construct } from 'constructs'

/**
 * Stack props with podwhisperer-specific configuration.
 */
interface PodwhispererStackProps extends cdk.StackProps {
  /** Pipeline configuration (includes transcription, post-processing, captions) */
  pipelineConfig?: PipelineConfig
}

export class PodwhispererStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: PodwhispererStackProps) {
    super(scope, id, props)
    const self = cdk.Stack.of(this)
    const partition = self.partition
    const accountId = self.account

    // Parse and validate pipeline config with defaults
    const pipelineConfig: PipelineConfigProcessed = PipelineConfigSchema.parse(
      props?.pipelineConfig ?? {},
    )

    // Extract transcription config for convenience
    const transcriptionConfig = pipelineConfig.transcription

    // Reference SSM parameter for runtime injection via ECS secrets
    // This does NOT fetch the value at synth time - it creates a reference for ECS to resolve at runtime
    const hfTokenParameter =
      ssm.StringParameter.fromSecureStringParameterAttributes(
        this,
        'HfTokenParameter',
        {
          parameterName: transcriptionConfig.hfTokenSsmPath,
        },
      )

    // Generate pipeline config layer content
    const layerDir = join(
      __dirname,
      '..',
      '.layers',
      'pipeline-config',
      'nodejs',
    )
    rmSync(join(__dirname, '..', '.layers', 'pipeline-config'), {
      recursive: true,
      force: true,
    })
    mkdirSync(layerDir, { recursive: true })
    writeFileSync(
      join(layerDir, 'config.json'),
      JSON.stringify(pipelineConfig, null, 2),
    )

    const pipelineConfigLayer = new lambda.LayerVersion(
      this,
      'PipelineConfigLayer',
      {
        code: lambda.Code.fromAsset(
          join(__dirname, '..', '.layers', 'pipeline-config'),
        ),
        compatibleRuntimes: [lambda.Runtime.NODEJS_24_X],
        description: 'Pipeline configuration layer',
      },
    )

    const queue = new sqs.Queue(this, 'PodwhispererQueue', {
      visibilityTimeout: cdk.Duration.minutes(
        transcriptionConfig.jobTimeoutMinutes,
      ),
    })

    // S3 bucket for the whisper container
    const bucket = new s3.Bucket(this, 'PodwhispererBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    // Lambda function triggered by S3 uploads - sends messages to SQS queue
    const pipelineLambdaLogGroup = new logs.LogGroup(
      this,
      'PipelineLambdaLogGroup',
      {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_WEEK,
      },
    )

    const pipelineLambda = new NodejsFunction(this, 'PipelineLambda', {
      entry: join(__dirname, '..', '..', 'lambdas', 'pipeline', 'index.ts'),
      handler: 'lambdaHandler',
      runtime: lambda.Runtime.NODEJS_24_X,
      environment: {
        QUEUE_URL: queue.queueUrl,
        BUCKET_NAME: bucket.bucketName,
        WHISPER_JOB_TIMEOUT_MINUTES: String(
          transcriptionConfig.jobTimeoutMinutes,
        ),
      },
      logGroup: pipelineLambdaLogGroup,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      durableConfig: {
        executionTimeout: cdk.Duration.minutes(
          transcriptionConfig.jobTimeoutMinutes + 60,
        ), // Job timeout + 60 min buffer
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node24',
        format: OutputFormat.ESM,
        mainFields: ['module', 'main'],
      },
      layers: [pipelineConfigLayer],
    })

    // Checkpoint permissions required for durable execution
    pipelineLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'lambda:CheckpointDurableExecutions',
          'lambda:GetDurableExecutionState',
        ],
        resources: ['*'],
      }),
    )

    // Grant permissions to the Lambda function
    queue.grantSendMessages(pipelineLambda)
    bucket.grantReadWrite(pipelineLambda, 'output/*')

    // Grant Bedrock permissions if LLM refinement is configured
    // For cross-region inference profiles (e.g., eu.anthropic.claude-sonnet-4-20250514-v1:0),
    // we need permissions on both the inference profile and the underlying foundation model.
    // The geographic prefix (eu., us., apac., global.) is stripped to get the foundation model ID.
    if (pipelineConfig.llmRefinement?.bedrockInferenceProfileId) {
      const profileId = pipelineConfig.llmRefinement.bedrockInferenceProfileId
      // Extract model ID by removing the geographic prefix
      const modelId = profileId.replace(/^(eu|us|apac|global)\./, '')

      pipelineLambda.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['bedrock:InvokeModel'],
          resources: [
            // Permission on the inference profile (system-defined, no account ID)
            `arn:${partition}:bedrock:*:${accountId}:inference-profile/${profileId}`,
            // Permission on foundation models in all regions (no account ID)
            `arn:${partition}:bedrock:*::foundation-model/${modelId}`,
          ],
        }),
      )
    }

    // Grant EventBridge PutEvents permission for notification step
    if (pipelineConfig.notification?.enabled) {
      pipelineLambda.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['events:PutEvents'],
          resources: [
            pipelineConfig.notification.eventBusName === 'default'
              ? `arn:${partition}:events:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:event-bus/default`
              : `arn:${partition}:events:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:event-bus/${pipelineConfig.notification.eventBusName}`,
          ],
        }),
      )
    }

    // Create alias for durable function invocation
    // Durable functions require qualified ARNs (version or alias)
    const pipelineLambdaAlias = new lambda.Alias(this, 'PipelineLambdaAlias', {
      aliasName: 'live',
      version: pipelineLambda.currentVersion,
    })

    // Enable EventBridge notifications on the bucket
    bucket.enableEventBridgeNotification()

    // Create EventBridge rule to trigger Lambda on object creation in input/
    // Using CfnRule (L1) because L2 targets.LambdaFunction doesn't properly
    // support Lambda aliases/versions required for durable functions.
    // See: https://github.com/aws/aws-cdk/issues/12522
    const s3EventRule = new events.CfnRule(this, 'S3ObjectCreatedRule', {
      state: 'ENABLED',
      eventPattern: {
        source: ['aws.s3'],
        'detail-type': ['Object Created'],
        detail: {
          bucket: { name: [bucket.bucketName] },
          object: { key: [{ prefix: 'input/' }] },
        },
      },
      targets: [
        {
          id: 'PipelineLambdaTarget',
          arn: pipelineLambdaAlias.functionArn,
        },
      ],
    })

    // Grant EventBridge permission to invoke the Lambda alias
    pipelineLambdaAlias.addPermission('EventBridgeInvoke', {
      principal: new iam.ServicePrincipal('events.amazonaws.com'),
      sourceArn: cdk.Arn.format(
        {
          service: 'events',
          resource: 'rule',
          resourceName: s3EventRule.ref,
        },
        this,
      ),
    })

    // Whisper transcription container - model is baked into image via build arg
    // HF_TOKEN is passed via BuildKit secret (not stored in image layers)
    // The token must be set as HF_TOKEN environment variable when running cdk deploy
    const image = ecs.ContainerImage.fromAsset(
      join(__dirname, '..', '..', 'whisperx-image'),
      {
        platform: Platform.LINUX_AMD64,
        buildArgs: {
          MODEL_NAME: transcriptionConfig.model,
        },
        buildSecrets: {
          // Use 'env=HF_TOKEN' to read from environment variable (Docker BuildKit format)
          HF_TOKEN: 'env=HF_TOKEN',
        },
      },
    )

    // Runtime config passed as JSON env var (excludes model which is baked into image)
    const whisperRuntimeConfig = {
      language: transcriptionConfig.language,
      minSpeakers: transcriptionConfig.minSpeakers,
      maxSpeakers: transcriptionConfig.maxSpeakers,
    }

    const instanceProfileRole = new iam.Role(
      this,
      'ManagedInstancesInstanceProfileRole',
      {
        assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      },
    )
    instanceProfileRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'AmazonECSInstanceRolePolicyForManagedInstances',
      ),
    )

    const infrastructureRole = new iam.Role(
      this,
      'ManagedInstancesInfrastructureRole',
      {
        assumedBy: new iam.ServicePrincipal('ecs.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'AmazonECSInfrastructureRolePolicyForManagedInstances',
          ),
        ],
      },
    )
    infrastructureRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [instanceProfileRole.roleArn],
      }),
    )

    const instanceProfile = new iam.InstanceProfile(
      this,
      'ManagedInstancesInstanceProfile',
      {
        role: instanceProfileRole,
      },
    )

    const cluster = new ecs.Cluster(this, 'PodwhispererCluster', {
      clusterName: 'PodwhispererCluster',
      containerInsightsV2: ecs.ContainerInsights.ENHANCED,
    })

    // CloudWatch Log Group for capturing ECS events (task state changes, service events, etc.)
    const ecsEventsLogGroup = new logs.LogGroup(this, 'EcsEventsLogGroup', {
      logGroupName: `/aws/events/ecs/containerinsights/${cluster.clusterName}/performance`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK,
    })

    // EventBridge rule to capture all ECS events and send them to CloudWatch Logs
    // Filters by cluster ARN to capture ALL ECS events for this cluster
    // The CloudWatchLogGroup target automatically creates the necessary resource policy
    const _ecsEventsRule = new events.Rule(this, 'EcsEventsRule', {
      ruleName: 'EventsToLogsEcsRule', // Matches AWS console naming pattern
      eventPattern: {
        source: ['aws.ecs'],
        detail: {
          clusterArn: [cluster.clusterArn],
        },
      },
      targets: [new targets.CloudWatchLogGroup(ecsEventsLogGroup)],
    })

    const allowOutboundSg = new ec2.SecurityGroup(this, 'ManagedInstancesSG', {
      vpc: cluster.vpc,
      allowAllOutbound: true,
      description: 'Security group for managed instances',
    })

    const capacityProvider = new ecs.ManagedInstancesCapacityProvider(
      this,
      'PodwhispererCapacityProvider',
      {
        subnets: cluster.vpc.privateSubnets,
        infrastructureRole,
        ec2InstanceProfile: instanceProfile,
        propagateTags: ecs.PropagateManagedInstancesTags.CAPACITY_PROVIDER,
        securityGroups: [allowOutboundSg],
        instanceRequirements: {
          vCpuCountMin: 4,
          vCpuCountMax: 16, // Allow various GPU instance types from 4 to 16 vCPUs
          memoryMin: cdk.Size.gibibytes(16), // Minimum 16 GB (8 GB task + ~8 GB OS overhead)
          cpuManufacturers: [
            ec2.CpuManufacturer.INTEL,
            ec2.CpuManufacturer.AMD,
          ],
          instanceGenerations: [ec2.InstanceGeneration.CURRENT],
          burstablePerformance: ec2.BurstablePerformance.EXCLUDED,
          bareMetal: ec2.BareMetal.EXCLUDED,

          // GPU requirement: single NVIDIA GPU
          // Allows: g4dn.xlarge, g4dn.2xlarge, g5.xlarge, g5.2xlarge, p3.2xlarge, etc.
          acceleratorManufacturers: [ec2.AcceleratorManufacturer.NVIDIA],
          acceleratorTypes: [ec2.AcceleratorType.GPU],
          acceleratorCountMin: 1,
          acceleratorCountMax: 1, // No multi-GPU instances
        },
      },
    )
    cluster.addManagedInstancesCapacityProvider(capacityProvider)

    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/ecs/${id}Service`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK,
    })

    const ecsTaskDefinition = new ecs.TaskDefinition(
      this,
      'PodwhispererTaskDef',
      {
        compatibility: ecs.Compatibility.MANAGED_INSTANCES,
        cpu: '4096',
        memoryMiB: '8192',
        runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.X86_64 },
        networkMode: ecs.NetworkMode.AWS_VPC,
      },
    )
    ecsTaskDefinition.addContainer('worker', {
      image,
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: `${id}Service`,
      }),
      environment: {
        QUEUE_URL: queue.queueUrl,
        BUCKET_NAME: bucket.bucketName,
        WHISPER_CONFIG: JSON.stringify(whisperRuntimeConfig),
        JOB_TIMEOUT_MINUTES: String(transcriptionConfig.jobTimeoutMinutes),
      },
      // HF_TOKEN injected at runtime from SSM (not baked into image)
      secrets: {
        HF_TOKEN: ecs.Secret.fromSsmParameter(hfTokenParameter),
      },
      gpuCount: 1,
    })

    // Scoped S3 permissions: read from input/, write to output/
    ecsTaskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [bucket.arnForObjects('input/*')],
      }),
    )
    ecsTaskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject'],
        resources: [bucket.arnForObjects('output/*')],
      }),
    )

    // Permission for ECS task to send durable execution callbacks to Lambda
    ecsTaskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'lambda:SendDurableExecutionCallbackSuccess',
          'lambda:SendDurableExecutionCallbackFailure',
        ],
        resources: ['*'], // Callback ID contains routing info
      }),
    )

    // Note: Using FargateService instead of Ec2Service for MANAGED_INSTANCES compatibility.
    // While this may seem counterintuitive, CDK currently requires FargateService when using
    // Managed Instances capacity providers. Ec2Service throws a validation error even though
    // the task definition has MANAGED_INSTANCES compatibility. The capacityProviderStrategies
    // override ensures tasks run on our GPU-enabled Managed Instances, not on Fargate.
    const service = new ecs.FargateService(this, 'PodwhispererService', {
      cluster,
      taskDefinition: ecsTaskDefinition,
      desiredCount: 0, // Start at 0, scale up based on queue depth
      minHealthyPercent: 0, // Allow tasks to be stopped during deployments
      enableExecuteCommand: true,
      capacityProviderStrategies: [
        {
          capacityProvider: capacityProvider.capacityProviderName,
          weight: 1,
        },
      ],
    })

    // Auto-scaling: scale to zero when queue is empty, scale to 1 when messages arrive
    // Simple binary scaling: 0 messages = 0 tasks, 1+ messages = 1 task
    const scaling = service.autoScaleTaskCount({
      minCapacity: 0, // Scale to zero when idle = no cost
      maxCapacity: 1, // Only allow 1 concurrent task
    })

    scaling.scaleOnMetric('QueueDepthScaling', {
      metric: queue.metricApproximateNumberOfMessagesVisible(),
      scalingSteps: [
        { upper: 0, change: -1 }, // Scale down to 0 when queue is empty
        { lower: 1, change: +1 }, // 1+ messages: scale up to 1 task
      ],
      adjustmentType: appscaling.AdjustmentType.CHANGE_IN_CAPACITY,
      cooldown: cdk.Duration.seconds(60),
    })

    queue.grantConsumeMessages(ecsTaskDefinition.taskRole)

    new cdk.CfnOutput(this, 'QueueUrl', {
      value: queue.queueUrl,
      description: 'SQS Queue URL for submitting work to the GPU workers',
      exportName: `${id}-QueueUrl`,
    })

    new cdk.CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      description: 'S3 Bucket name for storing data processed by GPU workers',
      exportName: `${id}-BucketName`,
    })
  }
}
