import { Lambda } from "@aws-sdk/client-lambda";
import { Command } from "commander";
import ora from "ora";
import { loadCredentials } from "./project.js";

const command = new Command("reserved")
  .description("set reserved concurrency")
  .argument("<instances>", 'Number of instances, or "off"')
  .addHelpText(
    "after",
    `\n
This backend has a reserved concurrency of 5 instances:
$ npx queue-run reserved 5

This backend has no reserved concurrency:
$ npx queue-run reserved off

This backend is not available:
$ npx queue-run reserved 0
`
  )
  .action(async (instances: string) => {
    const { name, awsRegion: region } = await loadCredentials();
    const slug = `qr-${name}`;

    const spinner = ora("Updating reserved concurrency").start();
    const lambda = new Lambda({ region });
    if (instances === "off") {
      await lambda.deleteFunctionConcurrency({
        FunctionName: slug,
      });
    } else {
      const number = parseInt(instances, 10);
      if (isNaN(number)) throw new Error('Must be a number or "off"');
      if (number < 0) throw new Error("Must be a positive number");
      await lambda.putFunctionConcurrency({
        FunctionName: slug,
        ReservedConcurrentExecutions: number,
      });
    }
    spinner.succeed("Updated reserved concurrency");
  });

export default command;
