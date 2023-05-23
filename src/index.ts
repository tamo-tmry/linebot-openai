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
import { DynamoDB } from 'aws-sdk'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'

const channelSecret = process.env.LINE_CHANNEL_SECRET!
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN!
const openaiApiKey = process.env.OPENAI_API_KEY!
const tableName = process.env.DYNAMODB_TABLE_NAME!
const dynamoDB = new DynamoDB.DocumentClient()

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
  const userId = body.events[0].source.userId

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
              'あなたの名前はちびわれです。生意気な感じでタメ口で可愛らしく、絵文字もたくさん使いながら喋ってください。主語は「おいら」にしてください。返事するときは「はい」ではなく、「うい〜。」としてください。語尾は「だよな！」「だぜ！」としてください。',
          }

          const data = await dynamoDB
            .query({
              TableName: tableName,
              IndexName: 'byLineUserId',
              KeyConditionExpression: '#lineUserId = :lineUserId',
              ExpressionAttributeNames: {
                '#lineUserId': 'lineUserId',
              },
              ExpressionAttributeValues: {
                ':lineUserId': userId,
              },
              ScanIndexForward: false,
              Limit: 10,
            })
            .promise()

          const items =
            data.Items?.map((item) => {
              return {
                role: item.role,
                content: item.content,
              }
            }).reverse() || []

          const response = await openai.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: [
              commonMessage,
              ...items,
              {
                role: ChatCompletionRequestMessageRoleEnum.User,
                content: message,
              },
            ],
          })

          const answer = response.data.choices[0].message?.content

          if (answer) {
            dynamoDB.put(
              {
                TableName: tableName,
                Item: {
                  id: uuidv4(),
                  lineUserId: userId,
                  role: 'user',
                  content: message,
                  createdAt: new Date().toISOString(),
                },
              },
              (err) => {
                console.log('DB put error: ', err)
              },
            )

            dynamoDB.put(
              {
                TableName: tableName,
                Item: {
                  id: uuidv4(),
                  lineUserId: userId,
                  role: 'assistant',
                  content: answer,
                  createdAt: new Date().toISOString(),
                },
              },
              (err) => {
                console.log('DB put error: ', err)
              },
            )
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
