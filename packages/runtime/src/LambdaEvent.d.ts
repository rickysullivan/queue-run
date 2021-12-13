export declare module "node-fetch";

export declare type LambdaEvent =
  | {
      Records: Array<SQSMessage>;
    }
  | BackendLambdaRequest;

export type BackendLambdaRequest = {
  body?: string;
  headers: Record<string, string>;
  method: string;
  requestId: string;
  url: string;
};

export type BackendLambdaResponse = {
  body: string;
  headers: Record<string, string>;
  statusCode: number;
};

// See https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
export declare type SQSMessage = {
  attributes: SQSMessageAttributes;
  awsRegion: string;
  body: string;
  eventSource: "aws:sqs";
  eventSourceARN: string;
  md5OfBody: string;
  messageAttributes: { [key: string]: { stringValue: string } };
  messageId: string;
  receiptHandle: string;
};

type SQSMessageAttributes = {
  ApproximateFirstReceiveTimestamp: string;
  ApproximateReceiveCount: string;
  SenderId: string;
  SentTimestamp: string;
} & Partial<SQSFifoMessageAttributes>;

type SQSFifoMessageAttributes = {
  MessageDeduplicationId: string;
  MessageGroupId: string;
  SequenceNumber: string;
};

export declare type SQSFifoMessage = SQSMessage & {
  attributes: SQSMessageAttributes & SQSFifoMessageAttributes;
};
