import { mkdir } from "fs/promises";
import ms from "ms";
import rimraf from "rimraf";
import { buildDir } from "../constants";
import compileSourceFiles from "./compileSourceFiles";
import installDependencies from "./installDependencies";

export default async function fullBuild({
  install,
  sourceDir,
}: {
  install: boolean;
  sourceDir: string;
}) {
  await createBuildDirectory(buildDir);
  const start = Date.now();
  await compileSourceFiles({ sourceDir, targetDir: buildDir });
  console.info("✨  Done in %s.", ms(Date.now() - start));

  if (install) await installDependencies({ sourceDir });
}

async function createBuildDirectory(targetDir: string) {
  rimraf.sync(targetDir);
  await mkdir(targetDir);
}
