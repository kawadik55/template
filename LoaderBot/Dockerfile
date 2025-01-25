# Образ builder ноды
FROM node:18.17.1 as builder

# Исходники
WORKDIR /app
COPY ./Bot/loader_bot.js package.json package-lock.json ./

# Зависимости
RUN npm i
RUN npm i -g pkg

# Компиляция
RUN pkg loader_bot.js -o loader_bot
RUN chmod 777 /app/loader_bot

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
ARG ENV CURRENT_DIR=/home/pi/LoaderBot
ENV ENV CURRENT_DIR=$ENV CURRENT_DIR

# Копируем исполнимый creator_bot из верхнего образа в основной
WORKDIR /home/pi
COPY --from=builder /app/loader_bot .
COPY ./Bot/ ./context/Bot/
COPY ./Token/ ./context/Token/
CMD ["./loader_bot"]