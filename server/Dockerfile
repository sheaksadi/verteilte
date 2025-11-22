FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 6900

CMD ["sh", "-c", "npm run build && npm start"]
