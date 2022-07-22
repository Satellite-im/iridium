FROM jonasal/nginx-certbot:latest
COPY conf.d/* /etc/nginx/conf.d/

ARG SYNC_PREFIX
ARG RELAY_PREFIX
ARG HOSTNAME

RUN if [ -z "$SYNC_PREFIX" ] ; then echo SYNC_PREFIX not provided ; else  echo SYNC_PREFIX=${SYNC_PREFIX}; sed -i "s/{{SYNC_PREFIX}}/${SYNC_PREFIX}./g" /etc/nginx/conf.d/sync.conf; fi
RUN sed -i "s/{{HOSTNAME}}/${HOSTNAME}/g" /etc/nginx/conf.d/sync.conf;

RUN if [ -z "$RELAY_PREFIX" ] ; then echo RELAY_PREFIX not provided ; else  echo RELAY_PREFIX=${RELAY_PREFIX}; sed -i "s/{{RELAY_PREFIX}}/${RELAY_PREFIX}./g" /etc/nginx/conf.d/relay.conf; fi
RUN sed -i "s/{{HOSTNAME}}/${HOSTNAME}/g" /etc/nginx/conf.d/relay.conf;

CMD [ "/scripts/start_nginx_certbot.sh"]