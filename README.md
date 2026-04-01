# Central-kitchen-khulna-product-db-admin

MongoDB-backed product management system for Central Kitchen Khulna. The app manages suppliers, inventory, sales, and stock adjustments from a simple Node.js server with static frontend pages.

## Production Setup

Create a local `.env` file from `.env.example` and set:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=3000`
- `MONGODB_DB_NAME=centeral-kitchen`
- `MONGODB_URI=your full MongoDB Atlas connection string`

The repository keeps `.env` out of git. Put real secrets only in your local or deployment environment.

## Run

```powershell
npm.cmd install
npm.cmd start
```

Open `http://127.0.0.1:3000` locally.

## Health Checks

- `GET /api/health`
- `GET /healthz`
- `GET /readyz`

## Data Bootstrapping

On first startup the app will:

1. Migrate `data/product-management.db` if it exists.
2. Otherwise seed from CSV files.

Default CSV lookup order:

1. `Product maangement/data`
2. `Product maangement/public`
3. the legacy parent `public` folder used in the current workspace

You can override those paths with:

- `KITCHEN_CSV_PATH`
- `SUPPLIER_CSV_PATH`

## Available Pages

- `/`
- `/overview`
- `/suppliers`
- `/inventory`
- `/sales`
