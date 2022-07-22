# Build Iridium
FROM node:current-buster

ARG DEBIAN_FRONTEND=noninteractive
ENV DEBUG libp2p*
ENV PNPM_HOME /root/.pnpm
ENV NODE_ENV development
ENV NODE_LOG_LEVEL warn

EXPOSE 9090
EXPOSE 15003
EXPOSE 8000
EXPOSE 8003

EXPOSE 4002
EXPOSE 4003

SHELL ["/bin/bash", "-c"]

# Install deps
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y \
    git build-essential curl \
    ca-certificates libc6-dev libssl-dev

# add pnpm to PATH
ENV PATH $PNPM_HOME:$PATH
RUN corepack enable

# Build Iridium
RUN mkdir -p /app
COPY src app/src
COPY .npmrc package.json pnpm-lock.yaml rollup.config.js /app/
COPY tsconfig.json tsconfig.browser.json /app/
COPY example /app/example
WORKDIR /app

RUN pnpm i
RUN pnpm build:node

# Setup relay server
RUN pnpm i -g libp2p-relay-server

WORKDIR /app

COPY ./docker/start.sh /app/

CMD [ "sh", "./start.sh" ]