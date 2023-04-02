FROM node
ENV FIRST_RUN_AGE=63072000

WORKDIR /usr/src/app
COPY . .
RUN yarn install && yarn cache clean
RUN npx tsc
CMD [ "node", "index.js" ]