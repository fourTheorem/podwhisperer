"""Tests for utils/timing.py - timing collection and logging."""

import logging
from unittest.mock import MagicMock

import pytest
from freezegun import freeze_time

from utils.timing import (
    TimingCollector,
    get_timing_collector,
    log_timing,
    reset_timing_collector,
    sizeof_fmt,
)


class TestTimingCollector:
    """Tests for TimingCollector class."""

    def test_record_step_timing(self):
        """Should record step timing with correct fields."""
        collector = TimingCollector()

        collector.record(
            step="transcription",
            status="success",
            start_time=1704067200.0,  # 2024-01-01 00:00:00 UTC
            end_time=1704067205.5,  # 5.5 seconds later
        )

        timings = collector.get_stats()
        assert len(timings) == 1
        assert timings[0]["step"] == "transcription"
        assert timings[0]["status"] == "success"
        assert timings[0]["duration_ms"] == 5500
        assert "2024-01-01" in timings[0]["start_time"]
        assert "2024-01-01" in timings[0]["end_time"]

    def test_record_multiple_steps(self):
        """Should record multiple steps in order."""
        collector = TimingCollector()

        collector.record("download_s3", "success", 1704067200.0, 1704067202.0)
        collector.record("transcription", "success", 1704067202.0, 1704067300.0)
        collector.record("upload_raw_transcript", "error", 1704067300.0, 1704067301.0)

        timings = collector.get_stats()
        assert len(timings) == 3
        assert timings[0]["step"] == "download_s3"
        assert timings[1]["step"] == "transcription"
        assert timings[2]["step"] == "upload_raw_transcript"
        assert timings[2]["status"] == "error"

    def test_record_skipped_step(self):
        """Should record skipped steps with zero duration."""
        collector = TimingCollector()

        with freeze_time("2024-01-01 12:00:00"):
            collector.record_skipped("alignment")

        timings = collector.get_stats()
        assert len(timings) == 1
        assert timings[0]["step"] == "alignment"
        assert timings[0]["status"] == "skipped"
        assert timings[0]["duration_ms"] == 0
        assert timings[0]["start_time"] == timings[0]["end_time"]

    def test_get_stats_returns_copy(self):
        """Should return a copy of timings, not the original list."""
        collector = TimingCollector()
        collector.record("transcription", "success", 1704067200.0, 1704067210.0)

        stats1 = collector.get_stats()
        stats2 = collector.get_stats()

        assert stats1 is not stats2
        assert stats1 == stats2


class TestGlobalCollector:
    """Tests for global timing collector functions."""

    def test_reset_creates_new_collector(self, reset_timing_state):
        """reset_timing_collector should create fresh collector."""
        collector1 = reset_timing_collector()
        collector1.record("transcription", "success", 1704067200.0, 1704067210.0)

        collector2 = reset_timing_collector()

        assert collector2.get_stats() == []
        assert collector1 is not collector2

    def test_get_creates_collector_if_none(self, reset_timing_state):
        """get_timing_collector should create collector if none exists."""
        collector = get_timing_collector()

        assert collector is not None
        assert isinstance(collector, TimingCollector)

    def test_get_returns_same_collector(self, reset_timing_state):
        """get_timing_collector should return same instance on multiple calls."""
        collector1 = get_timing_collector()
        collector2 = get_timing_collector()

        assert collector1 is collector2


class TestSizeofFmt:
    """Tests for sizeof_fmt function."""

    def test_bytes(self):
        """Should format bytes correctly."""
        assert sizeof_fmt(500) == "500.0B"
        assert sizeof_fmt(0) == "0.0B"

    def test_kibibytes(self):
        """Should format KiB correctly."""
        assert sizeof_fmt(1024) == "1.0KiB"
        assert sizeof_fmt(1536) == "1.5KiB"

    def test_mebibytes(self):
        """Should format MiB correctly."""
        assert sizeof_fmt(1024 * 1024) == "1.0MiB"
        assert sizeof_fmt(1024 * 1024 * 2.5) == "2.5MiB"

    def test_gibibytes(self):
        """Should format GiB correctly."""
        assert sizeof_fmt(1024**3) == "1.0GiB"
        assert sizeof_fmt(1024**3 * 8) == "8.0GiB"

    def test_negative_values(self):
        """Should handle negative values."""
        result = sizeof_fmt(-1024)
        assert "KiB" in result


class TestLogTiming:
    """Tests for log_timing context manager."""

    def test_logs_start_and_end(self, mocker, reset_timing_state):
        """Should log start and end messages."""
        mock_logger = MagicMock(spec=logging.Logger)
        mock_process = MagicMock()
        mock_process.memory_info.return_value.rss = 1024 * 1024 * 100  # 100 MiB
        mocker.patch("psutil.Process", return_value=mock_process)
        mocker.patch("time.time", side_effect=[1000.0, 1005.0])

        reset_timing_collector()

        with log_timing("transcription", mock_logger):
            pass

        assert mock_logger.info.call_count == 2
        start_call = mock_logger.info.call_args_list[0][0][0]
        end_call = mock_logger.info.call_args_list[1][0][0]
        assert "[START]" in start_call
        assert "transcription" in start_call
        assert "[END]" in end_call
        assert "transcription" in end_call

    def test_records_timing_on_success(self, mocker, reset_timing_state):
        """Should record timing with success status."""
        mock_logger = MagicMock(spec=logging.Logger)
        mock_process = MagicMock()
        mock_process.memory_info.return_value.rss = 1024 * 1024
        mocker.patch("psutil.Process", return_value=mock_process)
        mocker.patch("time.time", side_effect=[1000.0, 1002.5])

        collector = reset_timing_collector()

        with log_timing("download_s3", mock_logger):
            pass

        timings = collector.get_stats()
        assert len(timings) == 1
        assert timings[0]["step"] == "download_s3"
        assert timings[0]["status"] == "success"
        assert timings[0]["duration_ms"] == 2500

    def test_records_timing_on_error(self, mocker, reset_timing_state):
        """Should record timing with error status on exception."""
        mock_logger = MagicMock(spec=logging.Logger)
        mock_process = MagicMock()
        mock_process.memory_info.return_value.rss = 1024 * 1024
        mocker.patch("psutil.Process", return_value=mock_process)
        mocker.patch("time.time", side_effect=[1000.0, 1001.0])

        collector = reset_timing_collector()

        with pytest.raises(ValueError), log_timing("transcription", mock_logger):
            raise ValueError("Test error")

        timings = collector.get_stats()
        assert len(timings) == 1
        assert timings[0]["step"] == "transcription"
        assert timings[0]["status"] == "error"

    def test_includes_memory_usage(self, mocker, reset_timing_state):
        """Should include memory usage in log messages."""
        mock_logger = MagicMock(spec=logging.Logger)
        mock_process = MagicMock()
        mock_process.memory_info.return_value.rss = 1024 * 1024 * 512  # 512 MiB
        mocker.patch("psutil.Process", return_value=mock_process)
        mocker.patch("time.time", side_effect=[1000.0, 1005.0])

        reset_timing_collector()

        with log_timing("load_whisper_model", mock_logger):
            pass

        log_calls = [call[0][0] for call in mock_logger.info.call_args_list]
        assert any("Memory Usage" in call for call in log_calls)
        assert any("MiB" in call for call in log_calls)
