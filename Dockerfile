# Build Iridium
FROM node:current-buster

ARG DEBIAN_FRONTEND=noninteractive
ARG HOSTNAME=sync.satellite.dev
ARG EMAIL=support@satellite.im

ENV DEBUG libp2p*
ENV PNPM_HOME /root/.pnpm
ENV NODE_ENV development
ENV NODE_LOG_LEVEL warn

SHELL ["/bin/bash", "-c"]

# Install deps
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y \
    git build-essential curl \
    certbot python3-certbot-nginx \
    ca-certificates libc6-dev libssl-dev

EXPOSE 4002
EXPOSE 4003
EXPOSE 4004

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

# Set up nginx reverse proxy
WORKDIR /etc/nginx/
COPY ./sync-node/nginx.remote.conf ./conf.d/remote.conf
COPY ./sync-node/nginx.local.conf ./conf.d/local.conf

# if local dev, generate SSL cert
COPY ./sync-node/setup-ssl.sh /root/setup-ssl.sh
RUN chmod +x /root/setup-ssl.sh
RUN /root/setup-ssl.sh

# Setup relay server
RUN pnpm i -g libp2p-relay-server

WORKDIR /app

EXPOSE 8080
EXPOSE 443

COPY ./sync-node/start.sh /app/

CMD [ "sh", "./start.sh" ]