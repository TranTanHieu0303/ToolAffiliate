# Stage 1: Build static files
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve với Nginx
FROM nginx:alpine
# Copy kết quả build từ stage trước vào thư mục public của Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Cấu hình Nginx để hỗ trợ Single Page Application (React Router) nếu có
RUN echo 'server { \
    listen 3000; \
    location / { \
    root /usr/share/nginx/html; \
    index index.html index.htm; \
    try_files $uri $uri/ /index.html; \
    } \
    }' > /etc/nginx/conf.conf

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]