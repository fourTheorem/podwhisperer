FROM public.ecr.aws/lambda/nodejs:16
RUN yum install git -y
COPY package*.json ./
COPY tsconfig.json .
RUN npm ci
COPY . ./
RUN npx tsc
CMD ["functions/pull-request/app.handleEvent"]