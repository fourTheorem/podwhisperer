# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Podwhisperer v2 is a serverless podcast transcription pipeline built with AWS CDK. It uses GPU-accelerated WhisperX for transcription with speaker diarization, followed by a multi-step post-processing pipeline that includes LLM-based refinement and caption generation.

The project is structured as a **pnpm monorepo** with these packages:

- `cdk/` - AWS CDK infrastructure code
- `lambdas/pipeline/` - Pipeline Lambda function (durable execution workflow)
- `packages/config/` - Shared configuration schemas and types
- `whisperx-image/` - Docker container for GPU transcription worker

## Common Commands

### Building

```bash
pnpm run build              # Build all packages
pnpm --filter @podwhisperer/cdk run build  # Build only CDK
```

### CDK Operations

Run from repository root:

```bash
pnpm cdk synth   # Synthesize CloudFormation (outputs to cdk/cdk.out/)
pnpm cdk diff    # Compare deployed stack with current state
pnpm cdk deploy  # Deploy stack to AWS
pnpm cdk destroy # Tear down deployed stack
```

### Linting and Formatting

```bash
pnpm lint    # Check code with Biome
pnpm format  # Format code with Biome
```

### Testing

```bash
pnpm --filter @podwhisperer/pipeline test  # Run pipeline tests
pnpm --filter @podwhisperer/config test    # Run config tests
```

## Project Structure

```
podwhisperer/
├── pnpm-workspace.yaml          # Workspace config
├── package.json                 # Root package (scripts only)
├── biome.json                   # Shared Biome linting config
├── lefthook.yml                 # Git hooks
├── CLAUDE.md
├── cdk/                         # CDK package
│   ├── package.json
│   ├── tsconfig.json
│   ├── cdk.json
│   ├── bin/
│   │   └── podwhisperer.ts      # CDK app entry point
│   └── lib/
│       └── podwhisperer-stack.ts # Main stack definition
├── lambdas/
│   └── pipeline/                # Pipeline Lambda package
│       ├── package.json
│       ├── index.ts             # Lambda handler (durable workflow)
│       ├── types.ts             # Shared types
│       ├── steps/               # Pipeline step implementations
│       │   ├── llm-refinement.ts
│       │   ├── replacement.ts
│       │   └── segments-normalization.ts
│       └── utils/
│           ├── bedrock.ts       # Bedrock API utilities
│           ├── captions/        # Caption generation (VTT, SRT, JSON)
│           ├── correction-validator.ts
│           └── lcs.ts           # Longest common subsequence
├── packages/
│   └── config/                  # Shared config package
│       ├── package.json
│       └── index.ts             # PipelineConfigSchema and types
└── whisperx-image/              # GPU worker container
    ├── Dockerfile
    └── src/
        ├── container_worker.py  # SQS polling loop
        ├── job.py               # WhisperX transcription job
        └── utils/
            ├── audio.py         # Audio validation and conversion
            └── timing.py        # Step timing utilities
```

## Architecture

### Pipeline Flow

1. **S3 Upload** triggers EventBridge rule on `input/` prefix
2. **Pipeline Lambda** (durable execution) orchestrates the workflow:
   - Sends job to SQS queue
   - Waits for callback from GPU worker
   - Applies post-processing steps (replacement, LLM, normalization)
   - Generates captions (VTT, SRT, JSON)
   - Sends EventBridge notification
3. **GPU Worker** (ECS container on Managed Instances):
   - Polls SQS queue
   - Downloads audio, runs WhisperX transcription
   - Uploads raw transcript, sends callback to Lambda

### Key Components

**CDK Stack** (`cdk/lib/podwhisperer-stack.ts`):
- S3 bucket with EventBridge notifications
- SQS queue for GPU worker tasks
- Pipeline Lambda with durable execution
- ECS cluster with Managed Instances capacity provider (GPU)
- Auto-scaling: 0 tasks when idle, 1 task when messages arrive

**Pipeline Lambda** (`lambdas/pipeline/index.ts`):
- Uses `@aws/durable-execution-sdk-js` for long-running workflows
- `waitForCallback` pauses execution until GPU worker completes
- Each step is a separate `context.step()` for checkpointing

**Configuration** (`packages/config/index.ts`):
- Zod schemas for all pipeline configuration
- Exported types: `PipelineConfig`, `TranscriptionConfig`, etc.
- Used by both CDK (at synth time) and Lambda (at runtime)

## Important Implementation Notes

### Durable Execution

The pipeline Lambda uses AWS Durable Execution to survive Lambda timeouts:
- Workflow state is automatically checkpointed
- `waitForCallback` suspends execution until GPU worker calls back
- Lambda alias (`live`) is required for durable invocation

### GPU Instance Provisioning

ECS Managed Instances automatically provision GPU instances:
- Instance requirements: 4-16 vCPUs, 16+ GiB memory, 1 NVIDIA GPU
- Scales to zero when no work (no GPU costs when idle)
- Uses spot instances for cost savings

### Container Image Build

The WhisperX model is baked into the container at build time:
- `MODEL_NAME` build arg specifies which Whisper model to include
- `HF_TOKEN` build arg for HuggingFace authentication
- Image is built by CDK and pushed to ECR during deploy

### FargateService for Managed Instances

The stack uses `ecs.FargateService` (not `Ec2Service`) for the GPU worker:
- This is a CDK workaround - `Ec2Service` doesn't support Managed Instances
- `capacityProviderStrategies` ensures tasks run on GPU Managed Instances

### LLM Refinement Validation

LLM suggestions are validated to prevent aggressive rewrites:
- Word change ratio limit (default 40%)
- Normalized edit distance limit
- Consecutive change limit
- Short segments skip ratio checks

### Caption Generation

Three formats generated in parallel:
- VTT: WebVTT with optional word highlighting
- SRT: SubRip format with speaker names
- JSON: Simplified format with speaker mapping

## Testing

Tests use Vitest and are co-located with source files:
- `lambdas/pipeline/steps/*.test.ts`
- `lambdas/pipeline/utils/captions/*.test.ts`
- `packages/config/index.test.ts`

Run tests: `pnpm --filter @podwhisperer/pipeline test`

## Working with the Codebase

When modifying pipeline steps:
1. Update the step implementation in `lambdas/pipeline/steps/`
2. Update config schema in `packages/config/index.ts` if needed
3. Add/update tests
4. Run `pnpm lint` and `pnpm --filter @podwhisperer/pipeline test`

When modifying infrastructure:
1. Update `cdk/lib/podwhisperer-stack.ts`
2. Run `pnpm cdk synth` to verify template generation
3. Run `pnpm cdk diff` to see changes
