import swc from "@swc/core";
import fs from "node:fs/promises";
import path from "node:path";
import semver from "semver";

type RuntimeVersion = {
  // Primary Node version (14, 16, etc)
  nodeVersion: "14";
  // Lambda runtime version, eg nodejs14.x
  lambdaRuntime: string;
  // Tell SWC which Node version to compile for
  jscTarget: swc.JscTarget;
};

// Returns the most suitable runtime version.
//
// For Node.js, consult with package.json engines.node field and pick the
// general Node version (14, 12, etc).
export default async function getRuntime(
  dirname: string
): Promise<RuntimeVersion> {
  const filename = path.join(dirname, "package.json");
  const { engines } = JSON.parse(
    await fs.readFile(filename, "utf-8").catch(() => "{}")
  );

  const specifiedEngine = engines?.node;
  if (!specifiedEngine) return defaultRuntime;

  for (const runtime of runtimes) {
    if (semver.satisfies(`${runtime.nodeVersion}.0.0`, specifiedEngine))
      return runtime;
  }
  throw new Error(
    `package.json specifies unsupported Node engine ${specifiedEngine}`
  );
}

const runtimes: Array<RuntimeVersion> = [
  {
    nodeVersion: "14",
    jscTarget: "es2020",
    lambdaRuntime: "nodejs14.x",
  },
];

const defaultRuntime = runtimes[0]!;
