FROM node:current-buster

ARG DEBIAN_FRONTEND=noninteractive
ARG HOSTNAME=sync.satellite.dev
ARG EMAIL=support@satellite.im

ENV DEBUG libp2p*
ENV PNPM_HOME /root/.pnpm
ENV NODE_ENV development
ENV NODE_LOG_LEVEL warn

# add pnpm to PATH
ENV PATH $PNPM_HOME:$PATH

EXPOSE 4002
EXPOSE 4003
EXPOSE 4004

SHELL ["/bin/bash", "-c"]

# Install deps
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y \
    git build-essential curl \
    certbot python3-certbot-nginx \
    ca-certificates nodejs libc6-dev libssl-dev

RUN corepack enable

# Set up nginx reverse proxy
WORKDIR /etc/nginx/
COPY ./sync-node/nginx.remote.conf ./conf.d/remote.conf
COPY ./sync-node/nginx.local.conf ./conf.d/local.conf

# if local dev, generate SSL cert
COPY ./sync-node/setup-ssl.sh /root/setup-ssl.sh
RUN chmod +x /root/setup-ssl.sh
RUN /root/setup-ssl.sh

# Switch to the node user for installation
RUN mkdir -p /app/node_modules
RUN mkdir /app/dist/
RUN pnpm i -g libp2p-relay-server
WORKDIR /app
COPY .npmrc package.json pnpm-lock.yaml peerid.json rollup.config.js tsconfig.json tsconfig.browser.json /app/
RUN chown -R node:node /app/

# USER node
CMD ["bash"]