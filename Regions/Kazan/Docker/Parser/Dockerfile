# Образ builder ноды
FROM node:18.17.1 as builder

# Исходники, контекст изменен в команде запуска
WORKDIR /app
COPY ./Parser/parser.js .

COPY ./Docker/Parser/package.json .
COPY ./Docker/Parser/package-lock.json .

# Зависимости
RUN npm i
RUN npm i -g pkg

# Компиляция
RUN pkg parser.js -o parser
RUN chmod 777 /app/parser

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
# переменная окружения по-умолчанию, может быть переопределна в команде
ARG ENV CURRENT_DIR=/home/pi/js/telegram/nakazan/Parser
ENV ENV CURRENT_DIR=$ENV CURRENT_DIR

# Копируем исполнимый файл из верхнего образа в основной
WORKDIR /home/pi
COPY --from=builder /app/parser .
USER pi
CMD ["./parser"]