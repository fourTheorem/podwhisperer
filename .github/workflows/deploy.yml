# Just gathering commands here that will eventually be used in the deployment workflow
#
#
aws cloudformation deploy --template ./template.yaml --stack-name whisper-image-repo --tags file://../common-tags.json  -
aws cloudformation deploy --template ./template.yaml --stack-name whisper-sagemaker --tags file://../common-tags.json  --capabilities CAPABILITY_NAMED_IAM
