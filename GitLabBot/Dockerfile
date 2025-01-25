# Образ builder ноды
FROM node:18.17.1 as builder

# Исходники
WORKDIR /app
COPY ./gitlab_bot.js .
COPY package.json .
COPY package-lock.json .

# Зависимости
RUN npm i
RUN npm i -g pkg

# Компиляция
RUN pkg gitlab_bot.js -o gitlab_bot
RUN chmod 777 /app/gitlab_bot

# ------------------------------------------------
# Образ основной
FROM ubuntu:22.04

ENV TZ="Europe/Moscow"
RUN apt-get update && \
    apt-get install -yq tzdata && \
    ln -fs /usr/share/zoneinfo/$TZ /etc/localtime && \
    dpkg-reconfigure -f noninteractive tzdata

# Заводим юзера pi
RUN useradd -m pi

ENV container="docker"
# переменная окружения по-умолчанию, может быть переопределена в команде
ARG ENV CURRENT_DIR=/home/pi/GitLabBot
ENV ENV CURRENT_DIR=$ENV CURRENT_DIR

# Копируем исполнимый gitlab_bot из верхнего образа в основной
WORKDIR /home/pi
COPY --from=builder /app/gitlab_bot .
USER pi
CMD ["./gitlab_bot"]