# Образ builder ноды
FROM node:18.17.1 as builder

# Исходники, контекст изменен в команде запуска
WORKDIR /app
COPY ./user/ParserXls/parserxls.js .

COPY ./Docker/user/ParserXls/package.json .
COPY ./Docker/user/ParserXls/package-lock.json .

# Зависимости
RUN npm i
RUN npm i -g pkg

# Компиляция
RUN pkg parserxls.js -o parserxls
RUN chmod 777 /app/parserxls

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
ARG ENV CURRENT_DIR=/home/pi/js/telegram/naufa/user/ParserXls
ENV ENV CURRENT_DIR=$ENV CURRENT_DIR

# Копируем исполнимый файл из верхнего образа в основной
WORKDIR /home/pi
COPY --from=builder /app/parserxls .
USER pi
CMD ["./parserxls"]