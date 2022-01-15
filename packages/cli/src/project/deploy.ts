import { IAM } from "@aws-sdk/client-iam";
import chalk from "chalk";
import { Command } from "commander";
import {
  deployLambda,
  setupAPIGateway,
  setupIntegrations,
} from "queue-run-builder";
import invariant from "tiny-invariant";
import { loadProject } from "./project.js";

const command = new Command("deploy")
  .description("deploy your project")
  .action(async () => {
    const { name, runtime } = await loadProject();
    if (!(name && runtime))
      throw new Error(
        "You need to setup your project first: npx queue-run init"
      );

    if (runtime === "lambda") await deployRuntimeLambda({ name });
    else throw new Error(`Unsupported runtime: ${runtime}`);
  });

export default command;

async function deployRuntimeLambda({ name }: { name: string }) {
  const accountId = await getAccountId();
  const region = process.env.AWS_REGION || "us-east-1";
  const { httpURL, wsURL, wsApiId } = await setupAPIGateway(name);

  const lambdaARN = await deployLambda({
    buildDir: ".queue-run",
    sourceDir: process.cwd(),
    config: {
      accountId,
      env: "production",
      region,
      slug: name,
      httpURL,
      wsURL,
      wsApiId,
    },
  });
  await setupIntegrations({ project: name, lambdaARN });

  console.info(chalk.bold.green(`Your API is available at:\t%s`), httpURL);
  console.info(chalk.bold.green(`WebSocket available at:\t\t%s`), wsURL);
  console.info(`Try:\n  curl ${httpURL}`);
}

async function getAccountId(): Promise<string> {
  const iam = new IAM({});
  const { User: user } = await iam.getUser({});
  const accountId = user?.Arn?.split(":")[4];
  invariant(accountId, "Could not determine account ID");
  return accountId;
}
