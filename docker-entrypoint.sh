#!/bin/sh
# Make sure Apache can write the database, whatever owner the NAS gave the folder.
mkdir -p /data
chown -R www-data:www-data /data 2>/dev/null || true
exec docker-php-entrypoint "$@"
