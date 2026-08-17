FROM node:20-alpine

WORKDIR /app

COPY attacker.js .
COPY scenarios.json .

# node:20-alpine มี fetch built-in แล้ว ไม่ต้องติดตั้ง package เพิ่ม
CMD ["node", "attacker.js"]
