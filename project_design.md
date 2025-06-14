# Project Design: EmojiPlace

This document outlines the system design for EmojiPlace, a collaborative emoji canvas application.

## 1. System Design Diagram

```mermaid
graph TD
    subgraph "User's Browser"
        Frontend[("Next.js Client Application")]
    end

    subgraph "AWS Cloud"
        subgraph "Networking & Edge"
            APIGW_WS["API Gateway WebSocket API"]
            APIGW_HTTP["API Gateway HTTP API"]
            CloudFront["CloudFront CDN"]
        end

        subgraph "Compute (Lambda)"
            Connect["handleConnect"]
            Disconnect["handleDisconnect"]
            MessageHandler["handleMessage"]
            GetRegion["getPixelRegion"]
        end

        subgraph "Database (DynamoDB)"
            ConnectionsTable[("Connections Table")]
            CooldownTable[("Cooldown Table")]
            PixelTable[("Pixel Table")]
        end

        subgraph "Storage"
            S3["S3 Bucket for Canvas Chunks"]
        end
    end

    %% Frontend to AWS
    Frontend -- "1. GET /api/pixels/region/{x}/{y}" --> APIGW_HTTP
    Frontend -- "3. WebSocket CONNECT" --> APIGW_WS
    Frontend -- "5. place_pixel message" --> APIGW_WS
    Frontend -- "10. GET chunk URL" --> CloudFront

    %% API Gateway to Lambda
    APIGW_HTTP -- "2. Invokes" --> GetRegion
    APIGW_WS -- "4. $connect route" --> Connect
    APIGW_WS -- "$disconnect route" --> Disconnect
    APIGW_WS -- "6. $default route" --> MessageHandler

    %% Lambda to Services
    GetRegion -- "Returns CloudFront URL" --> Frontend
    Connect -- "Writes connectionId" --> ConnectionsTable
    Disconnect -- "Deletes connectionId" --> ConnectionsTable
    
    MessageHandler -- "7a. Checks cooldown" --> CooldownTable
    MessageHandler -- "7b. Writes pixel data" --> PixelTable
    MessageHandler -- "7c. Updates chunk file" --> S3
    MessageHandler -- "7d. Sets new cooldown" --> CooldownTable
    MessageHandler -- "8. Gets all connections" --> ConnectionsTable
    MessageHandler -- "9. Broadcasts 'pixel_placed'" --> APIGW_WS

    %% CDN to Storage
    CloudFront -- "Origin Request (OAI)" --> S3

    %% Style
    classDef lambda fill:#FF9900,stroke:#000,stroke-width:2px;
    class Connect,Disconnect,MessageHandler,GetRegion lambda;
    classDef db fill:#2E73B8,stroke:#000,stroke-width:2px,color:#fff;
    class ConnectionsTable,CooldownTable,PixelTable db;
    classDef s3 fill:#D53447,stroke:#000,stroke-width:2px,color:#fff;
    class S3 s3;
    classDef edge fill:#7D7C7C,stroke:#000,stroke-width:2px,color:#fff;
    class APIGW_WS,APIGW_HTTP,CloudFront edge;
    classDef client fill:#f9f,stroke:#333,stroke-width:2px
    class Frontend client
```

## 2. Requirements

### Functional Requirements

-   **Infinite Canvas:** The application will provide a seemingly infinite grid where users can place emojis.
-   **Pixel Placement:** Users can select an emoji and place it at specific coordinates on the canvas.
-   **Cooldown Mechanism:** To prevent spam, each user will have a mandatory cooldown period between placing emojis.
-   **Real-time Updates:** Any emoji placed on the canvas will appear for all other connected users in real-time.
-   **Canvas Navigation:** Users can pan across the canvas to view different areas.
-   **Efficient Loading:** The canvas, even when large and populated, should load efficiently for users.
-   **User Identification:** Users are tracked based on their IP address to manage cooldowns.

### Non-Functional Requirements

-   **Scalability:** The system must be able to handle a large number of concurrent users and a canvas that grows to a massive size. The serverless architecture is designed to scale automatically with demand.
-   **High Availability:** The application should be highly available and resilient to failures. Leveraging managed AWS services (S3, DynamoDB, Lambda) provides inherent fault tolerance.
-   **Low Latency:** Real-time emoji placements should be broadcasted to clients with minimal delay. Canvas data should also be delivered quickly to users.
-   **Cost-Effectiveness:** The infrastructure should be optimized for cost, primarily using pay-per-request and pay-as-you-go services.
-   **Security:** Backend resources, particularly the S3 bucket containing canvas data, must be secured from unauthorized public access.

## 3. High-Level Design

The application is architected with a decoupled frontend and backend.

-   **Frontend:** A Next.js single-page application that serves as the user interface. It uses the HTML Canvas API for efficient rendering of the emoji grid. It establishes a WebSocket connection for real-time communication and uses a standard HTTP API for other interactions. Large canvas data ("chunks") are fetched directly and efficiently from a Content Delivery Network (CloudFront).

-   **Backend:** A serverless architecture hosted on AWS, defined by the following components:
    -   **API Gateway:** Manages both HTTP and WebSocket connections, acting as the primary entry point to the backend.
    -   **AWS Lambda:** Contains the core business logic in the form of event-driven functions. These functions handle WebSocket lifecycle events (connect, disconnect), process incoming messages (like placing a pixel), and manage data retrieval.
    -   **DynamoDB:** A NoSQL database used for storing application state. It is partitioned into three tables: one for individual pixel data, one for managing active WebSocket connections, and another for tracking user cooldowns.
    -   **S3 (Simple Storage Service):** The canvas is broken down into "chunks" that are stored as objects in an S3 bucket. This optimizes the process of fetching and rendering large sections of the canvas.
    -   **CloudFront:** A global CDN that sits in front of the S3 bucket. It caches the canvas chunks at edge locations closer to users, ensuring low-latency delivery of canvas data and reducing load on the S3 bucket.

## 4. System Components & Logic

### Canvas Rendering and "Chunks"

To handle a potentially infinite canvas, the frontend only renders the portion visible to the user. The backend divides the entire canvas grid into fixed-size regions called "chunks." When a user pans to a new area, the frontend calculates which chunks are required for the new viewport. If these chunks aren't already cached in the browser, it requests them from a CloudFront URL.

The `getPixelRegion` Lambda function is responsible for providing the client with the correct URLs to these chunks in CloudFront.

### Pixel Placement Workflow

1.  A user initiates a `place_pixel` action from the client, sending a message over the established WebSocket connection.
2.  API Gateway routes this message to the `messageHandler` Lambda function.
3.  The Lambda function first queries the `CooldownTable` in DynamoDB to verify if the user is permitted to place a pixel.
4.  If the user is not on cooldown, the function proceeds to:
    a.  Update the specific pixel's data in the `PixelTable`.
    b.  Update the corresponding S3 object (the "chunk") that contains this pixel.
    c.  Broadcast a `pixel_placed` message to all connected clients via the WebSocket API (using the connection IDs stored in the `ConnectionsTable`).
    d.  Record the new placement time for the user in the `CooldownTable`.
5.  If the user is on cooldown, the request is ignored, or an error message is sent back to the user.

### Real-time Communication

Real-time updates are managed through API Gateway's WebSocket support. The `ConnectionsTable` in DynamoDB maintains a record of all currently active client connections. When a pixel is successfully placed, the backend Lambda function iterates through the connection IDs in this table and pushes the update to each client. 