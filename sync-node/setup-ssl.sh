if [[ -z $IS_LOCAL ]]; \
  then \
    mv /etc/nginx/conf.d/local.conf /etc/nginx/conf.d/default.conf; \
    rm /etc/nginx/conf.d/remote.conf \
    openssl req -x509 -out localhost.crt -keyout localhost.key \
      -newkey rsa:2048 -nodes -sha256 \
      -subj '/CN=localhost' -extensions EXT \
      -config $(printf "[dn]\nCN=localhost\n[req]\ndistinguished_name = dn\n[EXT]\nsubjectAltName=DNS:localhost\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth") \
  else \
    mv /etc/nginx/conf.d/remote.conf /etc/nginx/conf.d/default.conf; \
    rm /etc/nginx/conf.d/local.conf \
    certbot certonly --webroot -w /var/www/html -d ${HOSTNAME} -m ${EMAIL}; \
  fi

sed -i "s/{{HOSTNAME}}/${HOSTNAME}/g" /etc/nginx/conf.d/default.conf
sed -i "s/{{EMAIL}}/${EMAIL}/g" /etc/nginx/conf.d/default.conf
