# This is the file that implements a flask server to do inferences. It"s the file that you will modify to
# implement the scoring for your own algorithm.

from __future__ import print_function

import os
import logging
import json
import tempfile
import flask
import boto3
import whisper

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = flask.Flask(__name__)

s3_client = boto3.client("s3")
default_model_name = "turbo"


@app.route("/ping", methods=["GET"])
def ping():
    logger.debug("PING")
    status = 200
    return flask.Response(response="\n", status=status, mimetype="application/json")


@app.route("/execution-parameters", methods=["GET"])
def execution_parameters():
    logger.debug("execution-parameters")
    status = 200
    return flask.Response(response="{}", status=status, mimetype="application/json")


@app.route("/invocations", methods=["POST"])
def transformation():
    """Do an inference on a single batch of data."""
    content_type = flask.request.content_type
    request_data = flask.request.data
    logger.info(f"transformation: {content_type} {request_data}")
    data = request_data.decode("utf-8")

    input_dict = None

    if flask.request.content_type == "application/json":
        input_dict = json.loads(data)
    else:
        return flask.Response(
            response="The predictor only supports application/json content type",
            status=415,
            mimetype="text/plain",
        )

    bucket_name = input_dict["bucket_name"]
    object_key = input_dict["object_key"]
    model_name = input_dict.get("model_name", default_model_name)
    fd, filename = tempfile.mkstemp()
    try:
        os.close(fd)
        logger.info(f"Downloading s3://{bucket_name}/{object_key} to {filename}")
        s3_client.download_file(bucket_name, object_key, filename)

        logger.info(f"Loading model {model_name}")
        model = whisper.load_model(model_name)
        logger.info(f"Transcribing {filename}")
        result = model.transcribe(filename)
        logger.info(f"Transcription of {filename} complete")
    finally:
        os.unlink(filename)

    payload = {**input_dict, "result": result}
    response = json.dumps(payload)
    return flask.Response(response=response, status=200, mimetype="application/json")
