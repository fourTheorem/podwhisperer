import json
import subprocess


def validate_audio_file(file_path: str) -> dict:
    """
    Validate file is audio using ffprobe.
    Returns dict with 'codec_type', 'codec_name', 'sample_rate', etc.
    Raises ValueError if not a valid audio file.
    """
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_type,codec_name,sample_rate",
        "-of",
        "json",
        file_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise ValueError(f"File is not a valid audio file: {result.stderr}")

    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    if not streams or streams[0].get("codec_type") != "audio":
        raise ValueError("File does not contain an audio stream")

    return streams[0]


def convert_to_wav(input_path: str, output_path: str) -> None:
    """
    Convert audio file to 16kHz mono WAV format using ffmpeg.
    """
    cmd = [
        "ffmpeg",
        "-y",  # overwrite output
        "-i",
        input_path,
        "-ar",
        "16000",  # 16kHz sample rate (Whisper optimal)
        "-ac",
        "1",  # mono
        "-c:a",
        "pcm_s16le",  # 16-bit PCM
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg conversion failed: {result.stderr}")
