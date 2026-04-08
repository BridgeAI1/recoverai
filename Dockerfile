FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application
COPY . .
RUN mkdir -p data /tmp/recoverai-uploads

# Expose port (Render uses PORT env var)
ENV PORT=3002
EXPOSE 3002

# Start application
CMD ["node", "server.js"]
