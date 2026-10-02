# Custom Discord app

The bold "Playing **\<name\>**" line is your Discord application's name, and
every image key the extension sends must exist as an art asset on that app.
Create your own:

1. <https://discord.com/developers/applications> → New Application → name it
   (e.g. **OMP** — that's what your friends see). Copy the **Application ID**
   (the client ID — a public value, not a secret).
2. Rich Presence → Art Assets: upload `omp_logo` (large) and small language
   icons `ts`, `js`, `python`, `rust`, `go`, `json`, `markdown`, `shell`,
   `lua`, `toml`, `yaml`. Missing keys simply render without that icon.
3. Provide the ID via env `OMP_DISCORD_CLIENT_ID=<id>` or config
   (`~/.omp/agent/discord-presence.json`, see README).

> The Discord client must be running. If it isn't, the extension stays silent
> and reconnects on the next activity — it never errors or blocks OMP.
