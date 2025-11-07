#!/bin/bash
# Если передан HOST_UID, меняем UID пользователя pi
if [ -n "$HOST_UID" ] && [ "$HOST_UID" != "1000" ]; then
    usermod -u $HOST_UID pi
    groupmod -g $HOST_UID pi
    chown -R pi:pi /home/pi
fi

# Переключаемся на пользователя pi и запускаем бинарник
# exec su - pi -c "$@"
exec setuidgid pi "$@"
