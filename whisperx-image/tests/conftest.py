"""Shared pytest fixtures for whisperx-worker tests."""

import pytest


@pytest.fixture
def reset_timing_state():
    """Reset the global timing collector state between tests."""
    from utils import timing

    timing._timing_collector = None
    yield
    timing._timing_collector = None


@pytest.fixture
def mock_subprocess(mocker):
    """Provide a mock for subprocess.run."""
    return mocker.patch("subprocess.run")
