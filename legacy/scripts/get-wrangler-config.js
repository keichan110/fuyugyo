#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
// 'toml' パッケージのインストールが必要です: npm install toml
const toml = require("toml");

const EXPECTED_ARGS_LENGTH = 3;

function getNestedValue(obj, configKeyPath) {
  let result = obj;
  for (const key of configKeyPath.split(".")) {
    if (result === undefined || result === null) {
      return;
    }
    if (Array.isArray(result) && !Number.isNaN(Number.parseInt(key, 10))) {
      result = result[Number.parseInt(key, 10)];
    } else {
      result = result[key];
    }
  }
  return result;
}

if (process.argv.length !== EXPECTED_ARGS_LENGTH) {
  console.error("Usage: node get-wrangler-config.js <key_path>");
  process.exit(1);
}

const keyPath = process.argv[2];
const tomlPath = path.join(process.cwd(), "wrangler.toml");

if (!fs.existsSync(tomlPath)) {
  console.error(`Error: 'wrangler.toml' not found.`);
  process.exit(1);
}

try {
  const tomlContent = fs.readFileSync(tomlPath, "utf-8");
  const config = toml.parse(tomlContent);
  const value = getNestedValue(config, keyPath);

  if (value === undefined) {
    console.error(`Error: Key path '${keyPath}' not found in 'wrangler.toml'`);
    process.exit(1);
  }

  process.stdout.write(String(value));
} catch (e) {
  console.error(`Error parsing 'wrangler.toml': ${e.message}`);
  process.exit(1);
}
