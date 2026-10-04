# The Grapes Keeper

A simple day-book for The Grapes, Bedlington. It covers daily takings (checked against the till Z-read), spending, wages, cash banked, a monthly summary, and a CSV export for the accountant.

Plain PHP 8 + MySQL, so it runs on 20i shared hosting with no build step, Composer or Node.

## Put it on 20i

1. **Make the database.** In the 20i control panel, go to Hosting → Manage → MySQL Databases. Create a database and user, and note the database name, user, password and host.
2. **Upload the files.** Put everything in this folder into `public_html`, or a subfolder or subdomain such as `keeper.yourdomain`, using File Manager, FTP or 20i's Git deploy.
3. **Add the config.** Copy `config.sample.php` to `config.php` and fill in the four database details. `config.php` is git-ignored, so passwords never go into the repo.
4. **Turn on SSL** for the domain in 20i. `.htaccess` forces HTTPS.
5. **Visit the site.** The first visit creates the tables automatically and asks you to choose the password. Give her that password.

## Her logo

Drop the pub's logo into this folder as `logo.png`. It's picked up automatically for the header, login screen, browser tab and phone home-screen icon. `logo.jpg`, `logo.webp` and `logo.svg` also work. Until then a bunch of grapes is shown.

## On her phone

Open the site and log in once. It remembers the device for six months.

- **iPhone:** Share → *Add to Home Screen*
- **Android:** ⋮ → *Add to Home screen*

It then opens like an app.

## Good to know

- **One password** for everyone. Changing it under Setup logs out every other device.
- **Login protection:** 5 wrong tries locks logins for 10 minutes.
- **Backups:** the data lives in MySQL, so 20i's database backups cover it. The Month tab's *Download everything* gives a CSV copy too.
- **Money** is stored in pence to avoid rounding errors.
- **VAT:** off by default. Until it's switched on under Setup, the Month tab shows a rolling 12-month turnover against the £90,000 registration threshold.
- **Wages** only records what was paid. PAYE and payroll stay with whoever runs them now.

## Files

| File | What it does |
|---|---|
| `index.php` | First-run password setup, login and logout, then serves the app |
| `api.php` | JSON load, save and delete (needs login) |
| `lib.php` | Database connection, table creation, login tokens |
| `app.html` / `app.css` / `app.js` | The app itself |
| `manifest.php`, `icon.svg` | Home-screen app icon |
| `.htaccess` | HTTPS, blocks direct access to config and helpers |

## Testing locally

Use `config.php` with `['driver' => 'sqlite', 'sqlite_path' => '/tmp/gk.sqlite']` and run `php -S localhost:8000`.
