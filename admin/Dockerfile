FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Expose port (Vite default)
EXPOSE 5173

# Dev command
CMD ["npm", "run", "dev", "--", "--host"]
