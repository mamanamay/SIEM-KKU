FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache python3 make g++
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build
EXPOSE 5000
CMD ["npm", "run", "start:prod"]
