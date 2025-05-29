# EmojiPlace

A collaborative emoji canvas inspired by r/place, where users can place emojis on an infinite grid.

## Features

- Infinite canvas with coordinate-based navigation
- 5-minute cooldown between pixel placements
- Real-time updates via WebSocket
- IP-based user tracking with optional usernames
- Hover to see pixel information
- Canvas-based rendering with infinite scrolling

## Tech Stack

- **Frontend**: Next.js with TypeScript, Canvas API
- **Backend**: Express.js with WebSocket support
- **Database**: Redis for pixel storage and user management
- **Real-time**: WebSocket for live updates

## Quick Start

### Prerequisites

- Node.js 18+
- Redis server
- Git

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd emojiplace
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install frontend dependencies:
```bash
cd ../frontend
npm install
```

### Running the Development Environment

1. Start Redis server (if not already running):
```bash
redis-server
```

2. Start the backend server:
```bash
cd backend
npm run dev
```

3. Start the frontend development server:
```bash
cd frontend
npm run dev
```

4. Open your browser to `http://localhost:3000`

### Building for Production

1. Build the frontend:
```bash
cd frontend
npm run build
```

2. Start production servers:
```bash
# Backend
cd backend
npm start

# Frontend
cd frontend
npm start
```

## Project Structure 

emojiplace/
├── backend/ # Express.js API server
│ ├── src/
│ │ ├── services/ # Redis, Canvas, User services
│ │ ├── routes/ # API routes
│ │ └── index.js # Main server file
│ └── package.json
├── frontend/ # Next.js application
│ ├── src/
│ │ ├── app/ # Next.js app directory
│ │ ├── components/ # React components
│ │ └── types/ # TypeScript types
│ └── package.json
└── README.md


## API Endpoints

- `GET /api/pixels/:x/:y` - Get pixel at coordinates
- `GET /api/pixels/region/:x/:y/:width/:height` - Get pixel region
- `GET /api/users/me` - Get current user info
- `POST /api/users/username` - Set username

## WebSocket Events

- `place_pixel` - Place a pixel on the canvas
- `pixel_placed` - Broadcast when a pixel is placed
- `subscribe_region` - Subscribe to region updates

## Lambda Deployment (Future)

The backend is designed to be Lambda-compatible. To deploy:

1. Install serverless framework
2. Configure `serverless.yml`
3. Deploy with `serverless deploy`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License