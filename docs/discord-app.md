# Custom Discord app

The bold "Playing **\<name\>**" line is your Discord application's name.
Every *uploaded* image key the extension sends must exist as an art asset on
that app — but the large animated pet is not an asset at all, it is an external
URL. Create your own:

1. <https://discord.com/developers/applications> → New Application → name it
   (e.g. **OMP** — that's what your friends see). Copy the **Application ID**
   (the client ID — a public value, not a secret).
2. Rich Presence → Art Assets: upload `omp_logo`
   ([`assets/omp_logo.png`](../assets/omp_logo.png), the official OMP mark from
   omp.sh) and the small language icons `ts`, `js`, `python`, `rust`, `go`,
   `json`, `markdown`, `shell`, `lua`, `toml`, `yaml`.

   **Do not upload the pet animation.** The portal only accepts PNG/JPEG/WebP and
   rejects animated images, so the large animated pet is sent as an *external
   URL* instead — Discord fetches it through its own media proxy, and those do
   support GIF. That needs no upload at all (see [Animated pet](#animated-pet)).
   Missing keys simply render without that icon.
3. Provide the ID via env `OMP_DISCORD_CLIENT_ID=<id>` or config
   (`~/.omp/agent/discord-presence.json`, see README).

## Animated pet

The portal caps uploads at 1024×1024 and rejects animation outright, so the
five pet GIFs are never uploaded. Instead `large_image` carries an absolute URL,
which Discord pulls through its own media proxy — and external URLs do support
GIF, animated WebP, and AVIF.

```json
{ "enabled": true, "clientId": "<application id>", "petBaseUrl": "<where the gifs live>" }
```

`petBaseUrl` is optional. It defaults to the published GIFs on this repo, and
each clip is appended as `<petBaseUrl>/<clip>.gif`:

| Clip | File | Plays when |
| --- | --- | --- |
| `idle` | `idle.gif` | waiting for you |
| `typing` | `typing.gif` | editing or writing a file |
| `reading` | `reading.gif` | reading a file |
| `busy` | `busy.gif` | searching, browsing, running a command, any other tool |
| `thinking` | `thinking.gif` | generating a response |

Point it at your own fork or any static host you control. Trailing slashes are
tolerated. The host must be publicly reachable, since Discord fetches the file
server-side — a private or local path will render a blank large image.

> The Discord client must be running. If it isn't, the extension stays silent
> and reconnects on the next activity — it never errors or blocks OMP.
