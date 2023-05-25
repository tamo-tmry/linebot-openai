# linebot-openai

## About

このプロジェクトは、OpenAI GPT-3.5 Turbo と Google Cloud Vision API を使用した LINE ボットです。  
ユーザーからのメッセージに対して GPT-3.5 Turbo を使用して応答します。  
画像の場合は Google Cloud Vision API を使用して画像内からテキストを抽出し、GPT を使用して応答します。  
また、ユーザーとボットの対話は AWS の DynamoDB に保存されます。

![概略図](https://raw.githubusercontent.com/tamo-tmry/linebot-openai/8cc883afe3e12bdfb8aa3fb1796e1558419ebea0/docs/overview.excalidraw.svg)

## Requirements

- Node.js (v18)
- AWS アカウント
- LINE Messaging API アカウント
- Google Cloud Vision API アカウント
- OpenAI アカウント

## Setup

1. 本リポジトリをクローンする。

2. 必要な依存関係をインストールする。

```
yarn install
```

3. GitHub Actions に環境変数を設定する。

以下の環境変数を設定してください。

```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
GOOGLE_APPLICATION_CREDENTIALS
LINE_CHANNEL_ACCESS_TOKEN
LINE_CHANNEL_SECRET
OPENAI_API_KEY
```

main ブランチへの push をトリガーにプロジェクトがデプロイされます。
