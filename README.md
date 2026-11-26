# card-catalog

**A personal card catalog for your AI agents: numbered cards they ask first, on Cloudflare's free plan.**

You file short passages from chats, calls, docs and notes as numbered cards, each on a shelf with tags and a one-line blurb. Any agent connected over MCP asks the catalog before it goes digging, gets the best cards back in well under a second, and reads a card by number when it needs the whole passage. Card numbers never change, and every card links to the card before and after it from the same conversation, so an agent can pick up a thread where another one left off.

## Try it (no account, no install)

You need Node 22 or newer.

```sh
git clone https://github.com/westidwell/card-catalog.git
cd card-catalog
npm start
```

That starts the catalog on your machine with about 20 made-up sample cards (notes from a fictional community garden club) and prints a token for this run. Then:

1. Open http://localhost:8787 and paste the token to see the shelves and cards.
2. Connect Claude Code (or any MCP client that can send a header):

   ```sh
   claude mcp add --transport http card-catalog http://localhost:8787/mcp --header "Authorization: Bearer <token>"
   ```

3. Ask your agent something like "Ask the card catalog who's on the welcome table at the seed swap", then "read the next card".

`npm run dev` starts an empty catalog instead, and `npm run dev -- --db cards.db` keeps cards in a local SQLite file between runs (the same SQL the Cloudflare version uses). Set `CATALOG_TOKEN` before either command to choose your own token.

## Put it on Cloudflare (free plan)

```sh
npx wrangler@4.156.0 login
npx wrangler@4.156.0 d1 create card-catalog
```

Copy the `database_id` it prints into `wrangler.toml` in place of `<your-d1-database-id>`. Then set a token (any long random string; your agents will send it) and deploy:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
npx wrangler@4.156.0 secret put CATALOG_TOKEN
npx wrangler@4.156.0 deploy
```

Your catalog is now at `https://card-catalog.<your-subdomain>.workers.dev`. The tables are created on the first request. To load the sample cards there (optional, for a test catalog only):

```sh
CATALOG_TOKEN=<your token> npm run seed -- https://card-catalog.<your-subdomain>.workers.dev
```

### Connecting agents

Point any MCP client that supports Streamable HTTP and custom headers at `https://card-catalog.<your-subdomain>.workers.dev/mcp` with the header `Authorization: Bearer <your token>`. In Claude Code that's the `claude mcp add` line above with your Worker's URL. Clients configured with JSON usually look like this (the exact keys vary by client):

```json
{
  "mcpServers": {
    "card-catalog": {
      "url": "https://card-catalog.<your-subdomain>.workers.dev/mcp",
      "headers": { "Authorization": "Bearer <your token>" }
    }
  }
}
```

Hosted chat apps that only connect through an OAuth sign-in can't use the shared token; see Team sign-in in [PRO.md](PRO.md).

## The tools

| Tool | What it does |
| --- | --- |
| `ask` | Plain question in, best numbered cards out (blurb, shelf, tags, snippet). Filters by shelf or realm. A card number in the question comes back first. |
| `read` | One card by number: the full passage, shelf, source, tags, link, and the previous and next card numbers from the same source. |
| `file_card` | File one passage (up to 4,000 characters) on a shelf, with a blurb, tags and a source. Cards with the same source are chained in order. |
| `bookmark` | Save card numbers on a named reading list with a note, list them, or remove them. Handy for handing a set of cards to another agent. |
| `browse` | Every shelf with its count and newest card, or the cards on one shelf in filing order. |

The server also hands agents short instructions on connect: ask first, answer from the blurbs, read a card only when needed, and never file secrets.

## How it works

- **Cards.** A card holds one short passage plus a blurb (one line an agent can answer from), tags, the shelf it sits on, and its source (the chat, call or doc it came from). Each card gets the next number from a counter, like `N-000042`. Numbers are never reused or changed, so agents can quote them safely.
- **Realms.** The letter in front of the number is a realm you choose, such as `W` for work and `H` for home (`REALMS = "W:work,H:home"`). One counter runs across all realms, so `W-000041` and `H-000042` never collide.
- **Prev and next.** Cards filed with the same source are linked in filing order. `read` returns the neighbours' numbers, and the web page shows them as links.
- **Ranking.** No embeddings and no model calls. Each question word counts more the rarer it is in your catalog; a hit in the blurb or tags counts most, then the shelf name and source, then the passage text. Cards that match every word rank above cards that match some, and an exact phrase gets a nudge.
- **Storage.** Cloudflare D1 (SQLite). Locally, an in-memory store or a SQLite file through Node's built-in `node:sqlite`.
- **Access.** One user, one token, stored as a Worker secret. MCP requests need it as a bearer token. The web page asks for it once and keeps a cookie holding a hash of it. Set `PUBLIC_PAGE = "true"` only for a public demo catalog.
- **Safety net.** `file_card` refuses text that looks like a private key, an API token or a payment card number, since every connected agent can read every card.

The Worker has no runtime dependencies, loads nothing from other sites and sends nothing anywhere except to its own D1 database.

## Settings

Set these under `[vars]` in `wrangler.toml` (or as environment variables for `npm start`):

| Setting | Default | What it does |
| --- | --- | --- |
| `REALMS` | `N:notes` | Realm letters and names. The first is the default for new cards. |
| `CATALOG_TITLE` | `Card catalog` | Name shown on the web page and to agents. |
| `PUBLIC_PAGE` | `false` | `true` lets anyone with the URL read the web page. MCP always needs the token. |
| `CATALOG_TOKEN` | none | The shared token. A secret, not a var: `npx wrangler@4.156.0 secret put CATALOG_TOKEN`. At least 16 characters. |

## Free vs Pro

| | Free (this repo) | Pro (not open yet) |
| --- | --- | --- |
| Ask, read with prev/next, file cards, bookmarks, browse | Yes | Yes |
| Read-only web page with search | Yes | Yes |
| Runs on Cloudflare's free plan, or locally with Node | Yes | Yes |
| Access | One user, one shared token | Team sign-in with roles, OAuth clients |
| Catalogs per deployment | One | Many libraries |
| Filing | One card at a time, by your agents | Nightly chop: chats and call transcripts cut into cards automatically |
| Scheduled agents | Bring your own | Agent work queue: wake up, take a job, report, clock out |
| Usage reports | No | Which questions agents ask, which cards nobody reads |
| Where it runs | Cloudflare Workers + D1 | Also a Snowflake-native version |

Pro is $1/month at launch and isn't open yet. The full list is in [PRO.md](PRO.md); star or watch the repo to hear when it opens.

## Tests

```sh
npm test
```

Runs offline with no install: filing, numbering, search ranking, read with prev/next, bookmarks, browsing, the MCP handshake and `tools/list`, token checks, the web page and the Pro stubs. Every test drives the real Worker handler, against both the in-memory store and the D1 SQL on SQLite.

```sh
npm install
npm run test:workerd
```

Runs the Worker inside workerd, Cloudflare's own runtime, with a local D1 database, through Miniflare (the only dev dependency). GitHub Actions runs both on every push.

## Contributing

Bug fixes and new free features are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Features listed in PRO.md are reserved for the Pro edition, so pull requests that add them will be closed with a pointer to PRO.md.

## License

MIT. See [LICENSE](LICENSE).
