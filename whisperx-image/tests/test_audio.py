"""Tests for utils/audio.py - audio validation and conversion."""

import json
import subprocess

import pytest

from utils.audio import convert_to_wav, validate_audio_file


class TestValidateAudioFile:
    """Tests for validate_audio_file function."""

    def test_valid_audio_file(self, mocker):
        """Should return stream info for valid audio file."""
        mock_result = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps(
                {
                    "streams": [
                        {
                            "codec_type": "audio",
                            "codec_name": "mp3",
                            "sample_rate": "44100",
                        }
                    ]
                }
            ),
            stderr="",
        )
        mock_run = mocker.patch("subprocess.run", return_value=mock_result)

        result = validate_audio_file("/path/to/audio.mp3")

        assert result["codec_type"] == "audio"
        assert result["codec_name"] == "mp3"
        assert result["sample_rate"] == "44100"
        mock_run.assert_called_once()
        call_args = mock_run.call_args[0][0]
        assert "ffprobe" in call_args
        assert "/path/to/audio.mp3" in call_args

    def test_invalid_file_returns_error(self, mocker):
        """Should raise ValueError when ffprobe fails."""
        mock_result = subprocess.CompletedProcess(
            args=[],
            returncode=1,
            stdout="",
            stderr="Invalid data found when processing input",
        )
        mocker.patch("subprocess.run", return_value=mock_result)

        with pytest.raises(ValueError, match="not a valid audio file"):
            validate_audio_file("/path/to/invalid.txt")

    def test_file_without_audio_stream(self, mocker):
        """Should raise ValueError when file has no audio stream."""
        mock_result = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps({"streams": []}),
            stderr="",
        )
        mocker.patch("subprocess.run", return_value=mock_result)

        with pytest.raises(ValueError, match="does not contain an audio stream"):
            validate_audio_file("/path/to/video_only.mp4")

    def test_file_with_video_only_stream(self, mocker):
        """Should raise ValueError when codec_type is not audio."""
        mock_result = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps(
                {"streams": [{"codec_type": "video", "codec_name": "h264"}]}
            ),
            stderr="",
        )
        mocker.patch("subprocess.run", return_value=mock_result)

        with pytest.raises(ValueError, match="does not contain an audio stream"):
            validate_audio_file("/path/to/video.mp4")

    def test_ffprobe_command_structure(self, mocker):
        """Should call ffprobe with correct arguments."""
        mock_result = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps(
                {"streams": [{"codec_type": "audio", "codec_name": "aac"}]}
            ),
            stderr="",
        )
        mock_run = mocker.patch("subprocess.run", return_value=mock_result)

        validate_audio_file("/test/file.m4a")

        call_args = mock_run.call_args[0][0]
        assert call_args[0] == "ffprobe"
        assert "-v" in call_args
        assert "error" in call_args
        assert "-select_streams" in call_args
        assert "a:0" in call_args
        assert "-show_entries" in call_args
        assert "-of" in call_args
        assert "json" in call_args


class TestConvertToWav:
    """Tests for convert_to_wav function."""

    def test_successful_conversion(self, mocker):
        """Should complete without error on successful conversion."""
        mock_result = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout="",
            stderr="",
        )
        mock_run = mocker.patch("subprocess.run", return_value=mock_result)

        convert_to_wav("/input/audio.mp3", "/output/audio.wav")

        mock_run.assert_called_once()
        call_args = mock_run.call_args[0][0]
        assert "ffmpeg" in call_args
        assert "/input/audio.mp3" in call_args
        assert "/output/audio.wav" in call_args

    def test_conversion_failure(self, mocker):
        """Should raise RuntimeError when ffmpeg fails."""
        mock_result = subprocess.CompletedProcess(
            args=[],
            returncode=1,
            stdout="",
            stderr="Error opening input file",
        )
        mocker.patch("subprocess.run", return_value=mock_result)

        with pytest.raises(RuntimeError, match="FFmpeg conversion failed"):
            convert_to_wav("/input/missing.mp3", "/output/audio.wav")

    def test_ffmpeg_command_structure(self, mocker):
        """Should call ffmpeg with correct conversion parameters."""
        mock_result = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout="",
            stderr="",
        )
        mock_run = mocker.patch("subprocess.run", return_value=mock_result)

        convert_to_wav("/input/podcast.m4a", "/output/podcast.wav")

        call_args = mock_run.call_args[0][0]
        assert call_args[0] == "ffmpeg"
        assert "-y" in call_args  # overwrite
        assert "-i" in call_args
        assert "-ar" in call_args
        assert "16000" in call_args  # 16kHz sample rate
        assert "-ac" in call_args
        assert "1" in call_args  # mono
        assert "-c:a" in call_args
        assert "pcm_s16le" in call_args  # 16-bit PCM

    def test_capture_output_enabled(self, mocker):
        """Should capture output for error handling."""
        mock_result = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout="",
            stderr="",
        )
        mock_run = mocker.patch("subprocess.run", return_value=mock_result)

        convert_to_wav("/input/test.mp3", "/output/test.wav")

        assert mock_run.call_args[1]["capture_output"] is True
        assert mock_run.call_args[1]["text"] is True
