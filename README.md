# The Grapes Keeper

A simple day-book for The Grapes, Bedlington. It covers:

- Daily takings, checked against the till Z-read
- Spending, wages and cash banked
- A running "cash that should be in the safe" figure
- A monthly summary with a VAT threshold watch
- A CSV export for the accountant

The app is plain PHP and keeps its data in a single SQLite file. It runs in Docker on the NAS and is reached from outside through a Cloudflare Tunnel.

## Run it on the NAS (Container Manager / Docker)

1. **Get the code onto the NAS.** Clone or copy this repo into a shared folder, e.g. `/volume1/docker/grapes`.
2. **Create the project.** In Container Manager → Project → Create:
   - Path: that folder
   - Source: "Use existing docker-compose.yml"
   - Click Build / Start.

   Or over SSH:
   ```sh
   cd /volume1/docker/grapes
   sudo docker compose up -d --build
   ```
3. **Check it on the pub's network.** Open `http://NAS-IP:8080`. The first visit asks you to choose the password.

The books live in `data/grapes-keeper.sqlite` next to the compose file. Include that folder in Hyper Backup.

### Cloudflare

You already run cloudflared? In Zero Trust → Networks → Tunnels → your tunnel → Public Hostname, add:

| Setting | Value |
|---|---|
| Subdomain / domain | e.g. `grapes.yourdomain.co.uk` |
| Service | `HTTP` → `NAS-IP:8080` |

No cloudflared yet? Create a tunnel in Zero Trust and copy its token into a `.env` file next to the compose file:

```
TUNNEL_TOKEN=eyJh...
```

Point the public hostname at `http://grapes-keeper:80`, then run:

```sh
sudo docker compose --profile tunnel up -d
```

In the Cloudflare dashboard, turn on SSL/TLS → Edge Certificates → **Always Use HTTPS**.

**Extra lock (optional):** a Cloudflare Access policy on the hostname with her email adds a one-time-code step before the app's own login. It's safer but one more thing for her to deal with. The app's password, with a 5-try lockout, is fine on its own.

### Updating

```sh
git pull
sudo docker compose up -d --build
```

The data folder is untouched by updates.

## Her phone

Open the Cloudflare address and log in once. It remembers the device for six months.

- **iPhone:** Share → *Add to Home Screen*
- **Android:** ⋮ → *Add to Home screen*

It then opens like an app.

## Her logo

Put the pub's logo in `app/` as `logo.png` and rebuild. It's used for the header, login screen and home-screen icon. `logo.jpg`, `logo.webp` and `logo.svg` also work.

## Good to know

- **One password** for everyone. Changing it under Setup logs out every other device.
- **Login protection:** 5 wrong tries locks logins for 10 minutes.
- **Forgotten password:** stop the container, then run:
  ```sh
  sqlite3 data/grapes-keeper.sqlite "DELETE FROM gk_settings WHERE k='password_hash'; DELETE FROM gk_tokens;"
  ```
  Start it again and the site asks for a new password. The books are kept.
- **Backups:** the Month tab's *Download everything* gives a CSV copy any time.
- **Money** is stored in pence to avoid rounding errors.
- **VAT:** off by default. The Month tab compares the last 12 months' takings with the £90,000 registration threshold until VAT is switched on under Setup.
- **Wages** only records what was paid. PAYE and payroll stay with whoever runs them now.

## Other hosting

The same `app/` folder runs on ordinary PHP hosting (e.g. 20i). Upload the contents of `app/`, copy `config.sample.php` to `config.php` and fill in MySQL details. The tables are created on first visit.

## Files

| Path | What it does |
|---|---|
| `app/index.php` | Password setup, login and logout, then serves the app |
| `app/api.php` | JSON load, save and delete (needs login) |
| `app/lib.php` | Database (SQLite or MySQL), table creation, login tokens |
| `app/app.html`, `app.css`, `app.js` | The app screens |
| `Dockerfile`, `docker-compose.yml` | NAS container, plus optional cloudflared |
