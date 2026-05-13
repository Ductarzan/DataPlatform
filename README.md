# CRM Dashboard Web App (Node.js)

Website Node.js m?i hoàn toàn, d?c d? li?u realtime t? Google Sheet CRM và hi?n th? dashboard:
- KPI t?ng quan: t?ng lead, hôm nay, hôm qua, tu?n này, tháng này
- Bi?u d? lead theo ngày và theo tu?n
- B?ng phân tích theo tình tr?ng liên h?, CB cham sóc, ngành h?c quan tâm
- Auto refresh m?i 60 giây

## 1) Cài d?t

```bash
npm install
```

## 2) C?u hình môi tru?ng

Sao chép file m?u:

```bash
cp .env.example .env
```

Ði?n trong `.env`:
- `GOOGLE_SHEET_ID`: id sheet CRM
- `GOOGLE_SHEET_NAME`: tên tab (m?c d?nh `CRM`)
- `GOOGLE_SHEET_RANGE`: vùng d? li?u g?m hàng header + data (m?c d?nh `A4:O`)
- `GOOGLE_SERVICE_ACCOUNT_JSON`: JSON m?t dòng c?a service account

Ho?c dùng file key local v?i bi?n:
- `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`

## 3) Quy?n truy c?p Google Sheet

Chia s? Google Sheet cho email service account (quy?n Viewer).

## 4) Ch?y local

```bash
npm run dev
```

M? [http://localhost:3000](http://localhost:3000)

## 5) API

- `GET /api/health`
- `GET /api/dashboard?days=30`

## 6) Deploy

Deploy du?c lên Render/Railway/Fly.io/VPS.
Ch? c?n set bi?n môi tru?ng gi?ng `.env` trên platform.