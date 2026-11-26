# Contributing

Bug fixes and new free features are welcome.

Features listed in PRO.md are reserved for the Pro edition, so pull requests that add them will be closed with a pointer to PRO.md.

## Before you open a pull request

- Run `npm test`. It needs no install and no network, and it should pass on Node 22 or newer.
- If you touched the Worker, storage or SQL, also run `npm install` and `npm run test:workerd`, which runs the Worker inside workerd (Cloudflare's runtime) with a local D1 database.
- Add a test for the bug you fixed or the feature you added.

## Ground rules

- The Worker has no runtime dependencies. Please keep it that way.
- No telemetry, analytics or calls home of any kind. A catalog holds people's notes; it only talks to its own database.
- Sample data stays made up. Don't add real names, companies, addresses or contact details.
- Card numbers never change once given out. Changes that renumber, reuse or reorder existing cards won't be merged.

## Reporting a bug

Open an issue with what you did, what you expected and what happened. Leave your token and any real card text out of it.
