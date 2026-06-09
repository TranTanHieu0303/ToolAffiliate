FROM node:20-alpine

# Cài đặt Chromium và các thư viện cần thiết cho Puppeteer chạy trên Alpine (Hỗ trợ tốt ARM64)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Cấu hình biến môi trường cho Puppeteer biết vị trí Chromium của hệ thống
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Sao chép file package trước để tận dụng cache của Docker tầng node_modules
COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

# Sao chép toàn bộ mã nguồn backend
COPY . .

# Build TypeScript sang JavaScript
RUN npm run build

# Chạy Prisma Generate để tạo Client tương thích với Postgres
RUN npx prisma generate

EXPOSE 5001

# Lệnh khởi chạy production (đảm bảo thực hiện deploy/migration DB trước khi chạy app)
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]