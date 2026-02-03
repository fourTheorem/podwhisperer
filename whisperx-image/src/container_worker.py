import json
import logging
import os
import signal
import sys
import time
import traceback

import boto3
from pynvml import nvmlInit, nvmlSystemGetDriverVersion

from job import run_job

sqs = boto3.client("sqs")
lambda_client = boto3.client("lambda")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Shutdown state
shutdown_requested = False
job_in_progress = False
SHUTDOWN_GRACE_PERIOD_SECONDS = 5

# Warmup state
keep_warm_until: float | None = None  # Unix timestamp
DEFAULT_WARMUP_DURATION_MINUTES = 30  # If no 'until' specified

# Job timeout configuration (from env var, in sync with SQS visibility timeout)
JOB_TIMEOUT_MINUTES = int(os.environ.get("JOB_TIMEOUT_MINUTES", "60"))
JOB_TIMEOUT_SECONDS = JOB_TIMEOUT_MINUTES * 60


def signal_handler(signum, frame):
    """Handle SIGTERM and SIGINT signals for graceful shutdown."""
    global shutdown_requested
    signal_name = "SIGTERM" if signum == signal.SIGTERM else "SIGINT"
    logger.info(f"Received {signal_name} signal, initiating graceful shutdown")
    shutdown_requested = True


def wait_for_job_completion():
    """Wait up to SHUTDOWN_GRACE_PERIOD_SECONDS for current job to complete."""
    if not job_in_progress:
        logger.info("No job in progress, shutting down immediately")
        return

    logger.info(
        f"Job in progress, waiting up to {SHUTDOWN_GRACE_PERIOD_SECONDS} seconds for completion"
    )
    start_time = time.time()

    while (
        job_in_progress and (time.time() - start_time) < SHUTDOWN_GRACE_PERIOD_SECONDS
    ):
        time.sleep(0.1)

    if job_in_progress:
        logger.warning(
            f"Grace period of {SHUTDOWN_GRACE_PERIOD_SECONDS} seconds expired, forcing shutdown"
        )
    else:
        elapsed = round(time.time() - start_time, 2)
        logger.info(
            f"Job completed within grace period ({elapsed}s), shutting down cleanly"
        )


def send_callback_failure(callback_id: str, error_type: str, error_message: str):
    """Send failure callback to Lambda durable execution."""
    logger.info(f"Sending failure callback for {callback_id}: {error_type}")
    lambda_client.send_durable_execution_callback_failure(
        CallbackId=callback_id,
        Error={"ErrorType": error_type, "ErrorMessage": error_message},
    )
    logger.info(f"Failure callback sent for {callback_id}")


def handle_warmup_message(body: dict) -> bool:
    """
    Check if message is a warmup message and handle it.
    Returns True if it was a warmup message (should skip job processing).

    If already in warmup mode, only extends the warmup period (never shortens it).
    """
    global keep_warm_until

    if body.get("type") != "warmup":
        return False

    until_str = body.get("until")
    if until_str:
        # Parse ISO 8601 timestamp
        from datetime import datetime

        until_dt = datetime.fromisoformat(until_str.replace("Z", "+00:00"))
        new_until = until_dt.timestamp()
    else:
        # Default: 30 minutes from now
        new_until = time.time() + (DEFAULT_WARMUP_DURATION_MINUTES * 60)

    # Only update if new time is later than current (extend, never shorten)
    if keep_warm_until is None or new_until > keep_warm_until:
        keep_warm_until = new_until
        logger.info(
            f"Warmup updated, keeping container warm until {until_str or 'default duration'}"
        )
    else:
        logger.info(
            "Warmup message ignored, current warmup period extends beyond requested time"
        )

    return True


def is_warmup_active() -> bool:
    """Check if warmup period is currently active."""
    if keep_warm_until is None:
        return False
    return time.time() < keep_warm_until


def main():
    global job_in_progress

    # Register signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    logger.info("Starting SQS worker loop")
    queue_url = os.environ["QUEUE_URL"]

    # Track consecutive empty polls for auto-shutdown
    consecutive_empty_polls = 0
    MAX_EMPTY_POLLS = 3

    while not shutdown_requested:
        resp = sqs.receive_message(
            QueueUrl=queue_url,
            MaxNumberOfMessages=10,
            WaitTimeSeconds=1,
            VisibilityTimeout=JOB_TIMEOUT_SECONDS,
        )
        msgs = resp.get("Messages", [])
        if not msgs:
            consecutive_empty_polls += 1
            logger.info(
                f"No messages received (empty poll {consecutive_empty_polls}/{MAX_EMPTY_POLLS})"
            )

            # Only auto-shutdown if warmup is not active
            if not is_warmup_active():
                if consecutive_empty_polls >= MAX_EMPTY_POLLS:
                    logger.info(
                        f"Reached {MAX_EMPTY_POLLS} consecutive empty polls, shutting down to save costs"
                    )
                    break
            else:
                # Log that we're staying warm
                remaining = keep_warm_until - time.time()
                logger.info(
                    f"Warmup active, staying alive ({remaining:.0f}s remaining)"
                )

            continue

        # Reset counter when messages are received
        consecutive_empty_polls = 0
        logger.info(f"Received {len(msgs)} messages")
        for m in msgs:
            if shutdown_requested:
                logger.info("Shutdown requested, stopping message processing")
                break

            logger.info(f"Processing message: {m['MessageId']}")
            receipt = m["ReceiptHandle"]
            body = json.loads(m["Body"]) if m.get("Body") else {}

            # Handle warmup messages specially
            if handle_warmup_message(body):
                # Immediately acknowledge warmup message
                sqs.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt)
                logger.info("Warmup message acknowledged, container will stay warm")
                continue  # Skip job processing

            callback_id = body.get("callback_id")

            try:
                logger.info("Running job %s", m["MessageId"])
                job_in_progress = True
                t0 = time.time()
                run_job(body)
                logger.info(
                    json.dumps(
                        {"status": "done", "elapsed_wall_s": round(time.time() - t0, 3)}
                    )
                )

                sqs.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt)
                # Clear flag immediately on success if not shutting down
                if not shutdown_requested:
                    job_in_progress = False
            except Exception as e:
                traceback.print_exc()
                logger.exception("Error processing message")

                # Send failure callback if callback_id is present
                if callback_id:
                    send_callback_failure(
                        callback_id,
                        error_type=type(e).__name__,
                        error_message=str(e),
                    )

                # Let message become visible again
                # Clear flag immediately on error if not shutting down
                if not shutdown_requested:
                    job_in_progress = False

    logger.info("Exiting worker loop")
    wait_for_job_completion()
    # Clear flag after grace period
    job_in_progress = False
    logger.info("Shutdown complete")
    sys.exit(0)


if __name__ == "__main__":
    nvmlInit()
    logger.info("CUDA Driver version: %s", nvmlSystemGetDriverVersion())

    main()
