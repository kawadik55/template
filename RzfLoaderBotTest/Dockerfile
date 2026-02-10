# Образ builder ноды
FROM node:18.17.1 as builder

# Исходники
WORKDIR /app
COPY ./Bot/rzf_loader_bot.js ./Bot/TelegramQueue.js ./Bot/Slave_bot.js package.json package-lock.json ./

# Зависимости
RUN npm i
RUN npm i -g pkg

# Компиляция
RUN pkg rzf_loader_bot.js -o rzf_loader_bot

# ------------------------------------------------
# Образ основной
FROM ubuntu:22.04

ENV TZ="Europe/Moscow"
RUN apt-get update && \
    apt-get install -yq tzdata && \
    ln -fs /usr/share/zoneinfo/$TZ /etc/localtime && \
    dpkg-reconfigure -f noninteractive tzdata

# Создаем папку без юзера
RUN mkdir -p /home/pi
# Копируем бинарник
COPY --from=builder /app/rzf_loader_bot /home/pi/rzf_loader_bot
# Даем права на бинарник всем пользователям
RUN chmod 755 /home/pi/rzf_loader_bot

ENV container="docker"
# переменная окружения по-умолчанию, может быть переопределена в команде
ARG ENV CURRENT_DIR=/home/pi/RzfLoaderBotTest
ENV ENV CURRENT_DIR=$ENV CURRENT_DIR

# Копируем нужные файлы в основной образ
WORKDIR /home/pi
COPY ./Bot/ ./context/Bot/
RUN chmod -R 755 ./context/Bot/
CMD ["./rzf_loader_bot"]
