# The Grapes Keeper

A simple day-book for The Grapes, Bedlington. It covers:

- Daily takings, checked against the till Z-read
- Spending, wages and cash banked
- A running "cash that should be in the safe" figure
- A monthly summary with a VAT threshold watch
- A CSV export for the accountant

Everything runs in Docker on the NAS, and she reaches it from outside through a Cloudflare Tunnel.

| Container | What it is |
|---|---|
| `grapes-keeper` | The app (PHP 8.3 + Apache) |
| `grapes-keeper-db` | MariaDB 11.4, holding the books |
| `grapes-keeper-backup` | Dumps the database daily to `data/backups/`, keeps 30 days |
| `grapes-keeper-tunnel` | Optional cloudflared, if you don't already run one |

## Install on the NAS

1. **Get the code onto the NAS.** The repo is private, so either:
   - clone it over SSH using a GitHub personal access token or a deploy key:
     ```sh
     git clone https://github.com/andrewdunn358-dev/grapes.git /volume1/docker/grapes
     ```
   - or download the ZIP from GitHub and unpack it into `/volume1/docker/grapes` with File Station.
2. **Set the database passwords.** In that folder, copy `.env.example` to `.env` and set `DB_PASSWORD` and `DB_ROOT_PASSWORD` to long random strings. Nobody types these. `.env` is git-ignored.
3. **Start the stack.** Either:
   - Container Manager → Project → Create, point it at the folder, choose "Use existing docker-compose.yml", then Build, or
   - over SSH:
     ```sh
     cd /volume1/docker/grapes
     sudo docker compose up -d --build
     ```
4. **Set her password.** Open `http://NAS-IP:1358` and choose the password she'll log in with.

### Cloudflare

You already run cloudflared? In Zero Trust → Networks → Tunnels → your tunnel → Public Hostname, add:

| Setting | Value |
|---|---|
| Hostname | e.g. `grapes.yourdomain.co.uk` |
| Service | `HTTP` → `NAS-IP:1358` |

No cloudflared yet? Create a tunnel, put its token in `.env` as `TUNNEL_TOKEN=...`, set the public hostname's service to `http://app:80`, then run:

```sh
sudo docker compose --profile tunnel up -d
```

In the Cloudflare dashboard, turn on SSL/TLS → Edge Certificates → **Always Use HTTPS**.

**Extra lock (optional):** a Cloudflare Access policy with her email adds an emailed code before the app's own login. The app's password, with a 5-try lockout, is fine on its own.

## Her phone

Open the Cloudflare address and log in once. It remembers the device for six months.

- **iPhone:** Share → *Add to Home Screen*
- **Android:** ⋮ → *Add to Home screen*

It then opens like an app.

## Her logo

Put the pub's logo in `app/` as `logo.png`, then run `sudo docker compose up -d --build`. It's used for the header, login screen and home-screen icon. `.jpg`, `.webp` and `.svg` also work.

## Updating

```sh
git pull
sudo docker compose up -d --build
```

The database lives in `data/mariadb/` and isn't touched by updates.

## Backups and restore

**Daily dumps** go to `data/backups/grapes-YYYY-MM-DD.sql.gz`. Add `data/backups` to Hyper Backup. Back up the dumps, not `data/mariadb`, because live database files can't be copied safely while running.

**Restore a dump:**

```sh
zcat data/backups/grapes-2026-10-04.sql.gz | sudo docker exec -i grapes-keeper-db \
  sh -c 'mariadb -u grapes -p"$MARIADB_PASSWORD" grapes'
```

**Forgotten app password:** this resets the password and keeps the books.

```sh
sudo docker exec grapes-keeper-db sh -c \
  "mariadb -u grapes -p\"\$MARIADB_PASSWORD\" grapes -e \"DELETE FROM gk_settings WHERE k='password_hash'; DELETE FROM gk_tokens;\""
```

Visit the site and it asks for a new password.

**Spare copy:** the Month tab's *Download everything* gives a CSV any time.

## Good to know

- **One app password** for everyone. Changing it under Setup logs out every other device.
- **Login protection:** 5 wrong tries locks logins for 10 minutes.
- **Money** is stored in pence to avoid rounding errors.
- **VAT:** off by default. The Month tab compares the last 12 months' takings with the £90,000 registration threshold until VAT is switched on under Setup.
- **Wages** only records what was paid. PAYE and payroll stay with whoever runs them now.
- **Database ports:** MariaDB isn't exposed outside Docker. Only the app talks to it.

## Files

| Path | What it does |
|---|---|
| `app/index.php` | Password setup, login and logout, then serves the app |
| `app/api.php` | JSON load, save and delete (needs login) |
| `app/lib.php` | Database connection, table creation (automatic), login tokens |
| `app/app.html`, `app.css`, `app.js` | The app screens |
| `Dockerfile`, `docker-entrypoint.sh` | App container |
| `docker-compose.yml`, `.env.example` | The full stack |
