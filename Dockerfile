# The Grapes Keeper app container: PHP + Apache. The database runs in its own
# MariaDB container (see docker-compose.yml); SQLite under /data is only a fallback.
FROM php:8.3-apache

# MySQL/MariaDB driver
RUN docker-php-ext-install pdo_mysql \
 && a2enmod rewrite headers \
 && printf '<Directory /var/www/html>\n  AllowOverride All\n</Directory>\nServerTokens Prod\nServerSignature Off\n' > /etc/apache2/conf-enabled/grapes.conf \
 && mkdir -p /data && chown www-data:www-data /data

COPY app/ /var/www/html/
# Cloudflare provides HTTPS in front, so drop the hosting-style HTTPS redirect.
# That also keeps plain http://nas-ip:8080 working on the pub's own network.
RUN sed -i '/^RewriteCond %{HTTPS}/,/^RewriteRule/d' /var/www/html/.htaccess \
 && rm -f /var/www/html/config.php /var/www/html/config.sample.php /var/www/html/README.md \
 && chown -R www-data:www-data /var/www/html

COPY docker-entrypoint.sh /usr/local/bin/grapes-entrypoint
RUN chmod +x /usr/local/bin/grapes-entrypoint

ENV GK_DB_DRIVER=sqlite \
    GK_SQLITE_PATH=/data/grapes-keeper.sqlite \
    TZ=Europe/London

VOLUME ["/data"]
EXPOSE 80
HEALTHCHECK --interval=60s --timeout=5s CMD php -r 'exit(@file_get_contents("http://127.0.0.1/icon.svg") ? 0 : 1);'
ENTRYPOINT ["grapes-entrypoint"]
CMD ["apache2-foreground"]
