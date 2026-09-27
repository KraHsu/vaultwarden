# 密匣 · Personal Vue vault

A small personal password manager UI for Vaultwarden, built with Vue 3 and Vite.
The Catppuccin Latte/Mocha palette, serif typography and thin rules follow the
owner's blog and timetable. All fonts and assets are served locally.

## Included

- Invite-only account activation; password login; authenticator TOTP login.
- Login entries and secure notes: create, edit, search, favorite and copy.
- Recoverable trash and restore. No permanent-delete action in this UI.
- Cryptographically random 24-character password generation.
- Memory-only session and encryption keys; reload locks the vault. Idle timeout
  is five minutes; returning after a minute in the background also locks it.
- Light/dark themes and responsive layouts.
- Existing item keys, custom fields, attachments, TOTP, passkeys and other opaque
  metadata are preserved on supported-item edits. Unsupported or shared items
  must be managed through an official Bitwarden client. Re-prompt-protected
  items are not exposed through this UI.

## Cryptography and compatibility

The pinned GPL-licensed `@bitwarden/sdk-internal` WASM package supplies account
key protection, PBKDF2/Argon2, authenticated cipher encryption and secure random
generation. Authentication's legacy one-round PBKDF2 hash uses WebCrypto.
New accounts use PBKDF2-SHA256 with 600,000 rounds. New items have individual
random symmetric keys protected by the account key. Keys and tokens never go
into localStorage, sessionStorage or IndexedDB; only the theme preference is
persisted. The master password is never sent to the server.

This is a new, independently maintained frontend, not an official Bitwarden
product or a security-audited replacement for all official client features.
The internal SDK has no public API stability guarantee, so its exact version
is pinned and must be revalidated on upgrades. The backend remains the upstream
Vaultwarden image. Browser extensions and mobile apps connect to the same server.

Advanced account settings, imports/exports, attachment management, shared vaults,
passkey management and non-TOTP second factors are outside this personal UI's scope.
Use official clients where supported; the stock web vault is available in the
upstream image but is not mounted as the public frontend in this deployment.
Copying a password puts it in the operating system clipboard; locking the vault
does not promise to clear that clipboard.

## Development

```sh
npm ci
npm test
npm run build
```

`npm run dev` serves localhost and proxies API routes to localhost:8222.
The `dist` folder replaces the container's `/web-vault` directory via a read-only
bind mount. Vaultwarden's CSP is preserved, including its WASM execution permission.
No application or API response is cached by a service worker.

Tests include an independent Node implementation of Bitwarden's type-2 encrypted
string format, tamper detection, PBKDF2 hashes, Argon2 keys, preservation of existing
cipher metadata, actual browser-WASM initialization, and Vue interaction tests.
`tests/integration.mjs` is only for an isolated, disposable loopback server with
signups enabled. Set `VAULT_TEST_ORIGIN` and optionally `BW_TEST_CLI` to verify
official CLI interoperability. Never run it against the personal production vault.

Verified on 2026-09-27: 14 tests pass; Vaultwarden 1.37.3 passes registration,
login, encrypted CRUD, trash/restore and token refresh. Bitwarden CLI 2026.8.0
successfully logs into the test account, decrypts a Vue-created entry and edits
it back into a format this frontend can decrypt. CLI 2026.9.0 currently fails
against this backend release on a missing key-ID-backfill endpoint (HTTP 404).
That is an upstream version compatibility limit, not a recommendation to use an
old client indefinitely. Mobile and browser-extension builds have not been
individually tested. Browser rendering was not screenshot-verified in this session;
Vue DOM interaction and browser-WASM module tests were run locally.

Deployment and recovery: [../deploy/personal/README.md](../deploy/personal/README.md).
The frontend is AGPL-3.0-only; the upstream license remains unchanged. The bundled
font's license is included in `public/font-license.txt`.

## 归一统一登录

新增原生 Vaultwarden OIDC 登录入口，使用 S256 PKCE、随机 state 和发行者校验；授权响应为一次性消费，超时 10 分钟。临时 verifier/state 放在 sessionStorage，访问令牌、刷新令牌和用户密钥只在内存中。身份验证后仍需主密码在浏览器中解密，主密码不会发送给 IAM。原邮箱、主密码、TOTP 登录路径保留。已有独立二步验证的账号可使用该原密码路径或官方 Bitwarden 客户端；Vue SSO 路径尚未支持独立二步验证。

SSO 回调 `/sso-connector.html` 将短期授权参数移到 URL fragment 后返回 Vue。等待解锁的内存会话 5 分钟后清除。生产端需要明确配置 `SSO_*` 环境及自己的受信任 OIDC 提供方；客户端不包含任何服务端密钥。
