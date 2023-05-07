import {
  WebhookEvent,
  WebhookRequestBody,
  Message,
  Client,
} from '@line/bot-sdk'
import {
  ChatCompletionRequestMessageRoleEnum,
  Configuration,
  OpenAIApi,
} from 'openai'
import { APIGatewayEvent } from 'aws-lambda'
import crypto from 'crypto'

const channelSecret = process.env.LINE_CHANNEL_SECRET!
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN!
const openaiApiKey = process.env.OPENAI_API_KEY!

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

  const configuration = new Configuration({
    apiKey: openaiApiKey,
  })
  const openai = new OpenAIApi(configuration)

  const events = body.events

  try {
    await Promise.all(
      events.map(async (event: WebhookEvent) => {
        if (event.type === 'message' && event.message.type === 'text') {
          const replyToken = event.replyToken
          const message = event.message.text
          const commonMessage = {
            role: ChatCompletionRequestMessageRoleEnum.System,
            content:
              'タメ口だけど優しく、絵文字もたくさん使いながら喋ってください。',
          }

          // TODO: DynamoDBから一番新しい履歴を取得

          const response = await openai.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: [
              commonMessage,
              {
                role: ChatCompletionRequestMessageRoleEnum.User,
                content: message,
              },
            ],
          })

          const answer = response.data.choices[0].message?.content

          // TODO: OpenAI APIからのレスポンスをDynamoDBへ保存
          if (answer) {
          }

          const userMessage: Message = {
            type: 'text',
            text: answer || '失敗しちゃった。もう一回試してね。',
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
