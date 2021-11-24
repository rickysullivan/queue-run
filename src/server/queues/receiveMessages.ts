import {
  DeleteMessageCommand,
  ListQueuesCommand,
  ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import { JSONObject, Queue } from "../../../types";
import client from "../client";
import getTopology from "../functions";

const VisibilityTimeout = 60 * 5;
const WaitTimeSeconds = 20;

export default async function receiveMessages(prefix: string) {
  const { queues } = await getTopology();
  const queueURLs = await listQueuesURLs(prefix);

  console.info(
    "Receiving messages for queues %s",
    [...queues.keys()].join(", ")
  );
  queues.forEach((module, name) => {
    const queueURL = getQueueURL({ name, prefix, queueURLs });
    if (!queueURL) throw new Error(`Queue ${name} not found`);
    receiveMessagesForQueue(queueURL, module);
  });
}

async function receiveMessagesForQueue(queueURL: string, module: Queue.Module) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueURL,
      VisibilityTimeout,
      WaitTimeSeconds,
    });
    const response = await client.send(command);
    const messages = response.Messages;
    if (!messages) continue;

    await Promise.all(
      messages.map(async (message) => {
        console.debug(
          "Received message %s on queue %s",
          message.MessageId,
          queueURL.split("/").slice(-1)
        );

        console.log(message);

        const payload = JSON.parse(message.Body!) as JSONObject;
        await module.handler(payload);

        const command = new DeleteMessageCommand({
          QueueUrl: queueURL,
          ReceiptHandle: message.ReceiptHandle,
        });
        await client.send(command);
      })
    );
  }
}

function getQueueURL({
  name,
  prefix,
  queueURLs,
}: {
  name: string;
  prefix: string;
  queueURLs: Set<string>;
}): string | undefined {
  const ending = `/${prefix}-${name}`;
  return [...queueURLs].find((url) => url.endsWith(ending));
}

async function listQueuesURLs(prefix: string): Promise<Set<string>> {
  const command = new ListQueuesCommand({
    QueueNamePrefix: prefix,
  });
  const response = await client.send(command);
  return new Set(response.QueueUrls);
}
