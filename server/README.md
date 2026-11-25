# Shoppingmall server

Node.js, Express, and MongoDB (Mongoose) starter server.

## Requirements

- Node.js 20 or later
- A running MongoDB instance

## Setup

```bash
npm install
npm run dev
```

The server uses the `MONGODB_ATLAS_URL` environment variable for its MongoDB connection string. If it is unset or blank, the server falls back to `mongodb://127.0.0.1:27017/shoppingmall`. Set `MONGODB_ATLAS_URL` in the deployment environment to use Atlas.
Create a local `.env` file and generate a private key in PowerShell (from the `server` directory):

```powershell
$secret = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
Set-Content .env "JWT_SECRET=$secret"
npm run dev
```

The server loads `.env` automatically, and `.env` is ignored by Git and marked read-only in the VS Code workspace. Keep the generated secret private. The server listens on port `5000` by default and prints `MongoDB 연결 성공` after connecting to the database.

To run without file watching:

```bash
npm start
```

The health endpoint is `GET /api/health`.

## User model

The Mongoose model is in `models/User.js`. It requires `email`, `username`, `password`, `user_type`, and `address`; `nickname` is optional. `user_type` currently accepts `customer` or `admin`.

The schema automatically adds `createdAt` and `updatedAt`. Passwords are hashed with bcrypt before saving and excluded from query results by default. To verify a password, query the user with `.select('+password')` and call `user.comparePassword(plainTextPassword)`.

## User CRUD API

The router in `routes/userRoutes.js` is mounted at `/api/users`. CRUD logic is in `controllers/userController.js`:

- `POST /api/users` — create a user
- `POST /api/users/login` — log in and receive a one-hour JWT access token
- `GET /api/users/me` — get the authenticated user's profile
- `PATCH /api/users/me/password` — change the authenticated user's password after verifying the current password
- `DELETE /api/users/me` — withdraw the authenticated user's account after password confirmation
- `GET /api/users` — list users (admin token required)
- `GET /api/users/:id` — get one user (owner or admin token required)
- `PATCH /api/users/:id` — update profile fields (owner or admin token required; account email and password cannot be changed here)
- `DELETE /api/users/:id` — delete another user (admin token required)

Send JSON with the user fields in the schema. Include `Authorization: Bearer <token>` when calling protected routes. Public registration always creates a `customer`; changing `user_type` through registration or profile updates is not allowed. Passwords are never included in API responses. Password changes require the current password and a new password with at least eight characters, including a letter, number, and special character. Withdrawal and administrator deletion are blocked while an account has a pending, preparing, or shipped order; completed/cancelled order records are retained with customer and shipping details anonymized, and the user's cart is removed. Validation failures return `400`, active orders return `409`, duplicate emails return `409`, missing users return `404`, and invalid or missing access tokens return `401`.

The token signing key must be configured before the server starts. Tokens use HS256 and expire after one hour.

## Product API

Product routes are mounted at `/api/products`. Product reads are public; creating,
updating, and deleting products require an admin access token.

- `GET /api/products` — list products
- `GET /api/products?sort=best-selling` — list products by quantity sold, with
  `salesRank` for the top three products with sales
- `GET /api/products/:productId` — get one product
- `POST /api/products` — create a product (admin token required; multipart image upload supported)
- `PATCH /api/products/:productId` — update product fields
- `DELETE /api/products/:productId` — delete a product

Create and update requests accept `productId`, `name`, `price`, `category`,
`image`, and optional `description`. Categories are `상의`, `하의`, and
`악세사리`. The `image` value is an image URL or storage path. The client
uploads images to Cloudinary and stores the returned secure URL in this field.
Product IDs are unique; duplicate IDs return `409 Conflict`.
Best-selling quantities include paid orders except cancelled fulfillment; pending,
failed, cancelled, and refunded payments are excluded. Sales are associated with
the original product record, and ties follow newest product creation time (then
database ID). Products with no sales appear last without a rank.

## PortOne checkout

Authenticated order creation and payment verification are mounted at
`/api/orders`. `POST /api/orders/preflight` checks for a matching unfinished
order and reconciles its PortOne status before a new order is created. The
create endpoint also rejects a duplicate cart while an earlier matching order
is pending. Configure `PORTONE_API_KEY` and `PORTONE_API_SECRET` in the
server `.env` file before using checkout. These credentials are used only by
the server to verify payments with PortOne; do not expose them to the client.
The client uses store ID `imp08400369` and defaults to the test PG
`html5_inicis.INIpayTest`. Set `VITE_PORTONE_PG` in the client environment to
the PG/channel configured in your PortOne account when changing that default.

## Admin dashboard

`GET /api/admin/dashboard` returns the total order, product, and customer counts
plus revenue summed from paid orders. An admin access token is required.
