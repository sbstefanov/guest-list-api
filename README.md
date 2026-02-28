# Guest List REST API

A Node.js Express REST API for managing a guest list with MySQL database.

## Features

- Create, read, update, and delete guests
- MySQL database with connection pooling
- Input validation and error handling
- Guest status management (invited, confirmed, declined)
- Automatic table creation on startup

## Prerequisites

- Node.js 20.x
- MySQL database (Railway MySQL or any MySQL instance)

## Local Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

3. Update `.env` with your MySQL credentials:
```
MYSQLHOST=localhost
MYSQLUSER=root
MYSQLPASSWORD=your_password
MYSQLDATABASE=guestlist
MYSQLPORT=3306
PORT=3000
```

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### Health Check
```
GET /health
```

### Get All Guests
```
GET /guests
```

### Get Guest by ID
```
GET /guests/:id
```

### Create Guest
```
POST /guests
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "status": "invited"
}
```

### Update Guest
```
PUT /guests/:id
Content-Type: application/json

{
  "name": "Jane Doe",
  "status": "confirmed"
}
```

### Delete Guest
```
DELETE /guests/:id
```

## Railway Deployment

### Step 1: Create Railway Project

1. Go to [Railway](https://railway.app) and sign in
2. Click "New Project"
3. Select "Deploy from GitHub repo" and connect your repository

### Step 2: Add MySQL Database

1. In your Railway project, click "New"
2. Select "Database" → "Add MySQL"
3. Railway will automatically provision a MySQL database and create environment variables

### Step 3: Configure Environment Variables

Railway automatically sets the MySQL variables. You only need to add:

1. Click on your service (not the database)
2. Go to "Variables" tab
3. Add:
   - `PORT` (Railway sets this automatically, but you can verify)

The following are automatically provided by Railway MySQL:
- `MYSQLHOST`
- `MYSQLUSER`
- `MYSQLPASSWORD`
- `MYSQLDATABASE`
- `MYSQLPORT`

### Step 4: Deploy

1. Railway will automatically deploy your application
2. Once deployed, click "Settings" → "Networking" → "Generate Domain"
3. Your API will be available at the generated domain

### Step 5: Verify Deployment

Test your API:
```bash
curl https://your-app.railway.app/health
```

## Database Schema

```sql
CREATE TABLE guests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(120) UNIQUE NOT NULL,
  status ENUM('invited', 'confirmed', 'declined') DEFAULT 'invited',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Error Responses

All errors return JSON with the following format:
```json
{
  "success": false,
  "error": "Error message here"
}
```

## Validation Rules

- **Name**: Required, cannot be empty
- **Email**: Required, must be valid format, must be unique
- **Status**: Optional, must be one of: `invited`, `confirmed`, `declined`

## HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `404` - Not Found
- `409` - Conflict (duplicate email)
- `500` - Internal Server Error
