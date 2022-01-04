FROM node

WORKDIR /usr/src/app
COPY . .
RUN yarn install
RUN npx tsc
CMD [ "node", "index.js" ]