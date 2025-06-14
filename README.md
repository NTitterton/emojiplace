# EmojiPlace

A collaborative emoji canvas inspired by r/place, where users can place emojis on an infinite grid.

## Features

- Infinite canvas rendered with coordinate-based chunking.
- 5-minute cooldown between pixel placements.
- Real-time updates via AWS API Gateway WebSockets.
- IP-based user tracking for cooldowns.
- Canvas data served efficiently via S3 and CloudFront.
- Serverless backend for high scalability and availability.

## Tech Stack

- **Frontend**: Next.js with TypeScript, Canvas API
- **Backend**: Serverless framework with AWS Lambda and API Gateway
- **Database**: DynamoDB for pixel data, connections, and cooldowns
- **Storage**: AWS S3 for storing canvas chunks
- **CDN**: AWS CloudFront for low-latency delivery of canvas chunks
- **Real-time**: API Gateway WebSocket API

## Local Development and Deployment

### Prerequisites

- Node.js 18+
- Git
- AWS CLI, configured with your credentials
- Serverless Framework

### Installation

1.  Clone the repository:
    ```bash
    git clone <your-repo-url>
    cd emojiplace
    ```

2.  Install backend dependencies:
    ```bash
    cd backend
    npm install
    ```

3.  Install frontend dependencies:
    ```bash
    cd ../frontend
    npm install
    ```

### Local Development

1.  To simulate the AWS Lambda and API Gateway environment locally, run the following command in the `backend` directory:
    ```bash
    serverless offline
    ```

2.  Start the frontend development server:
    ```bash
    cd frontend
    npm run dev
    ```

3.  Open your browser to `http://localhost:3000`.

### Deployment

1.  Deploy the backend to AWS using the Serverless Framework:
    ```bash
    cd backend
    serverless deploy --stage prod
    ```
    After deployment, the necessary environment variables (like the API endpoint) will be configured.

2.  Build the frontend for production:
    ```bash
    cd frontend
    npm run build
    ```

3.  The frontend is a standard Next.js application and can be deployed to any hosting provider that supports Node.js, such as Vercel or AWS Amplify.

## Project Structure

```
emojiplace/
├── backend/      # Serverless backend (AWS Lambda)
│   ├── src/
│   │   └── handlers.js # Lambda function handlers
│   ├── serverless.yml  # Serverless configuration
│   └── package.json
├── frontend/     # Next.js application
│   ├── src/
│   │   └── app/      # Next.js app directory
│   └── package.json
└── README.md
```

## API Endpoints

-   `GET /api/pixels/region/{x}/{y}` - Retrieves the chunk of pixels for a given region. The response will likely redirect to a CloudFront URL for the actual chunk data.

## WebSocket Events

When a client connects to the WebSocket API, it can send and receive messages.

### Client to Server

-   `place_pixel`: A message sent when a user attempts to place a pixel. The payload should include the coordinates (`x`, `y`) and the `emoji`.

### Server to Client

-   `pixel_placed`: Broadcast to all connected clients when a pixel has been successfully placed. The payload includes the coordinates and the new emoji.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License