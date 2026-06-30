# bridge — JabRef Browser-Extension Fulltext bridge

A loopback HTTP companion that lets [JabRef][jabref]'s
`BrowserExtensionFulltextFetcher` reach this browser extension via the
[Browser-Extension Fulltext Protocol][spec] (`req~bxf.*~1`).

## Why

MV3 service workers cannot bind TCP ports. The protocol requires the
provider to host an HTTP endpoint on `127.0.0.1`. The bridge process owns
that port and forwards each request to the extension over native
messaging.

```
JabRef --HTTP--> jabext-experimental --native-messaging--> extension --> tab/PDF
```

## Naming

| Symbol | Value |
|---|---|
| Native-messaging host (registry / connectNative) | `jabext_experimental` |
| JabRef provider name (discovery file) | `jabext-experimental` |
| Bridge binary | `jabext-experimental[.exe]` |
| Firefox extension gecko id | `browser-extension-experimental@jabref` |
| Chromium extension id (pinned) | `kpbgmmnedoojkbcmienhgdgbplngnjho` |

The Chromium extension id is fixed by the `key` field in
`../manifest.json`. The matching private RSA key lives in
`chrome-key/private.pem` (gitignored). Hold onto it: the same key signs
the CRX uploaded to the Chrome Web Store so the published extension
keeps the same id, and the native-messaging manifest does not need to
change.

## Layout

| Path | Role |
|---|---|
| `JabExtBridge.java` | JBang single-file Java 25 program: HTTP server, NM dispatch, discovery-file lifecycle |
| `Json.java` | StringJoiner-based writers + json-tree readers |
| `build.sh` | Builds via `mise exec -- jbang export native ...` |
| `.mise.toml` | Pins GraalVM 25 + JBang |
| `install/install.sh` | Linux installer (Firefox + Chromium family) |
| `install/install.ps1` | Windows installer |
| `install/install.command` | macOS installer |
| `native-messaging/firefox.json.template` | NM manifest template, Firefox |
| `native-messaging/chromium.json.template` | NM manifest template, Chromium |
| `chrome-key/` | RSA keypair for the Chromium `key` pin (private key gitignored) |

## Building

```sh
make bridge-build         # native-image binary into bridge/build/jabext-experimental
make bridge-build-jvm     # JBang JVM jar (no GraalVM, fast iteration)
```

`bridge/build.sh` reads `.mise.toml` and lets `mise install` provision
GraalVM 25 + JBang on first run. No host JDK required.

## Installing

```sh
make bridge-install                  # auto-detects OS
# or manually:
./bridge/install/install.sh          # Linux
pwsh bridge/install/install.ps1      # Windows
sh bridge/install/install.command    # macOS
```

The installers write NM manifests for every supported browser and
register them under HKCU on Windows. No CLI flag is needed for the
Chromium id since it is pinned in source.

## Protocol mirror

The spec lives in [JabRef's `docs/requirements/browser-extension-fulltext.md`][spec].
Identifiers (`req~bxf.*~N`) are protocol-scoped, shared across every
provider implementation. The bridge satisfies the provider half of
`req~bxf.health~1`, `req~bxf.fetch~1`, `req~bxf.fetch-errors~1`,
`req~bxf.discovery-dir~1`, `req~bxf.discovery-schema~1`,
`req~bxf.loopback-bind~1`, `req~bxf.auth-bearer~1`, and
`req~bxf.origin-check~1`. The extension side
(`../fulltextBridge.js`) covers the browser-tab fetch loop.

`req~bxf.cancellation~1` is implemented per the spec's stated
fallback: `jdk.httpserver` cannot detect mid-request client disconnect,
so cancellation flows via the provider-side `FETCH_TIMEOUT` (5 min). The
spec explicitly permits this trade-off.

## Lifecycle

The extension starts the bridge by calling `runtime.connectNative` on
service-worker startup. The bridge inherits stdin/stdout from the
browser, binds an ephemeral 127.0.0.1 port, writes
`<JabRef-config>/fulltext-providers/jabext-experimental.json`, and serves
HTTP until stdin EOF. The shutdown hook deletes the discovery file.

[jabref]: https://github.com/JabRef/jabref
[spec]: https://github.com/JabRef/jabref/blob/main/docs/requirements/browser-extension-fulltext.md
