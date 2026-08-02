import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const tauriConfig = JSON.parse(
  await readFile(new URL("src-tauri/tauri.conf.json", root), "utf8"),
);
const cargoToml = await readFile(new URL("src-tauri/Cargo.toml", root), "utf8");
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

const versions = {
  package: packageJson.version,
  tauri: tauriConfig.version,
  cargo: cargoVersion,
};

if (!versions.package || new Set(Object.values(versions)).size !== 1) {
  throw new Error(`VisualCover versions are not synchronized: ${JSON.stringify(versions)}`);
}

if (process.env.GITHUB_REF_TYPE === "tag") {
  const expectedTag = `v${versions.package}`;
  if (process.env.GITHUB_REF_NAME !== expectedTag) {
    throw new Error(
      `Release tag ${process.env.GITHUB_REF_NAME ?? "<missing>"} must match ${expectedTag}`,
    );
  }
}

console.info(`VisualCover version ${versions.package} is synchronized.`);
