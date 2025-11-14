FROM node:22-alpine

WORKDIR /app

# Copy application code
COPY server.js ./

# Create data directory for SQLite database
RUN mkdir -p /data

EXPOSE 80

CMD ["node", "--experimental-sqlite", "server.js"]
