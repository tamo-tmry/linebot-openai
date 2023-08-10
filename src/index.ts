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
import vision from '@google-cloud/vision'

const channelSecret = process.env.LINE_CHANNEL_SECRET!
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN!
const openaiApiKey = process.env.OPENAI_API_KEY!
const tableName = process.env.DYNAMODB_TABLE_NAME!
const googleApplicationCredentials = JSON.parse(
  process.env.GOOGLE_APPLICATION_CREDENTIALS!,
)
const dynamoDB = new DynamoDB.DocumentClient()
const visionClient = new vision.ImageAnnotatorClient({
  credentials: googleApplicationCredentials,
})
const commonMessageContent = process.env.COMMON_MESSAGE!

function validateSignature(body: string, signature: string) {
  const hash = crypto
    .createHmac('sha256', channelSecret)
    .update(body)
    .digest('base64')
  return hash === signature
}

const fetchPreviousConversations = async (userId: string) => {
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
  return data
}

type Conversation = {
  role: ChatCompletionRequestMessageRoleEnum
  content: string
}

const addConversations = async (
  conversations: Conversation[],
  userId: string,
) => {
  return Promise.all(
    conversations.map((conversation) => {
      return dynamoDB
        .put({
          TableName: tableName,
          Item: {
            id: uuidv4(),
            lineUserId: userId,
            role: conversation.role,
            content: conversation.content,
            createdAt: new Date().toISOString(),
          },
        })
        .promise()
    }),
  )
}

exports.handler = async (event: APIGatewayEvent) => {
  const body: WebhookRequestBody = JSON.parse(event.body!)
  const signature = event.headers['x-line-signature']
  const userId = body.events[0].source.userId!
  const modelName = 'gpt-4'
  const failedMessage = '失敗しちゃった。もう一回試してね。'

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
          const keywordRemovalPattern = new RegExp(
            `(の|を)?((写真|しゃしん)(の|を)?(撮って|とって)).*`,
            'g',
          )
          const imageGenerationKeyword = message.match(keywordRemovalPattern)

          if (Boolean(imageGenerationKeyword)) {
            const promptMessage = message.replace(keywordRemovalPattern, '')
            const response = await openai.createImage({
              prompt: promptMessage,
              n: 1,
              size: '512x512',
            })

            const answerImage = response.data.data[0].url!
            const userMessage: Message[] = [
              {
                type: 'image',
                originalContentUrl: answerImage,
                previewImageUrl: answerImage,
              },
              {
                type: 'text',
                text: 'いい写真撮れたでしょ〜',
              },
            ]

            return client.replyMessage(replyToken, userMessage)
          } else {
            const commonMessage = {
              role: ChatCompletionRequestMessageRoleEnum.System,
              content: commonMessageContent,
            }

            const data = await fetchPreviousConversations(userId)

            const items =
              data.Items?.map((item) => {
                return {
                  role: item.role,
                  content: item.content,
                }
              }).reverse() || []

            const response = await openai.createChatCompletion({
              model: modelName,
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
              const conversations: Conversation[] = [
                {
                  role: ChatCompletionRequestMessageRoleEnum.User,
                  content: message,
                },
                {
                  role: ChatCompletionRequestMessageRoleEnum.Assistant,
                  content: answer,
                },
              ]

              await addConversations(conversations, userId).catch((err) => {
                console.log('DB put error: ', err)
              })
            }

            const userMessage: Message = {
              type: 'text',
              text: answer || failedMessage,
            }
            return client.replyMessage(replyToken, userMessage)
          }
        }

        if (event.type === 'message' && event.message.type === 'image') {
          const replyToken = event.replyToken
          const stream = await client.getMessageContent(event.message.id)

          let imageBytes = []
          for await (const data of stream) {
            imageBytes.push(...data)
          }

          const [result] = await visionClient.textDetection({
            image: { content: Buffer.from(imageBytes) },
          })

          const detections = result.textAnnotations
          const message = detections && detections[0].description

          if (message) {
            const commonMessage = {
              role: ChatCompletionRequestMessageRoleEnum.System,
              content: commonMessageContent,
            }

            const response = await openai.createChatCompletion({
              model: modelName,
              messages: [
                commonMessage,
                {
                  role: ChatCompletionRequestMessageRoleEnum.User,
                  content: message,
                },
              ],
            })

            const answer = response.data.choices[0].message?.content

            if (answer) {
              const conversations: Conversation[] = [
                {
                  role: ChatCompletionRequestMessageRoleEnum.User,
                  content: message,
                },
                {
                  role: ChatCompletionRequestMessageRoleEnum.Assistant,
                  content: answer,
                },
              ]

              await addConversations(conversations, userId).catch((err) => {
                console.log('DB put error: ', err)
              })
            }

            return client.replyMessage(replyToken, {
              type: 'text',
              text: answer || failedMessage,
            })
          } else {
            const userMessage: Message = {
              type: 'text',
              text: failedMessage,
            }
            return client.replyMessage(replyToken, userMessage)
          }
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
