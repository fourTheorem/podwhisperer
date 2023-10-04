from __future__ import print_function
from utils import extract_audio_from_mp4
from rag import TextIndexer, LanguageModel, QueryProcessor

import os
import logging
import json
import tempfile
import flask
import boto3
import whisper
from flask import Flask, request, jsonify

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

#  load
data_directory = '../data'
index_directory = '../data_index'

text_indexer = TextIndexer(data_directory, index_directory)
index = text_indexer.build_index()

language_model = LanguageModel("gpt-3.5-turbo")
query_processor = QueryProcessor(index)

s3_client = boto3.client("s3")
model_name = "medium.en"

app = flask.Flask(__name__)

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
    """Do an inference on a single batch of data. 
    """
    content_type = flask.request.content_type
    request_data = flask.request.data
    logger.info(f"transformation: {content_type} {request_data}")
    data = request_data.decode("utf-8")

    input_dict = None

    if flask.request.content_type == "application/json":
        input_dict = json.loads(data)
    else:
        return flask.Response(
            response="The predictor only supports application/json content type", status=415, mimetype="text/plain"
        )

    bucket_name = input_dict["bucket_name"]
    object_key = input_dict["object_key"]
    fd, filename = tempfile.mkstemp()
    try:
        os.close(fd)
        logger.info(f"Downloading s3://{bucket_name}/{object_key} to {filename}")
        s3_client.download_file(bucket_name, object_key, filename)

        if filename.split('.')[-1] == 'mp4': # convert to audio file
            audio_file_path = extract_audio_from_mp4(filename)
            filename = audio_file_path

        logger.info(f"Loading model {model_name}")
        model = whisper.load_model(model_name)
        logger.info(f"Transcribing {filename}")
        result = model.transcribe(filename)
        logger.info(f"Transcription of {filename} complete")
    finally:
        os.unlink(filename)

    payload = {
        **input_dict,
        "result": result
    }
    response = json.dumps(payload)
    return flask.Response(response=response, status=200, mimetype="application/json")


@app.route("/predict", methods=["POST"])
def predict():
    """Do an inference on a single batch of data. 
    """
    content_type = flask.request.content_type
    request_data = flask.request.data
    logger.info(f"transformation: {content_type} {request_data}")
    data = request_data.decode("utf-8")

    input_dict = None

    if flask.request.content_type == "application/json":
        input_dict = json.loads(data)
    else:
        return flask.Response(
            response="The predictor only supports application/json content type", status=415, mimetype="text/plain"
        )

    try:
        filename = '~/Users/berke/VscodeProjects/podwhisperer/sample-audio/sample2.mp3'
        filename = '../../sample-audio/sample2.mp3'
        filename = 'sample2.mp3'
        if filename.split('.')[-1] == 'mp4': # convert to audio file
            audio_file_path = extract_audio_from_mp4(filename)
            filename = audio_file_path

        logger.info(f"Loading model {model_name}")
        model = whisper.load_model(model_name)
        logger.info(f"Transcribing {filename}")
        result = model.transcribe(filename)
        logger.info(f"Transcription of {filename} complete")
    finally:
        os.unlink(filename)

    payload = {
        **input_dict,
        "result": result
    }
    response = json.dumps(payload)
    return flask.Response(response=response, status=200, mimetype="application/json")



@app.route("/ask", methods=["GET"])
def ask_question():
    question = request.args.get("question")
    filename = request.args.get("filename")

    if not question:
        return jsonify({"error": "Question parameter is required"}), 400

    response = query_processor.query(question)

    return jsonify({"response": response.response})
