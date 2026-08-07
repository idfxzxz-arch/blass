FROM node:20-bullseye-slim

# Install dependensi OS yang dibutuhkan oleh Chromium/Puppeteer (whatsapp-web.js)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    libgconf-2-4 \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    fonts-liberation \
    libappindicator3-1 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy semua file project
COPY . .

# Build Vite frontend
RUN npm run build

# Expose port (Render otomatis memberikan port lewat ENV PORT)
EXPOSE 5000

# Start script
CMD ["npm", "start"]
