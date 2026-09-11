# @gnaws/cli

> *Graph your AWS. Find what's gnawing at your bill.*

[![npm](https://img.shields.io/npm/v/@gnaws/cli)](https://www.npmjs.com/package/@gnaws/cli)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![node](https://img.shields.io/node/v/@gnaws/cli)](package.json)

Interactive CLI for [@gnaws/core](https://www.npmjs.com/package/@gnaws/core) — scan your AWS account, build the resource graph, detect unused resources, and export to Gephi/sigma.js/Markdown/CSV.

## Installation

```bash
npm install -g @gnaws/cli
# or run without installing:
npx @gnaws/cli
```

Requires Node.js >= 24.

## Usage

```
🐭 GNAWS CLI  (type /help for commands)

gnaws> /scan [profile]        Scan live AWS account and build graph
gnaws> /load <path>           Load from a local dump (no credentials needed)
gnaws> /sample                Load bundled sample data to try detection/export
gnaws> /detect [output.md]    Detect unused resources (optionally save report)
gnaws> /export <gexf|json|md|csv> [path]  Export graph
gnaws> /dump [path]           Dump inventory to JSON files for offline use
gnaws> /regions               List scanned regions
gnaws> /help                  Show all commands
gnaws> /quit                  Exit
```

## Example workflow

```bash
npx @gnaws/cli

gnaws> /scan my-aws-profile
  Scanning AWS resources with profile [my-aws-profile]...
  ✔ Scan complete: 4521 nodes, 8734 edges

gnaws> /detect report.md
gnaws> /export gexf graph.gexf
gnaws> /dump ./dump
gnaws> /quit
```

Reload later from the dump — no AWS credentials needed:

```bash
npx @gnaws/cli

gnaws> /load ./dump
gnaws> /detect
gnaws> /export gexf graph.gexf
```

## Try it without AWS credentials

The CLI includes sample data with intentionally broken resources so you can try the detection workflow immediately:

```bash
npx @gnaws/cli

gnaws> /sample
  ✔ Sample loaded: 24 nodes, 30 edges — try /detect

gnaws> /detect
  9 unused resources found
```

## Configuration

The CLI reads `AWS_PROFILE` from the environment or from a `.env` file in the current directory. You can also pass the profile directly to `/scan`:

```bash
export AWS_PROFILE=my-profile
npx @gnaws/cli
gnaws> /scan              # uses my-profile

# or pass it inline:
gnaws> /scan other-profile
```

### Log level

Set `LOG_LEVEL` to control verbosity (default: `info`):

```bash
LOG_LEVEL=debug npx @gnaws/cli
```

Available levels: `debug`, `info`, `warn`, `error`, `silent`.

## Contributing

See [CONTRIBUTING.md](https://github.com/FabioDominio/gnaws-cli/blob/main/CONTRIBUTING.md).

## Support

If GNAWS saves you money on your AWS bill, consider sponsoring the project.

[![Sponsor on GitHub](https://img.shields.io/badge/sponsor-GitHub-pink?logo=github)](https://github.com/sponsors/FabioDominio)
[![Sponsor on PayPal](https://img.shields.io/badge/sponsor-PayPal-blue?logo=paypal)](https://paypal.me/drdominiof)

## License

AGPL-3.0 — see [LICENSE](LICENSE).

---

*Not affiliated with or endorsed by Amazon Web Services.*
