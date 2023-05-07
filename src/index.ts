// TODO: LINE BOTからのリクエスト受け取り

// TODO: DynamoDBから一番新しい履歴を取得

// TODO: OpenAI APIへのリクエスト

// TODO: OpenAI APIからのレスポンスをDynamoDBへ保存

// TODO: LINE BOTへレスポンスを返す

// MEMO: おうむ返しサンプル
import {
  WebhookEvent,
  WebhookRequestBody,
  Message,
  Client,
} from '@line/bot-sdk'
import { APIGatewayEvent } from 'aws-lambda'
import crypto from 'crypto'

const channelSecret = process.env.LINE_CHANNEL_SECRET!
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN!

function validateSignature(body: string, signature: string) {
  const hash = crypto
    .createHmac('sha256', channelSecret)
    .update(body)
    .digest('base64')
  return hash === signature
}

exports.handler = async (event: APIGatewayEvent) => {
  const body: WebhookRequestBody = JSON.parse(event.body!)
  const signature = event.headers['x-line-signature']

  if (!validateSignature(event.body!, signature!)) {
    return {
      statusCode: 400,
      body: 'FAILED',
    }
  }

  const client = new Client({
    channelAccessToken,
  })

  const events = body.events

  try {
    await Promise.all(
      events.map(async (event: WebhookEvent) => {
        if (event.type === 'message' && event.message.type === 'text') {
          const replyToken = event.replyToken
          const userMessage: Message = {
            type: 'text',
            text: event.message.text,
          }

          return client.replyMessage(replyToken, userMessage)
        }
      }),
    )
    return {
      statusCode: 200,
      body: JSON.stringify('SUCCESS'),
    }
  } catch (error) {
    return {
      statusCode: 400,
      body: 'FAILED',
    }
  }
}
