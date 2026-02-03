import contextlib
import time
from datetime import UTC, datetime
from logging import Logger
from typing import Literal, TypedDict

import psutil

ProcessingStep = Literal[
    "download_s3",
    "validate_audio",
    "convert_to_wav",
    "load_whisper_model",
    "load_audio",
    "transcription",
    "load_align_model",
    "alignment",
    "load_diarize_model",
    "diarization",
    "caption_conversion",
    "upload_raw_transcript",
    "upload_clean_captions",
]

StepStatus = Literal["success", "error", "skipped"]


class StepTiming(TypedDict):
    step: ProcessingStep
    status: StepStatus
    duration_ms: int
    start_time: str  # ISO 8601
    end_time: str  # ISO 8601


class TimingCollector:
    def __init__(self):
        self.timings: list[StepTiming] = []

    def record(
        self,
        step: ProcessingStep,
        status: StepStatus,
        start_time: float,
        end_time: float,
    ):
        self.timings.append(
            StepTiming(
                step=step,
                status=status,
                duration_ms=int((end_time - start_time) * 1000),
                start_time=datetime.fromtimestamp(start_time, tz=UTC).isoformat(),
                end_time=datetime.fromtimestamp(end_time, tz=UTC).isoformat(),
            )
        )

    def record_skipped(self, step: ProcessingStep):
        now = datetime.now(tz=UTC).isoformat()
        self.timings.append(
            StepTiming(
                step=step,
                status="skipped",
                duration_ms=0,
                start_time=now,
                end_time=now,
            )
        )

    def get_stats(self) -> list[StepTiming]:
        return self.timings.copy()


# Global collector instance
_timing_collector: TimingCollector | None = None


def reset_timing_collector() -> TimingCollector:
    """Reset and return a new timing collector for a new job."""
    global _timing_collector
    _timing_collector = TimingCollector()
    return _timing_collector


def get_timing_collector() -> TimingCollector:
    """Get the current timing collector, creating one if needed."""
    global _timing_collector
    if _timing_collector is None:
        _timing_collector = TimingCollector()
    return _timing_collector


def sizeof_fmt(num, suffix="B"):
    for unit in ("", "Ki", "Mi", "Gi", "Ti", "Pi", "Ei", "Zi"):
        if abs(num) < 1024.0:
            return f"{num:3.1f}{unit}{suffix}"
        num /= 1024.0
    return f"{num:.1f}Yi{suffix}"


@contextlib.contextmanager
def log_timing(step: ProcessingStep, logger: Logger):
    start_time = time.time()
    process = psutil.Process()
    mem = sizeof_fmt(process.memory_info().rss)
    logger.info(f"[START] {step} [Memory Usage: {mem}]")
    status: StepStatus = "success"
    try:
        yield
    except Exception:
        status = "error"
        raise
    finally:
        end_time = time.time()
        execution_time_seconds = end_time - start_time
        mem = sizeof_fmt(process.memory_info().rss)
        logger.info(
            f"[END] {step} - took {execution_time_seconds:.4f} secs [Memory Usage: {mem}]"
        )
        get_timing_collector().record(step, status, start_time, end_time)
