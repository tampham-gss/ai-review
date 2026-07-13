# AI Review Validator

Ứng dụng Next.js full-stack kiểm tra review comment trên GitLab MR bằng AI.

## Tính năng MVP

- **Auth**: Email/password + GitLab.com OAuth
- **GitLab**: gitlab.com + self-hosted (PAT) — ví dụ [gitlab.gss-sol.com](https://gitlab.gss-sol.com/)
- **MR comments**: Lấy tất cả comment **chưa resolved**
- **Source**: Ưu tiên GitLab API; kéo thả ZIP (có cảnh báo)
- **Convention**: Upload/quản lý file `.md` theo level
- **AI multi-provider**: OpenAI, Anthropic, Gemini — auto failover khi hết token limit
- **Validate**: VALID / INVALID / PARTIAL — reply tiếng Việt
- **Fix VALID**: Gộp tất cả fix vào **1 source ZIP** duy nhất
- **Push**: Preview kết quả → push reply lên đúng GitLab discussion

## Tech stack

- Next.js 16 (App Router) — FE + BE chung
- Prisma + PostgreSQL
- NextAuth (Auth.js v5)
- Tailwind CSS 4 + UI components tùy chỉnh

## Cài đặt local

```bash
cp .env.example .env
# Điền DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY

npm install
npm run db:push
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000)

## GitLab nội bộ (LDAP)

Instance self-hosted thường không hỗ trợ OAuth cho app bên thứ ba. Dùng **Personal Access Token**:

1. Đăng nhập app → **Connect GitLab**
2. Host: `https://gitlab.gss-sol.com`
3. Tạo PAT: User Settings → Access Tokens
4. Scopes: `api`, `read_api`, `read_repository`
5. Dán token — được mã hóa AES-256-GCM khi lưu DB

## Deploy Vercel

1. Tạo project trên Vercel, connect repo
2. Thêm env vars từ `.env.example`
3. Database: dùng [Neon](https://neon.tech) hoặc Vercel Postgres
4. Chạy `npx prisma db push` sau deploy lần đầu
5. **Lưu ý**: Upload ZIP lớn có thể vượt giới hạn body Vercel (4.5MB) — ưu tiên GitLab API

## Luồng sử dụng

1. Đăng ký / đăng nhập
2. Connect GitLab (PAT cho nội bộ)
3. Cấu hình AI providers + convention rules
4. **Reviews** → chọn project, MR, convention
5. Chạy validate → xem kết quả từng comment
6. **INVALID** → Push lý do (từng comment hoặc tất cả)
7. **VALID** → AI fix (gộp 1 source) → tải ZIP + push reply lên GitLab

## Cấu trúc thư mục

```
src/
  app/
    (dashboard)/     # Các trang sau login
    api/             # API routes
  components/        # UI + layout
  lib/
    ai/              # Multi-provider AI
    gitlab/          # GitLab API client
    source/          # ZIP handling
```

## Roadmap

- [ ] Re-run chỉ comment chưa có kết quả / chưa resolved mới
- [ ] Preview reply trước khi push (modal)
- [ ] Parser MR-Agent comment nâng cao
- [ ] Vercel Blob cho ZIP lớn
- [ ] Team workspace & shared conventions
