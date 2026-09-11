#!/usr/bin/env node
import {setDefaultResultOrder} from "node:dns";
setDefaultResultOrder("ipv4first");

import {createInterface} from "readline";
import {writeFileSync, readFileSync, existsSync} from "fs";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

// Load .env if present (local dev convenience — ignored if no .env exists)
if (existsSync(".env")) {

    process.loadEnvFile(".env");

}

import type {AwsCredentialIdentityProvider} from "@aws-sdk/types";
import {fromIni} from "@aws-sdk/credential-providers";
import {Inventory, GraphBuilder, MarkdownExporter, CsvExporter, GexfExporter, JsonExporter, LiveServiceFactory, CacheServiceFactory, CacheWriter, UnusedDetector} from "@gnaws/core";
import type {DirectedGraph} from "graphology";
import chalk from "chalk";
import ora from "ora";
import {createLogger} from "./logger.js";

// State
let inventory: Inventory | undefined;
let graph: DirectedGraph | undefined;

const logLevel = (process.env.LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error" | "silent";
const logger = createLogger(logLevel);

// Commands
const commands: Record<string, {"description": string;
    "handler": (args: string) => Promise<void> | void;}> = {

    "/help": {
        "description": "Show available commands",
        handler (_args: string) {

            console.log(chalk.cyan("\nAvailable commands:\n"));
            for (const [
                name,
                cmd
            ] of Object.entries(commands)) {

                console.log(`  ${chalk.bold(name.padEnd(12))} ${chalk.gray(cmd.description)}`);

            }
            console.log();

        }
    },

    "/scan": {
        "description": "Scan AWS resources live (usage: /scan [profile])",
        async handler (args: string) {

            if (graph) {

                graph = undefined;

            }
            const profile = args || (process.env.AWS_PROFILE ?? "default");
            const credentials: AwsCredentialIdentityProvider = fromIni({profile});
            const spinner = ora(`Scanning AWS resources with profile [${profile}]...`).start();
            inventory = new Inventory(
                credentials,
                new LiveServiceFactory(logger.child("aws"))
            );
            await inventory.init();
            await inventory.loadResources();
            spinner.text = "Building graph...";
            graph = new GraphBuilder().build(inventory);
            spinner.succeed(`Scan complete: ${chalk.green(String(graph.order))} nodes, ${chalk.green(String(graph.size))} edges`);

        }
    },

    "/load": {
        "description": "Load resources from a dump directory (usage: /load <path>)",
        async handler (args: string) {

            if (!args) {

                console.log(chalk.yellow("Usage: /load <path>"));
                return;

            }
            if (graph) {

                graph = undefined;

            }
            const manifestPath = join(
                args,
                "manifest.json"
            );
            if (existsSync(manifestPath)) {

                const manifest = JSON.parse(readFileSync(
                    manifestPath,
                    "utf-8"
                )) as {
                    "scannedAt"?: string;
                    "regions"?: string[];
                };
                console.log(chalk.gray(`  Dump scanned at: ${manifest.scannedAt ?? "unknown"}`));
                console.log(chalk.gray(`  Regions: ${manifest.regions?.length.toString() ?? "unknown"}`));

            } else {

                console.log(chalk.gray("  No manifest found, dump metadata unknown"));

            }
            const spinner = ora(`Loading from ${args}...`).start();
            inventory = new Inventory(new CacheServiceFactory(
                args,
                logger.child("cache")
            ));
            await inventory.init();
            await inventory.loadResources();
            spinner.text = "Building graph...";
            graph = new GraphBuilder().build(inventory);
            spinner.succeed(`Loaded from ${args}: ${chalk.green(String(graph.order))} nodes, ${chalk.green(String(graph.size))} edges`);

        }
    },

    "/sample": {
        "description": "Load bundled sample data to try detection and export",
        async handler (_args: string) {

            if (graph) {

                graph = undefined;

            }
            const packageDir = dirname(fileURLToPath(import.meta.url));
            const samplePath = join(
                packageDir,
                "..",
                "sample-dump"
            );
            const spinner = ora("Loading sample data...").start();
            inventory = new Inventory(new CacheServiceFactory(
                samplePath,
                logger.child("cache")
            ));
            await inventory.init();
            await inventory.loadResources();
            spinner.text = "Building graph...";
            graph = new GraphBuilder().build(inventory);
            spinner.succeed(`Sample loaded: ${chalk.green(String(graph.order))} nodes, ${chalk.green(String(graph.size))} edges — try /detect`);

        }
    },

    "/detect": {
        "description": "Detect unused resources (requires /graph). Usage: /detect [file.json|file.md]",
        handler (args: string) {

            if (!graph || !inventory) {

                console.log(chalk.yellow("Run /graph first."));
                return;

            }
            const spinner = ora("Detecting unused resources...").start();
            const detector = new UnusedDetector();
            const findings = detector.detect(
                inventory,
                graph
            );
            spinner.stop();

            if (findings.length === 0) {

                console.log(chalk.green("\n  No unused resources detected.\n"));
                return;

            }

            // Export to file if path provided
            if (args) {

                if (args.endsWith(".json")) {

                    writeFileSync(
                        args,
                        JSON.stringify(
                            findings,
                            null,
                            2
                        )
                    );

                } else if (args.endsWith(".md")) {

                    const lines = [
                        "# Unused Resources",
                        "",
                        `> ${String(findings.length)} findings detected`,
                        "",
                        "| Confidence | Resource | ARN | Type | Region | Reason |",
                        "|------------|----------|-----|------|--------|--------|",
                        ...findings.map((f) => `| ${f.confidence} | ${f.name} | ${f.arn} | ${f.resourceType} | ${f.region} | ${f.reason} |`)
                    ];
                    writeFileSync(
                        args,
                        lines.join("\n")
                    );

                } else {

                    console.log(chalk.yellow("Unsupported format. Use .json or .md extension."));
                    return;

                }
                console.log(chalk.green(`  ${String(findings.length)} findings written to ${chalk.underline(args)}`));
                return;

            }

            // Console table display
            console.log(chalk.cyan(`\n  ${String(findings.length)} unused resources detected:\n`));

            // Column widths
            const confW = 8;
            const typeW = Math.min(
                20,
                Math.max(...findings.map((f) => f.resourceType.length))
            );
            const regionW = 16;
            const nameW = Math.min(
                40,
                Math.max(...findings.map((f) => f.name.length))
            );

            // Header
            const header = `  ${"CONF".padEnd(confW)} ${"TYPE".padEnd(typeW)} ${"REGION".padEnd(regionW)} ${"NAME".padEnd(nameW)} REASON`;
            console.log(chalk.gray(header));
            console.log(chalk.gray(`  ${"─".repeat(header.length - 2)}`));

            // Rows
            for (const f of findings) {

                const conf = f.confidence === "high"
                    ? chalk.red(f.confidence.padEnd(confW))
                    : chalk.yellow(f.confidence.padEnd(confW));
                const type = f.resourceType.padEnd(typeW);
                const region = chalk.gray(f.region.padEnd(regionW));
                const name = chalk.bold(f.name.length > nameW
                    ? f.name.substring(
                        0,
                        nameW - 1
                    ) + "…"
                    : f.name.padEnd(nameW));
                console.log(`  ${conf} ${type} ${region} ${name} ${chalk.gray(f.reason)}`);

            }
            console.log();

        }
    },

    "/export": {
        "description": "Export graph or report. Usage: /export <gexf|json|md> [path]",
        handler (args: string) {

            if (!graph || !inventory) {

                console.log(chalk.yellow("Run /scan or /load first."));
                return;

            }

            const parts = args.split(" ");
            const format = parts[0];
            const customPath = parts[1];

            if (!format || ![
                "gexf",
                "json",
                "md",
                "csv"
            ].includes(format)) {

                console.log(chalk.yellow("Usage: /export <gexf|json|md|csv> [path]"));
                return;

            }

            const spinner = ora("Exporting...").start();
            let outputPath = "";
            const ext = format === "md"
                ? ".md"
                : `.${format}`;

            if (format === "gexf") {

                outputPath = customPath
                    ? customPath.endsWith(ext)
                        ? customPath
                        : customPath + ext
                    : "graph.gexf";
                new GexfExporter().export(
                    outputPath,
                    inventory,
                    graph
                );

            } else if (format === "json") {

                outputPath = customPath
                    ? customPath.endsWith(ext)
                        ? customPath
                        : customPath + ext
                    : "graph.json";
                new JsonExporter().export(
                    outputPath,
                    inventory,
                    graph
                );

            } else if (format === "md") {

                outputPath = customPath
                    ? customPath.endsWith(ext)
                        ? customPath
                        : customPath + ext
                    : "report.md";
                new MarkdownExporter().export(
                    outputPath,
                    inventory,
                    graph
                );

            } else if (format === "csv") {

                outputPath = customPath
                    ? customPath.endsWith(ext)
                        ? customPath
                        : customPath + ext
                    : "inventory.csv";
                new CsvExporter().export(
                    outputPath,
                    inventory,
                    graph
                );

            }

            spinner.succeed(`Exported ${chalk.underline(outputPath)}`);

        }
    },
    "/regions": {
        "description": "List enabled account regions (requires /scan or /load)",
        handler (_args: string) {

            if (!inventory) {

                console.log(chalk.yellow("Run /scan or /load first to load resources."));
                return;

            }
            const regions = inventory.getAccountRegions();
            console.log(chalk.cyan(`\n  ${String(regions.length)} enabled regions:\n`));
            for (const region of regions) {

                console.log(`    ${region.RegionName ?? "unknown"}`);

            }
            console.log();

        }
    },

    "/dump": {
        "description": "Dump loaded resources to a directory for offline use (usage: /dump [path])",
        handler (args: string) {

            if (!inventory) {

                console.log(chalk.yellow("Run /scan or /load first."));
                return;

            }
            const outputDir = args || "dump";
            const spinner = ora(`Dumping resources to ${outputDir}...`).start();
            const writer = new CacheWriter(outputDir);
            writer.writeAll(inventory);
            spinner.succeed(`Resources dumped to ${chalk.underline(outputDir)}`);

        }
    },

    "/quit": {
        "description": "Exit GNAWS CLI",
        handler (_args: string) {

            console.log(chalk.gray("\nBye 👋\n"));
            process.exit(0);

        }
    }

};

// REPL
console.log(chalk.cyan.bold("\n🐭 GNAWS CLI") + chalk.gray("  (type /help for commands)\n"));

const rl = createInterface({
    "input": process.stdin,
    "output": process.stdout,
    "prompt": chalk.blue("gnaws> "),
    "completer": (line: string): [string[], string] => {

        const hits = Object.keys(commands).filter((c) => c.startsWith(line));
        return [
            hits.length
                ? hits
                : Object.keys(commands),
            line
        ];

    }
});

rl.prompt();

rl.on(
    "line",
    (line: string) => {

        void (async () => {

            const input = line.trim();

            if (!input) {

                rl.prompt();
                return;

            }

            const [
                cmdName,
                ...parts
            ] = input.split(" ");
            const cmd = commands[cmdName] as typeof commands[string] | undefined;
            if (cmd) {

                await cmd.handler(parts.join(" "));

            } else {

                console.log(chalk.red(`Unknown command: ${input}`) + chalk.gray("  (try /help)"));

            }

            rl.prompt();

        })();

    }
);
