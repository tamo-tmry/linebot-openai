// TODO: LINE BOTからのリクエスト受け取り

// TODO: DynamoDBから一番新しい履歴を取得

// TODO: OpenAI APIへのリクエスト

// TODO: OpenAI APIからのレスポンスをDynamoDBへ保存

// TODO: LINE BOTへレスポンスを返す

// MEMO: おうむ返しサンプル

const line = require('@line/bot-sdk')
const channelSecret = process.env.LINE_CHANNEL_SECRET
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
const apiUrl = 'https://api.line.me/v2/bot/message/reply'

function validateSignature(body: any, signature: any) {
  const crypto = require('node:crypto')
  const hash = crypto
    .createHmac('sha256', channelSecret)
    .update(body)
    .digest('base64')
  return hash === signature
}

exports.handler = async (event: any) => {
  const body = JSON.parse(event.body)
  const signature = event.headers['x-line-signature']

  if (!validateSignature(event.body, signature)) return

  const client = new line.Client({
    channelAccessToken,
  })

  const events = body.events
  events.forEach(async (event: any) => {
    if (event.type === 'message' && event.message.type === 'text') {
      const replyToken = event.replyToken
      const userMessage = {
        type: 'text',
        text: event.message.text,
      }

      client.replyMessage(replyToken, userMessage)
    }
  })
}
