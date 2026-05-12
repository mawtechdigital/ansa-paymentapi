# Payment API

Payment gateway API with Revenue Monster (FPX) integration for motor insurance payments.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment files
cp .env.example .env.sandbox    # for sandbox testing
cp .env.example .env            # for production

# 3. Update .env.sandbox with your RM sandbox credentials

# 4. Place your RSA private key file in project root
#    (the one matching the public key uploaded to RM portal)

# 5. Create database
createdb payment_db

# 6. Run migration
npm run migration:run

# 7. Start server (sandbox mode with hot reload)
npm run start:sandbox
```

## NPM Scripts

| Command | Description |
|---|---|
| `npm run start:sandbox` | Start with **sandbox** RM URLs + hot reload |
| `npm run start:dev` | Alias for start:sandbox |
| `npm run start` | Start with **production** RM URLs |
| `npm run start:prod` | Production build (from dist/) |
| `npm run build` | Build to dist/ |
| `npm run migration:run` | Run pending migrations |
| `npm run migration:revert` | Revert last migration |

## API Endpoints

### 1. Initiate Payment
```
POST /api/payment/initiate
```

### 2. RM Callback (notifyUrl)
```
POST /api/payment/rm-callback
```

### 3. Check Payment Status
```
GET /api/payment/status/:orderId
```

## Environment Switching

- `npm run start:sandbox` → loads `.env.sandbox` → uses `sb-oauth.revenuemonster.my` / `sb-open.revenuemonster.my`
- `npm run start` → loads `.env` → uses `oauth.revenuemonster.my` / `open.revenuemonster.my`

RM URLs are hardcoded per environment in `revenue-monster.service.ts` — no need to set them in `.env`.

## Decrypt Document Numbers

```bash
node decrypt-document.mjs
```

Paste the encrypted value from DB + your ENCRYPTION_SECRET_KEY to get the original document number.
