FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install

# Copy server code
COPY server.js ./

# Copy static assets
COPY invoice/ ./invoice/
COPY mainpage/ ./mainpage/
COPY englishangel/ ./englishangel/

# Expose port 80
EXPOSE 80

# Volume for persistent data
VOLUME /data

# Start the server
CMD [ "npm", "start" ]
