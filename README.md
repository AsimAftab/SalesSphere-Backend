# SalesSphere Backend

A robust Node.js backend API for SalesSphere - a sales management system built with Express.js and MongoDB.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Project](#running-the-project)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Technologies Used](#technologies-used)
- [Features](#features)

## 🔧 Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js) or **yarn**
- **MongoDB** - Either:
  - MongoDB installed locally, or
  - MongoDB Atlas account (cloud database) - [Sign up here](https://www.mongodb.com/cloud/atlas)
- **Git** - [Download here](https://git-scm.com/)

## 📦 Installation

1. **Clone the repository**

```bash
git clone https://github.com/AsimAftab/SalesSphere-Backend.git
cd SalesSphere-Backend
```

2. **Install dependencies**

```bash
npm install
```

This will install all the required packages listed in `package.json`, including:
- express
- mongoose
- cors
- helmet
- morgan
- dotenv
- and other dependencies

## 🔐 Environment Variables

1. **Create a `.env` file** in the root directory of the project:

```bash
touch .env
```

2. **Add the following environment variables** to your `.env` file:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Configuration
# For local MongoDB
MONGO_URI_LOCAL=mongodb://localhost:27017/salessphere

# For MongoDB Atlas (Cloud)
MONGO_URI_CLOUD=mongodb+srv://<username>:<password>@cluster.mongodb.net/salessphere?retryWrites=true&w=majority

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here_make_it_long_and_secure
JWT_EXPIRE=30d
```

3. **Configure your environment**:

   - **For local development**: Set `NODE_ENV=local_development` to use local MongoDB
   - **For cloud development**: Set `NODE_ENV=development` to use MongoDB Atlas
   - Replace `<username>` and `<password>` in `MONGO_URI_CLOUD` with your MongoDB Atlas credentials
   - Generate a strong `JWT_SECRET` for production (you can use a random string generator)

## 🚀 Running the Project

### Development Mode (with nodemon - auto-restart on file changes)

```bash
npm run dev
```

This will start the server in development mode using MongoDB Atlas (cloud).

### Local Development Mode (with local MongoDB)

```bash
npm run dev:local
```

This will start the server in local development mode using your local MongoDB instance.

### Production Mode

```bash
npm start
```

This will start the server in production mode.

## 📂 Project Structure

```
SalesSphere-Backend/
├── src/
│   ├── api/                    # API modules
│   │   ├── auth/              # Authentication routes and controllers
│   │   ├── clients/           # Client management
│   │   └── users/             # User management
│   ├── config/                # Configuration files
│   │   └── config.js          # Database configuration
│   ├── middlewares/           # Custom middlewares
│   │   ├── auth.middleware.js # Authentication middleware
│   │   └── error.handler.js   # Error handling middleware
│   └── utils/                 # Utility functions
├── app.js                     # Express app configuration
├── server.js                  # Server entry point
├── package.json               # Project dependencies
├── .env                       # Environment variables (create this)
└── README.md                  # This file
```

## 🔌 API Endpoints

### Health Check

- `GET /health` - Health check endpoint

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user

### Users

- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Clients

- `GET /api/clients` - Get all clients
- `GET /api/clients/:id` - Get client by ID
- `POST /api/clients` - Create new client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client

## 🛠️ Technologies Used

- **Node.js** - JavaScript runtime
- **Express.js** - Web framework
- **MongoDB** - NoSQL database
- **Mongoose** - MongoDB object modeling
- **JWT** - JSON Web Tokens for authentication
- **Morgan** - HTTP request logger
- **Helmet** - Security middleware
- **CORS** - Cross-Origin Resource Sharing
- **Nodemon** - Development auto-restart tool
- **dotenv** - Environment variable management

## ✨ Features

- **RESTful API** - Clean and organized API structure
- **Authentication & Authorization** - JWT-based authentication
- **Client Management** - Full CRUD operations for clients
- **User Management** - User administration
- **Error Handling** - Centralized error handling middleware
- **Security** - Helmet for security headers, JWT authentication
- **Logging** - HTTP request logging with Morgan
- **Health Check** - Server health monitoring endpoint
- **Database Flexibility** - Support for both local and cloud MongoDB
- **Environment-based Configuration** - Different settings for development and production

## 📝 Additional Notes

### First Time Setup

1. Make sure MongoDB is running (if using local MongoDB):
   ```bash
   # On macOS (with Homebrew)
   brew services start mongodb-community
   
   # On Ubuntu/Debian
   sudo systemctl start mongod
   
   # On Windows
   # Start MongoDB as a service or run mongod.exe
   ```

2. Verify the server is running by visiting: `http://localhost:5000/health`

3. The API should respond with a health check status.

### Troubleshooting

- **Port already in use**: Change the `PORT` in your `.env` file
- **MongoDB connection error**: Check your MongoDB URI and ensure MongoDB is running
- **Module not found**: Run `npm install` again
- **JWT errors**: Ensure `JWT_SECRET` is set in your `.env` file

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

ISC

## 👤 Author

AsimAftab

---

For questions or issues, please open an issue on GitHub.
