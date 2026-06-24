FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN npm install --legacy-peer-deps

# Copy source
COPY . .

# Build (optional for dev)
# RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0"]
