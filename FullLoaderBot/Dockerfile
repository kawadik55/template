# Образ builder ноды
FROM node:18.17.1 as builder

# Исходники
WORKDIR /app
COPY ./Bot/full_loader_bot.js ./../TelegramQueue/TelegramQueue.js package.json package-lock.json ./

# Зависимости
RUN npm i
RUN npm i -g pkg

# Компиляция
RUN pkg full_loader_bot.js -o full_loader_bot
RUN chmod 777 /app/full_loader_bot

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
USER pi

ENV container="docker"
# переменная окружения по-умолчанию, может быть переопределена в команде
ARG ENV CURRENT_DIR=/home/pi/FullLoaderBot
ENV ENV CURRENT_DIR=$ENV CURRENT_DIR

# Копируем исполнимый файл из верхнего образа в основной
WORKDIR /home/pi
COPY --from=builder /app/full_loader_bot .
COPY ./Bot/ ./context/Bot/
CMD ["./full_loader_bot"]
