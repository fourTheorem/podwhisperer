import json
import logging
import os
import shutil
import tempfile
from typing import TypedDict

import boto3
import torch
import whisperx

from utils import (
    convert_to_wav,
    log_timing,
    reset_timing_collector,
    validate_audio_file,
)
from utils.timing import StepTiming

# Config
MODEL_NAME = os.environ.get("MODEL_NAME", "large-v2")
BUCKET_NAME = os.environ["BUCKET_NAME"]
HF_TOKEN = os.environ["HF_TOKEN"]
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"
BATCH_SIZE = 16 if DEVICE == "cuda" else 4

# Parse runtime whisper config from environment
whisper_config_json = os.environ.get("WHISPER_CONFIG", "{}")
whisper_config = json.loads(whisper_config_json)
LANGUAGE = whisper_config.get("language", "en")
MIN_SPEAKERS = whisper_config.get("minSpeakers", 1)
MAX_SPEAKERS = whisper_config.get("maxSpeakers")  # None = auto-detect

# Global model instances (loaded once, reused across jobs)
whisper_model = None
align_models = {}  # keyed by language
diarize_pipeline = None

s3_client = boto3.client("s3")
lambda_client = boto3.client("lambda")
logger = logging.getLogger(__name__)


class JobResult(TypedDict):
    rawTranscriptKey: str
    stats: list[StepTiming]


def send_callback_success(callback_id: str, result: dict):
    """Send success callback to Lambda durable execution."""
    logger.info(f"Sending success callback for {callback_id}")
    lambda_client.send_durable_execution_callback_success(
        CallbackId=callback_id, Result=json.dumps(result).encode("utf-8")
    )
    logger.info(f"Success callback sent for {callback_id}")


def run_job(message: dict) -> JobResult:
    global whisper_model, align_models, diarize_pipeline

    logger.info("Running job for message: %s", message)

    # Reset timing collector for this job
    timing = reset_timing_collector()

    # Message contains only s3_key; config comes from environment
    s3_key = message["s3_key"]
    language = LANGUAGE
    min_speakers = MIN_SPEAKERS
    max_speakers = MAX_SPEAKERS

    # 1. Download audio from S3 to temp file
    temp_dir = tempfile.mkdtemp(prefix="whisperx_")
    local_path = os.path.join(temp_dir, "input_audio")

    try:
        with log_timing("download_s3", logger):
            s3_client.download_file(BUCKET_NAME, s3_key, local_path)

        # 2. Validate audio file
        with log_timing("validate_audio", logger):
            audio_info = validate_audio_file(local_path)
            logger.info(
                "Audio info: codec=%s, sample_rate=%s",
                audio_info.get("codec_name"),
                audio_info.get("sample_rate"),
            )

        # 3. Convert to WAV if needed (16kHz mono for Whisper)
        audio_path = local_path
        if audio_info.get("codec_name") != "pcm_s16le":
            wav_path = os.path.join(temp_dir, "audio.wav")
            with log_timing("convert_to_wav", logger):
                convert_to_wav(local_path, wav_path)
            audio_path = wav_path
        else:
            timing.record_skipped("convert_to_wav")

        # 4. Load whisper model (once)
        if whisper_model is None:
            with log_timing("load_whisper_model", logger):
                whisper_model = whisperx.load_model(
                    MODEL_NAME, DEVICE, compute_type=COMPUTE_TYPE, language=language
                )
        else:
            timing.record_skipped("load_whisper_model")

        # 5. Load audio
        with log_timing("load_audio", logger):
            audio = whisperx.load_audio(audio_path)

        # 6. Transcribe
        with log_timing("transcription", logger):
            result = whisper_model.transcribe(
                audio, batch_size=BATCH_SIZE, language=language
            )

        # 7. Load alignment model (once per language)
        if language not in align_models:
            with log_timing("load_align_model", logger):
                align_model, align_metadata = whisperx.load_align_model(
                    language_code=language, device=DEVICE
                )
                align_models[language] = (align_model, align_metadata)
        else:
            timing.record_skipped("load_align_model")
            align_model, align_metadata = align_models[language]

        # 8. Align
        with log_timing("alignment", logger):
            result = whisperx.align(
                result["segments"],
                align_model,
                align_metadata,
                audio,
                DEVICE,
                return_char_alignments=False,
            )

        # 9. Load diarization pipeline (once)
        if diarize_pipeline is None:
            with log_timing("load_diarize_model", logger):
                from whisperx.diarize import DiarizationPipeline

                diarize_pipeline = DiarizationPipeline(
                    use_auth_token=HF_TOKEN, device=DEVICE
                )
        else:
            timing.record_skipped("load_diarize_model")

        # 10. Diarize
        with log_timing("diarization", logger):
            diarize_segments = diarize_pipeline(
                audio, min_speakers=min_speakers, max_speakers=max_speakers
            )
            result = whisperx.assign_word_speakers(diarize_segments, result)

        # 11. Upload raw transcript to S3
        # Caption generation is now handled by the trigger lambda
        base_name = os.path.basename(s3_key).rsplit(".", 1)[0]
        raw_transcript_key = f"output/{base_name}_raw_transcript.json"

        with log_timing("upload_raw_transcript", logger):
            s3_client.put_object(
                Bucket=BUCKET_NAME,
                Key=raw_transcript_key,
                Body=json.dumps(result).encode("utf-8"),
            )

        logger.info(f"Successfully processed {s3_key} -> {raw_transcript_key}")

        callback_id = message.get("callback_id")
        job_result = JobResult(
            rawTranscriptKey=raw_transcript_key, stats=timing.get_stats()
        )

        if callback_id:
            send_callback_success(callback_id, job_result)

        return job_result

    finally:
        # 13. Cleanup temp files
        shutil.rmtree(temp_dir, ignore_errors=True)
