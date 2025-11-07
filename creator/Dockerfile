# Образ builder ноды
FROM node:18.17.1 as builder

# Исходники
WORKDIR /app
COPY ./Bot/creator_bot.js ./Bot/TelegramQueue.js package.json package-lock.json ./

# Зависимости
RUN npm i
RUN npm i -g pkg

# Компиляция
RUN pkg creator_bot.js -o creator_bot
#RUN chmod 777 /app/creator_bot

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
# Копируем бинарник ДО смены пользователя
COPY --from=builder /app/creator_bot /home/pi/creator_bot
# Даем права на бинарник всем пользователям
RUN chmod 755 /home/pi/creator_bot
# Теперь переключаемся на пользователя pi
USER pi

ENV container="docker"
# переменная окружения по-умолчанию, может быть переопределена в команде
ARG ENV CURRENT_DIR=/home/pi/creator/Bot
ENV ENV CURRENT_DIR=$ENV CURRENT_DIR

# Копируем нужные файлы в основной образ
WORKDIR /home/pi
COPY ./Bot/ ./context/Bot/
#COPY ./Token/ ./context/Token/
CMD ["./creator_bot"]
