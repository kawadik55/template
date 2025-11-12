# Образ builder ноды
FROM node:18.17.1 as builder

# Исходники
WORKDIR /app
COPY ./Bot/creator_bot.js ./Bot/TelegramQueue.js package.json ./

# Зависимости
RUN npm i
RUN npm i -g pkg

# Проверь что geo-tz файлы на месте
RUN find node_modules/geo-tz/data/ -name "*.dat" | head -5

# Компиляция
RUN pkg creator_bot.js -o creator_bot --assets "node_modules/geo-tz/data/**/*"

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
COPY --from=builder /app/creator_bot /home/pi/creator_bot
# Даем права на бинарник всем пользователям
RUN chmod 755 /home/pi/creator_bot
# Копируем гео дату
#COPY --from=builder /app/node_modules/geo-tz/data/ /home/pi/node_modules/geo-tz/data/
#RUN chmod -R 755 /home/pi/node_modules/geo-tz/data/

ENV container="docker"
# переменная окружения по-умолчанию, может быть переопределена в команде
ARG ENV CURRENT_DIR=/home/pi/creator/Bot
ENV ENV CURRENT_DIR=$ENV CURRENT_DIR

# Копируем нужные файлы в основной образ
WORKDIR /home/pi
COPY ./Bot/ ./context/Bot/
RUN chmod -R 755 ./context/Bot/
CMD ["./creator_bot"]
