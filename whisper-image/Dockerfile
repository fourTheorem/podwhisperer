ARG TARGETPLATFORM=linux/amd64
ARG TARGETARCH=amd64
FROM nvidia/cuda:12.2.2-base-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

RUN apt-get -qq update && apt-get install -qq --no-install-recommends \
         wget \
         python3-pip \
         python3-setuptools \
         nginx \
         ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set some environment variables. PYTHONUNBUFFERED keeps Python from buffering our standard
# output stream, which means that logs can be delivered to the user quickly. PYTHONDONTWRITEBYTECODE
# keeps Python from writing the .pyc files which are unnecessary in this case. We also update
# PATH so that the train and serve programs are found when the container is invoked.
ENV PYTHONUNBUFFERED=TRUE
ENV PYTHONDONTWRITEBYTECODE=TRUE
ENV PATH="/app:${PATH}"
RUN mkdir /app
WORKDIR /app
COPY requirements.txt /app
RUN pip3 install --no-cache-dir -r requirements.txt
COPY app /app
