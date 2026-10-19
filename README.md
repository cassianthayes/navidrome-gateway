# navidrome-gateway

Send an audio file to your Telegram bot and it shows up in Navidrome.

## Setup

**1. Telegram:** create a bot with **@BotFather** (save the token) and get your user ID from **@userinfobot**.

**2. Server** (Debian, as root, from a copy of this repo):
```sh
apt install -y rclone
mkdir -p /opt/navidrome/music/telegram
chown --reference=/opt/navidrome/music /opt/navidrome/music/telegram
printf 'RCLONE_USER=telegram\nRCLONE_PASS=%s\n' "$(openssl rand -hex 24)" > /etc/navidrome-upload.env
chmod 600 /etc/navidrome-upload.env
cp server/navidrome-upload.service /etc/systemd/system/
systemctl enable --now navidrome-upload
cat /etc/navidrome-upload.env    # note the password
```
> If `/opt/navidrome/music` isn't owned by `navidrome` (`ls -ld /opt/navidrome/music`), change `User=`/`Group=` in the service file first.

**3. Caddy:** add this inside your Navidrome site block, then `systemctl reload caddy`:
```
handle_path /upload/* {
	reverse_proxy 127.0.0.1:8090
}
```

**4. Worker** (on your PC): set `ALLOWED_USER_ID` and `WEBDAV_URL` (`https://<your-navidrome-domain>/upload`) in `wrangler.jsonc`, then:
```sh
npm i
npx wrangler login
npx wrangler secret put BOT_TOKEN        # from step 1
npx wrangler secret put WEBHOOK_SECRET   # make up any random string
npx wrangler secret put WEBDAV_PASS      # password from step 2
npm run deploy                           # prints the worker URL
```

**5. Connect the bot:**
```sh
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" -d url=<WORKER_URL> -d secret_token=<WEBHOOK_SECRET>
```

**Done.** Send the bot an audio file and it replies `✅ Added: …`.

## If it doesn't work
- Bot is silent: run `npx wrangler tail` while sending a file.
- Bot replies with an error: check `sudo journalctl -u navidrome-upload` on the server.

Note: Telegram limits bot downloads to 20 MB per file.
