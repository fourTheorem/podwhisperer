"""Tests for container_worker.py - warmup handling, signal handling, callbacks."""

import signal
import sys
from unittest.mock import MagicMock

import pytest

# Mock heavy dependencies before importing container_worker
# These modules create clients/connections at import time
_mock_sqs = MagicMock()
_mock_lambda = MagicMock()
_mock_boto3 = MagicMock()
_mock_boto3.client.side_effect = lambda service: {
    "sqs": _mock_sqs,
    "lambda": _mock_lambda,
}.get(service, MagicMock())

sys.modules["boto3"] = _mock_boto3
sys.modules["pynvml"] = MagicMock()
sys.modules["job"] = MagicMock()


class TestHandleWarmupMessage:
    """Tests for handle_warmup_message function."""

    @pytest.fixture(autouse=True)
    def reset_warmup_state(self):
        """Reset warmup state before each test."""
        import container_worker

        container_worker.keep_warm_until = None
        yield
        container_worker.keep_warm_until = None

    def test_non_warmup_message_returns_false(self):
        """Should return False for non-warmup messages."""
        import container_worker

        result = container_worker.handle_warmup_message({"type": "job", "data": {}})

        assert result is False
        assert container_worker.keep_warm_until is None

    def test_warmup_message_without_until_uses_default(self, mocker):
        """Should use default duration when 'until' is not specified."""
        import container_worker

        mocker.patch.object(
            container_worker,
            "time",
            MagicMock(time=MagicMock(return_value=1704067200.0)),
        )

        result = container_worker.handle_warmup_message({"type": "warmup"})

        assert result is True
        # Default is 30 minutes = 1800 seconds
        expected = 1704067200.0 + (30 * 60)
        assert container_worker.keep_warm_until == expected

    def test_warmup_message_with_iso_timestamp(self, mocker):
        """Should parse ISO 8601 timestamp correctly."""
        import container_worker

        mocker.patch.object(
            container_worker,
            "time",
            MagicMock(time=MagicMock(return_value=1704067200.0)),
        )

        result = container_worker.handle_warmup_message(
            {
                "type": "warmup",
                "until": "2024-01-01T01:00:00+00:00",
            }
        )

        assert result is True
        # 2024-01-01 01:00:00 UTC = 1704070800
        assert container_worker.keep_warm_until == 1704070800.0

    def test_warmup_message_with_z_suffix(self, mocker):
        """Should handle Z suffix for UTC timestamps."""
        import container_worker

        mocker.patch.object(
            container_worker,
            "time",
            MagicMock(time=MagicMock(return_value=1704067200.0)),
        )

        result = container_worker.handle_warmup_message(
            {
                "type": "warmup",
                "until": "2024-01-01T02:00:00Z",
            }
        )

        assert result is True
        # 2024-01-01 02:00:00 UTC = 1704074400
        assert container_worker.keep_warm_until == 1704074400.0

    def test_warmup_extends_but_never_shortens(self, mocker):
        """Should only extend warmup period, never shorten it."""
        import container_worker

        mocker.patch.object(
            container_worker,
            "time",
            MagicMock(time=MagicMock(return_value=1704067200.0)),
        )

        # First warmup: 2 hours from now
        container_worker.handle_warmup_message(
            {
                "type": "warmup",
                "until": "2024-01-01T02:00:00Z",
            }
        )
        first_until = container_worker.keep_warm_until

        # Second warmup: 1 hour from now (earlier - should be ignored)
        container_worker.handle_warmup_message(
            {
                "type": "warmup",
                "until": "2024-01-01T01:00:00Z",
            }
        )

        assert container_worker.keep_warm_until == first_until

    def test_warmup_can_be_extended(self, mocker):
        """Should allow extending warmup to a later time."""
        import container_worker

        mocker.patch.object(
            container_worker,
            "time",
            MagicMock(time=MagicMock(return_value=1704067200.0)),
        )

        # First warmup: 1 hour from now
        container_worker.handle_warmup_message(
            {
                "type": "warmup",
                "until": "2024-01-01T01:00:00Z",
            }
        )

        # Second warmup: 3 hours from now (later - should extend)
        container_worker.handle_warmup_message(
            {
                "type": "warmup",
                "until": "2024-01-01T03:00:00Z",
            }
        )

        # 2024-01-01 03:00:00 UTC = 1704078000
        assert container_worker.keep_warm_until == 1704078000.0


class TestIsWarmupActive:
    """Tests for is_warmup_active function."""

    @pytest.fixture(autouse=True)
    def reset_warmup_state(self):
        """Reset warmup state before each test."""
        import container_worker

        container_worker.keep_warm_until = None
        yield
        container_worker.keep_warm_until = None

    def test_returns_false_when_no_warmup(self):
        """Should return False when warmup was never set."""
        import container_worker

        assert container_worker.is_warmup_active() is False

    def test_returns_true_during_warmup_period(self, mocker):
        """Should return True when current time is before warmup end."""
        import container_worker

        container_worker.keep_warm_until = 1704070800.0  # Future time
        mocker.patch.object(
            container_worker,
            "time",
            MagicMock(time=MagicMock(return_value=1704067200.0)),
        )

        assert container_worker.is_warmup_active() is True

    def test_returns_false_after_warmup_expires(self, mocker):
        """Should return False when warmup period has passed."""
        import container_worker

        container_worker.keep_warm_until = 1704067200.0  # Past time
        mocker.patch.object(
            container_worker,
            "time",
            MagicMock(time=MagicMock(return_value=1704070800.0)),
        )

        assert container_worker.is_warmup_active() is False


class TestSignalHandler:
    """Tests for signal_handler function."""

    @pytest.fixture(autouse=True)
    def reset_shutdown_state(self):
        """Reset shutdown state before each test."""
        import container_worker

        container_worker.shutdown_requested = False
        yield
        container_worker.shutdown_requested = False

    def test_sigterm_sets_shutdown_flag(self):
        """Should set shutdown_requested on SIGTERM."""
        import container_worker

        container_worker.signal_handler(signal.SIGTERM, None)

        assert container_worker.shutdown_requested is True

    def test_sigint_sets_shutdown_flag(self):
        """Should set shutdown_requested on SIGINT."""
        import container_worker

        container_worker.signal_handler(signal.SIGINT, None)

        assert container_worker.shutdown_requested is True


class TestSendCallbackFailure:
    """Tests for send_callback_failure function."""

    def test_sends_failure_to_lambda(self, mocker):
        """Should call Lambda with correct failure payload."""
        import container_worker

        mock_lambda = MagicMock()
        mocker.patch.object(container_worker, "lambda_client", mock_lambda)

        container_worker.send_callback_failure(
            callback_id="test-callback-123",
            error_type="TranscriptionError",
            error_message="Failed to transcribe audio",
        )

        mock_lambda.send_durable_execution_callback_failure.assert_called_once_with(
            CallbackId="test-callback-123",
            Error={
                "ErrorType": "TranscriptionError",
                "ErrorMessage": "Failed to transcribe audio",
            },
        )


class TestWaitForJobCompletion:
    """Tests for wait_for_job_completion function."""

    @pytest.fixture(autouse=True)
    def reset_job_state(self):
        """Reset job state before each test."""
        import container_worker

        container_worker.job_in_progress = False
        yield
        container_worker.job_in_progress = False

    def test_returns_immediately_when_no_job(self, mocker):
        """Should return immediately when no job is in progress."""
        import container_worker

        mock_time = MagicMock()
        mock_time.sleep = MagicMock()
        mocker.patch.object(container_worker, "time", mock_time)
        container_worker.job_in_progress = False

        container_worker.wait_for_job_completion()

        mock_time.sleep.assert_not_called()

    def test_waits_for_job_to_complete(self, mocker):
        """Should poll while job is in progress."""
        import container_worker

        # Simulate job completing after a few polls
        call_count = [0]

        def mock_time_func():
            call_count[0] += 1
            if call_count[0] > 3:
                container_worker.job_in_progress = False
            return call_count[0] * 0.1

        mock_time = MagicMock()
        mock_time.time.side_effect = mock_time_func
        mock_time.sleep = MagicMock()
        mocker.patch.object(container_worker, "time", mock_time)
        container_worker.job_in_progress = True

        container_worker.wait_for_job_completion()

        assert container_worker.job_in_progress is False

    def test_respects_grace_period(self, mocker):
        """Should stop waiting after grace period expires."""
        import container_worker

        # Simulate time passing beyond grace period
        times = iter([0, 0, 10])  # Start at 0, check at 0, then jump to 10 seconds
        mock_time = MagicMock()
        mock_time.time.side_effect = lambda: next(times)
        mock_time.sleep = MagicMock()
        mocker.patch.object(container_worker, "time", mock_time)
        container_worker.job_in_progress = True

        # Should exit due to grace period, not job completion
        container_worker.wait_for_job_completion()

        # Job still marked as in progress (forced shutdown)
        assert container_worker.job_in_progress is True


class TestMainLoop:
    """Tests for main() function - the SQS polling loop."""

    @pytest.fixture(autouse=True)
    def reset_worker_state(self):
        """Reset all worker state before each test."""
        import container_worker

        container_worker.shutdown_requested = False
        container_worker.job_in_progress = False
        container_worker.keep_warm_until = None
        yield
        container_worker.shutdown_requested = False
        container_worker.job_in_progress = False
        container_worker.keep_warm_until = None

    @pytest.fixture
    def mock_env(self, mocker):
        """Set required environment variables."""
        mocker.patch.dict("os.environ", {"QUEUE_URL": "https://sqs.test/queue"})

    @pytest.fixture
    def mock_sqs(self, mocker):
        """Provide a fresh mock SQS client."""
        import container_worker

        mock = MagicMock()
        mocker.patch.object(container_worker, "sqs", mock)
        return mock

    @pytest.fixture
    def mock_run_job(self, mocker):
        """Mock the run_job function."""
        import container_worker

        mock = MagicMock()
        mocker.patch.object(container_worker, "run_job", mock)
        return mock

    @pytest.fixture
    def mock_sys_exit(self, mocker):
        """Mock sys.exit to prevent test from exiting."""
        import container_worker

        return mocker.patch.object(container_worker.sys, "exit")

    @pytest.fixture
    def mock_signal(self, mocker):
        """Mock signal.signal to prevent actual signal registration."""
        import container_worker

        return mocker.patch.object(container_worker.signal, "signal")

    def test_exits_after_max_empty_polls(
        self, mocker, mock_env, mock_sqs, mock_sys_exit, mock_signal
    ):
        """Should exit after MAX_EMPTY_POLLS consecutive empty responses."""
        import container_worker

        # Return empty messages 3 times (MAX_EMPTY_POLLS)
        mock_sqs.receive_message.return_value = {"Messages": []}

        container_worker.main()

        assert mock_sqs.receive_message.call_count == 3
        mock_sys_exit.assert_called_once_with(0)

    def test_processes_job_message_successfully(
        self, mocker, mock_env, mock_sqs, mock_run_job, mock_sys_exit, mock_signal
    ):
        """Should process job message and delete from queue on success."""
        import container_worker

        job_body = {"input_key": "test.mp3", "callback_id": "cb-123"}
        mock_sqs.receive_message.side_effect = [
            {
                "Messages": [
                    {
                        "MessageId": "msg-1",
                        "ReceiptHandle": "receipt-1",
                        "Body": '{"input_key": "test.mp3", "callback_id": "cb-123"}',
                    }
                ]
            },
            {"Messages": []},
            {"Messages": []},
            {"Messages": []},
        ]

        # Mock time.time for elapsed calculation
        mock_time = MagicMock()
        mock_time.time.return_value = 1000.0
        mocker.patch.object(container_worker, "time", mock_time)

        container_worker.main()

        mock_run_job.assert_called_once_with(job_body)
        mock_sqs.delete_message.assert_called_once_with(
            QueueUrl="https://sqs.test/queue", ReceiptHandle="receipt-1"
        )

    def test_sends_failure_callback_on_job_error(
        self, mocker, mock_env, mock_sqs, mock_run_job, mock_sys_exit, mock_signal
    ):
        """Should send failure callback when job raises exception."""
        import container_worker

        mock_run_job.side_effect = ValueError("Transcription failed")
        mock_lambda = MagicMock()
        mocker.patch.object(container_worker, "lambda_client", mock_lambda)

        mock_sqs.receive_message.side_effect = [
            {
                "Messages": [
                    {
                        "MessageId": "msg-1",
                        "ReceiptHandle": "receipt-1",
                        "Body": '{"input_key": "test.mp3", "callback_id": "cb-123"}',
                    }
                ]
            },
            {"Messages": []},
            {"Messages": []},
            {"Messages": []},
        ]

        mock_time = MagicMock()
        mock_time.time.return_value = 1000.0
        mocker.patch.object(container_worker, "time", mock_time)

        container_worker.main()

        mock_lambda.send_durable_execution_callback_failure.assert_called_once()
        call_args = mock_lambda.send_durable_execution_callback_failure.call_args
        assert call_args[1]["CallbackId"] == "cb-123"
        assert call_args[1]["Error"]["ErrorType"] == "ValueError"

    def test_no_callback_on_job_error_without_callback_id(
        self, mocker, mock_env, mock_sqs, mock_run_job, mock_sys_exit, mock_signal
    ):
        """Should not send callback when job fails but has no callback_id."""
        import container_worker

        mock_run_job.side_effect = ValueError("Transcription failed")
        mock_lambda = MagicMock()
        mocker.patch.object(container_worker, "lambda_client", mock_lambda)

        mock_sqs.receive_message.side_effect = [
            {
                "Messages": [
                    {
                        "MessageId": "msg-1",
                        "ReceiptHandle": "receipt-1",
                        "Body": '{"input_key": "test.mp3"}',  # No callback_id
                    }
                ]
            },
            {"Messages": []},
            {"Messages": []},
            {"Messages": []},
        ]

        mock_time = MagicMock()
        mock_time.time.return_value = 1000.0
        mocker.patch.object(container_worker, "time", mock_time)

        container_worker.main()

        mock_lambda.send_durable_execution_callback_failure.assert_not_called()

    def test_processes_warmup_message(
        self, mocker, mock_env, mock_sqs, mock_run_job, mock_sys_exit, mock_signal
    ):
        """Should handle warmup message and delete it without running job."""
        import container_worker

        poll_count = [0]

        def receive_message_side_effect(**kwargs):
            poll_count[0] += 1
            if poll_count[0] == 1:
                return {
                    "Messages": [
                        {
                            "MessageId": "msg-1",
                            "ReceiptHandle": "receipt-1",
                            "Body": '{"type": "warmup"}',
                        }
                    ]
                }
            # After warmup message, trigger shutdown to exit cleanly
            if poll_count[0] >= 2:
                container_worker.shutdown_requested = True
            return {"Messages": []}

        mock_sqs.receive_message.side_effect = receive_message_side_effect

        mock_time = MagicMock()
        mock_time.time.return_value = 1000.0
        mocker.patch.object(container_worker, "time", mock_time)

        container_worker.main()

        # Warmup message should be deleted
        mock_sqs.delete_message.assert_called_once_with(
            QueueUrl="https://sqs.test/queue", ReceiptHandle="receipt-1"
        )
        # But run_job should not be called
        mock_run_job.assert_not_called()

    def test_warmup_prevents_auto_shutdown(
        self, mocker, mock_env, mock_sqs, mock_run_job, mock_sys_exit, mock_signal
    ):
        """Should stay alive during warmup even with empty polls."""
        import container_worker

        # Set warmup active
        container_worker.keep_warm_until = 9999999999.0  # Far future

        poll_count = [0]

        def receive_message_side_effect(**kwargs):
            poll_count[0] += 1
            # After 5 polls, trigger shutdown via signal
            if poll_count[0] >= 5:
                container_worker.shutdown_requested = True
            return {"Messages": []}

        mock_sqs.receive_message.side_effect = receive_message_side_effect

        mock_time = MagicMock()
        mock_time.time.return_value = 1000.0  # Before keep_warm_until
        mocker.patch.object(container_worker, "time", mock_time)

        container_worker.main()

        # Should have polled more than MAX_EMPTY_POLLS (3) times
        assert mock_sqs.receive_message.call_count >= 5

    def test_stops_processing_on_shutdown_signal(
        self, mocker, mock_env, mock_sqs, mock_run_job, mock_sys_exit, mock_signal
    ):
        """Should stop processing messages when shutdown is requested."""
        import container_worker

        call_count = [0]

        def run_job_side_effect(body):
            call_count[0] += 1
            # Trigger shutdown after first job
            container_worker.shutdown_requested = True

        mock_run_job.side_effect = run_job_side_effect

        mock_sqs.receive_message.return_value = {
            "Messages": [
                {
                    "MessageId": "msg-1",
                    "ReceiptHandle": "receipt-1",
                    "Body": '{"input_key": "test1.mp3"}',
                },
                {
                    "MessageId": "msg-2",
                    "ReceiptHandle": "receipt-2",
                    "Body": '{"input_key": "test2.mp3"}',
                },
            ]
        }

        # Time must increment so wait_for_job_completion exits after grace period
        time_values = iter([1000.0, 1000.0, 1000.0, 1010.0])  # Last value exceeds grace
        mock_time = MagicMock()
        mock_time.time.side_effect = lambda: next(time_values, 1010.0)
        mock_time.sleep = MagicMock()
        mocker.patch.object(container_worker, "time", mock_time)

        container_worker.main()

        # Only first job should be processed
        assert mock_run_job.call_count == 1

    def test_resets_empty_poll_counter_on_message(
        self, mocker, mock_env, mock_sqs, mock_run_job, mock_sys_exit, mock_signal
    ):
        """Should reset empty poll counter when messages are received."""
        import container_worker

        mock_sqs.receive_message.side_effect = [
            {"Messages": []},  # Empty poll 1
            {"Messages": []},  # Empty poll 2
            {
                "Messages": [
                    {
                        "MessageId": "msg-1",
                        "ReceiptHandle": "receipt-1",
                        "Body": '{"input_key": "test.mp3"}',
                    }
                ]
            },  # Message resets counter
            {"Messages": []},  # Empty poll 1 (reset)
            {"Messages": []},  # Empty poll 2
            {"Messages": []},  # Empty poll 3 -> shutdown
        ]

        mock_time = MagicMock()
        mock_time.time.return_value = 1000.0
        mocker.patch.object(container_worker, "time", mock_time)

        container_worker.main()

        # Should have 6 polls total (2 empty + 1 message + 3 empty)
        assert mock_sqs.receive_message.call_count == 6

    def test_handles_empty_message_body(
        self, mocker, mock_env, mock_sqs, mock_run_job, mock_sys_exit, mock_signal
    ):
        """Should handle message with no Body field."""
        import container_worker

        mock_sqs.receive_message.side_effect = [
            {
                "Messages": [
                    {
                        "MessageId": "msg-1",
                        "ReceiptHandle": "receipt-1",
                        # No "Body" field
                    }
                ]
            },
            {"Messages": []},
            {"Messages": []},
            {"Messages": []},
        ]

        mock_time = MagicMock()
        mock_time.time.return_value = 1000.0
        mocker.patch.object(container_worker, "time", mock_time)

        container_worker.main()

        # Should call run_job with empty dict
        mock_run_job.assert_called_once_with({})

    def test_sqs_receive_uses_correct_parameters(
        self, mocker, mock_env, mock_sqs, mock_sys_exit, mock_signal
    ):
        """Should call SQS with correct queue URL and parameters."""
        import container_worker

        mock_sqs.receive_message.return_value = {"Messages": []}

        container_worker.main()

        call_kwargs = mock_sqs.receive_message.call_args[1]
        assert call_kwargs["QueueUrl"] == "https://sqs.test/queue"
        assert call_kwargs["MaxNumberOfMessages"] == 10
        assert call_kwargs["WaitTimeSeconds"] == 1
        assert call_kwargs["VisibilityTimeout"] == container_worker.JOB_TIMEOUT_SECONDS
