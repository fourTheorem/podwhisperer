# Force x86_64 build - NVIDIA CUDA packages are not available for ARM64
FROM --platform=linux/amd64 nvidia/cuda:12.2.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install system deps: Python 3.12, ffmpeg, unzip (for cudnn extraction)
RUN apt-get update && \
    apt-get install -y software-properties-common curl tzdata ffmpeg unzip && \
    add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y python3.12 python3.12-dev python3.12-venv && \
    rm -rf /var/lib/apt/lists/*

RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.12 1 && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1

RUN curl -sS https://bootstrap.pypa.io/get-pip.py | python
RUN pip install --upgrade setuptools wheel

# Install Python deps with PyTorch cu121 index
COPY src/requirements.txt /app/
RUN pip install --no-cache-dir -r /app/requirements.txt \
    --index-url https://download.pytorch.org/whl/cu121 \
    --extra-index-url https://pypi.org/simple

# Extract cuDNN 8 for ctranslate2 compatibility (torch uses cuDNN 9)
RUN pip download nvidia_cudnn_cu11==8.9.6.50 -d /tmp && \
    unzip /tmp/nvidia_cudnn*.whl -d /tmp/cudnn8 && \
    mkdir -p /opt/cudnn8 && \
    cp /tmp/cudnn8/nvidia/cudnn/lib/*.so.8* /opt/cudnn8/ && \
    rm -rf /tmp/cudnn8 /tmp/nvidia_cudnn*.whl

# Set library paths for cuDNN 8 + 9 + cuBLAS coexistence
ENV LD_LIBRARY_PATH=/opt/cudnn8:/usr/local/lib/python3.12/dist-packages/nvidia/cudnn/lib:/usr/local/lib/python3.12/dist-packages/nvidia/cublas/lib:$LD_LIBRARY_PATH

# Build args
ARG MODEL_NAME=large-v2

# Expose model name as env var for runtime
ENV MODEL_NAME=${MODEL_NAME}

# Pre-download whisperx model (uses CPU here since no GPU at build time)
RUN python -c "import whisperx; whisperx.load_model('${MODEL_NAME}', 'cpu', compute_type='int8', language='en')"

# Pre-download pyannote diarization models using BuildKit secret
# The secret is only available during this RUN command and is NOT persisted in image layers
RUN --mount=type=secret,id=HF_TOKEN \
    python -c "token = open('/run/secrets/HF_TOKEN').read().strip(); from whisperx.diarize import DiarizationPipeline; DiarizationPipeline(use_auth_token=token, device='cpu')"

# Pre-download alignment model for English
RUN python -c "import whisperx; whisperx.load_align_model(language_code='en', device='cpu')"

WORKDIR /app
COPY src/ /app
ENV PYTHONPATH=/app

CMD ["python", "-m", "container_worker"]
