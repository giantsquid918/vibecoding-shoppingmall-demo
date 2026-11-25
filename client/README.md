# Shoppingmall client

React client built with Vite.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Start developing

```bash
npm install
npm run dev
```

Vite starts the client at `http://localhost:5173`. Start the API server separately from the `server` folder with `npm run dev`. Requests beginning with `/api` are proxied to `http://127.0.0.1:5000`.

The home page links to `/signup`. The signup form submits `POST /api/users`; make sure the API server and MongoDB are running. New signups are created as `customer` users.

On the home page, 추천상품 toggles the product list between its normal order
and best-selling order. The top three products with sales are marked with their
overall rank, even when the list is filtered by search.
The category buttons filter the list alongside search and best-selling order;
select the active category again to show all categories.

## PortOne checkout

The checkout page initializes PortOne with store ID `imp08400369` and uses
`html5_inicis.INIpayTest` by default. To use a different PortOne PG/channel,
set `VITE_PORTONE_PG` in the client `.env` file and restart Vite. The server
also needs `PORTONE_API_KEY` and `PORTONE_API_SECRET`; configure those only in
`server/.env` (see the server README). Never put the API secret in client
environment variables.

## Cloudinary product images

Create an **unsigned upload preset** in Cloudinary, copy `.env.example` to
`.env`, then set `VITE_CLOUDINARY_CLOUD_NAME` and
`VITE_CLOUDINARY_UPLOAD_PRESET`. Restart Vite after changing the environment
file. The product form uploads images through the Cloudinary widget, previews
the returned secure URL, and saves that URL with the product. Do not put a
Cloudinary API secret in client environment variables.

Administrators can use 상품 수정 or 상품 삭제 on the dashboard to open the
product list. Select 수정 to edit a product's details or image, or use the
delete button and confirm to remove it. Product IDs cannot be changed in the
edit form; existing order records retain their original product details.

## Available scripts

- `npm run dev`: start the development server
- `npm run build`: create a production build in `dist`
- `npm run preview`: preview the production build locally
- `npm run lint`: check the source with Oxlint
