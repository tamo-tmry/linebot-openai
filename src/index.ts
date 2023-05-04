// TODO: LINE BOTからのリクエスト受け取り

// TODO: DynamoDBから一番新しい履歴を取得

// TODO: OpenAI APIへのリクエスト

// TODO: OpenAI APIからのレスポンスをDynamoDBへ保存

// TODO: LINE BOTへレスポンスを返す

// MEMO: Sample
exports.handler = async (event: any, context: any) => {
  console.log('boot test', event, context)

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Success' }),
  }
}
